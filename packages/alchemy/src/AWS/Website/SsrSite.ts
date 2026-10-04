import type * as cloudfront from "@distilled.cloud/aws/cloudfront";
import * as Effect from "effect/Effect";
import type { Input } from "../../Input.ts";
import * as Namespace from "../../Namespace.ts";
import * as Output from "../../Output.ts";
import { Certificate } from "../ACM/Certificate.ts";
import { Distribution } from "../CloudFront/Distribution.ts";
import { Invalidation } from "../CloudFront/Invalidation.ts";
import { KvEntries } from "../CloudFront/KvEntries.ts";
import { KvRoutesUpdate } from "../CloudFront/KvRoutesUpdate.ts";
import {
  MANAGED_ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  MANAGED_CACHING_DISABLED_POLICY_ID,
  MANAGED_CACHING_OPTIMIZED_POLICY_ID,
} from "../CloudFront/ManagedPolicies.ts";
import { OriginAccessControl } from "../CloudFront/OriginAccessControl.ts";
import type { Service } from "../ECS/Service.ts";
import type { PolicyStatement } from "../IAM/Policy.ts";
import { Function } from "../Lambda/Function.ts";
import { Record as Route53Record } from "../Route53/Record.ts";
import { Bucket } from "../S3/Bucket.ts";
import { bind as bindDns, DnsError, Resolver } from "../../DNS/Contract.ts";
import type { ZoneDescriptor } from "../../DNS/Contract.ts";
import { createAcmDnsValidation } from "../ACM/DnsValidation.ts";
import type { AssetFileOption } from "./AssetDeployment.ts";
import { AssetDeployment } from "./AssetDeployment.ts";
import {
  normalizeWebsiteDomain,
  createWebsiteDns,
  websiteCertificateCovers,
  type WebsiteDomainProps,
  type WebsiteRouterDomainProps,
  type SsrSiteRouteTargets,
  type WebsiteInvalidationProps,
  type WebsiteStandaloneDomainProps,
} from "./shared.ts";

/**
 * The dynamic origin CloudFront forwards requests to: a Lambda Function URL,
 * a public ECS Service, or any plain URL.
 */
export type SsrSiteServerOrigin =
  | {
      type: "lambda";
      /**
       * Lambda Function created with `functionUrl` enabled — its function URL
       * becomes the origin.
       */
      function: Function;
      /**
       * Protocol CloudFront uses to reach the origin.
       * @default "https-only"
       */
      originProtocolPolicy?: "https-only";
    }
  | {
      type: "ecs";
      /**
       * ECS Service created with `public: true` — its load balancer URL
       * becomes the origin.
       */
      service: Service;
      /**
       * Protocol CloudFront uses to reach the origin.
       * @default "https-only"
       */
      originProtocolPolicy?: "http-only" | "https-only" | "match-viewer";
    }
  | {
      type: "url";
      /**
       * Origin URL to forward requests to.
       */
      url: Input<string>;
      /**
       * Protocol CloudFront uses to reach the origin.
       * @default "https-only"
       */
      originProtocolPolicy?: cloudfront.OriginProtocolPolicy;
    };

export interface SsrSiteProps {
  /**
   * Dynamic server origin behind CloudFront.
   */
  server: SsrSiteServerOrigin;
  /**
   * Optional custom domain managed through Route 53. A string is shorthand
   * for `{ name }`; `null` explicitly clears a previously set domain.
   */
  domain?: string | WebsiteDomainProps | null;
  /**
   * Optional static asset bundle to serve from S3.
   */
  assets?: {
    /**
     * Local build output directory to upload.
     */
    sourcePath: Input<string>;
    /**
     * Optional deterministic S3 bucket name.
     */
    bucketName?: string;
    /**
     * Optional asset key prefix.
     */
    prefix?: string;
    /**
     * Path pattern that should be served from the asset bucket.
     * @default "/_assets/*"
     */
    pathPattern?: string;
    /**
     * Remove stale files under the prefix.
     * @default false
     */
    purge?: boolean;
    /**
     * Optional file overrides.
     */
    fileOptions?: AssetFileOption[];
  };
  /**
   * CloudFront cache policy ID for the dynamic server route.
   * @default CloudFront managed CachingDisabled
   */
  cachePolicyId?: Input<string>;
  /**
   * Cache invalidation behavior for asset updates.
   * @default false
   */
  invalidate?: false | WebsiteInvalidationProps;
  /**
   * Whether to create a standalone CloudFront distribution for the site.
   * Set this to `false` when the site should be routed through `AWS.Website.Router`.
   * @default true
   */
  cdn?: boolean;
  /**
   * User-defined tags applied to created resources.
   */
  tags?: Record<string, string>;
}

const serverUrlOf = (server: SsrSiteServerOrigin): Input<string> => {
  switch (server.type) {
    case "lambda":
      return Output.map((url: string | undefined) => {
        if (!url) {
          throw new Error(
            "SsrSite lambda origins require a function created with `functionUrl` enabled.",
          );
        }
        return url;
      })(server.function.functionUrl as any) as any;
    case "ecs":
      return Output.map((url: string | undefined) => {
        if (!url) {
          throw new Error(
            "SsrSite ECS origins require a service created with `public: true`.",
          );
        }
        return url;
      })(server.service.url as any) as any;
    case "url":
      return server.url;
  }
};

const serverOriginOf = (server: SsrSiteServerOrigin): Input<string> =>
  Output.map((url: string) => new URL(url).hostname)(
    serverUrlOf(server) as any,
  ) as any;

/**
 * A server-rendered website behind CloudFront.
 *
 * `SsrSite` serves a dynamic origin behind CloudFront and can optionally split
 * immutable static assets into a private S3 bucket origin.
 * ### Creating SSR Sites
 * **Example:** Lambda URL Origin
 * ```typescript
 * const site = yield* SsrSite("App", {
 *   server: {
 *     type: "lambda",
 *     function: appFunction,
 *   },
 * });
 * ```
 *
 * **Example:** SSR With Static Assets
 * ```typescript
 * const site = yield* SsrSite("App", {
 *   server: {
 *     type: "lambda",
 *     function: appFunction,
 *   },
 *   assets: {
 *     sourcePath: "./dist/client",
 *   },
 * });
 * ```
 *
 * ### Custom Domains
 * **Example:** SSR Site With A Route 53 Domain
 * ```typescript
 * const site = yield* SsrSite("App", {
 *   server: {
 *     type: "ecs",
 *     service: webService,
 *   },
 *   domain: {
 *     name: "app.example.com",
 *     hostedZoneId: zone.hostedZoneId,
 *   },
 * });
 * ```
 *
 * ### Router Composition
 * **Example:** Route Through An Existing Router
 * ```typescript
 * // Skip the standalone distribution and register the returned
 * // routeTargets on an AWS.Website.Router instead.
 * const site = yield* SsrSite("App", {
 *   server: {
 *     type: "lambda",
 *     function: appFunction,
 *   },
 *   cdn: false,
 * });
 *
 * const router = yield* AWS.Website.Router("WebsiteRouter", {
 *   routes: {
 *     "/*": site.routeTargets.server,
 *   },
 * });
 * ```
 *
 * @resource
 */
export const SsrSite = (id: string, props: SsrSiteProps) =>
  Effect.gen(function* () {
    const normalizedDomain = normalizeWebsiteDomain(props.domain);
    const routerDomain = normalizedDomain?.router
      ? (normalizedDomain as WebsiteRouterDomainProps)
      : undefined;
    const domain = routerDomain
      ? undefined
      : (normalizedDomain as WebsiteStandaloneDomainProps | undefined);
    if (routerDomain && typeof routerDomain.dns === "object") {
      return yield* Effect.die(
        'Router-attached sites inherit the Router DNS authority; explicit per-site "dns" zone descriptors are not supported. Use "dns: false" to opt out.',
      );
    }
    const assetPattern = props.assets?.pathPattern ?? "/_assets/*";
    const serverUrl = serverUrlOf(props.server);
    const serverOriginHost = serverOriginOf(props.server);

    const assetBucket = props.assets
      ? yield* Bucket("AssetsBucket", {
          bucketName: props.assets.bucketName,
          tags: props.tags,
        })
      : undefined;

    const assetFiles =
      props.assets && assetBucket
        ? yield* AssetDeployment("AssetsFiles", {
            bucket: assetBucket,
            sourcePath: props.assets.sourcePath,
            prefix: props.assets.prefix,
            purge: props.assets.purge ?? false,
            fileOptions: props.assets.fileOptions,
          })
        : undefined;

    const assetOac =
      props.assets && assetBucket
        ? yield* OriginAccessControl("AssetsOriginAccessControl", {
            originType: "s3",
            description: `${id} SSR asset origin access control`,
          })
        : undefined;

    const routeTargets: SsrSiteRouteTargets = {
      server: {
        url: serverUrl,
        originProtocolPolicy: props.server.originProtocolPolicy ?? "https-only",
      },
      assets:
        assetBucket && assetOac
          ? {
              pattern: assetPattern,
              route: {
                bucket: assetBucket,
                originAccessControlId: assetOac.originAccessControlId,
                originPath: props.assets?.prefix,
                version: assetFiles?.version,
              },
            }
          : undefined,
    };

    if (routerDomain) {
      if (props.cdn !== false) {
        return yield* Effect.die(
          'SsrSite domains with "router" require "cdn: false".',
        );
      }
      const routerRef = routerDomain.router;
      const routeId = id.replace(/[^A-Za-z0-9_-]/g, "-");
      const host = Output.map(
        Output.asOutput(serverUrl),
        (url) => new URL(url).host,
      );
      yield* KvEntries("RouterRouteMetadata", {
        store: routerRef.kvStoreArn,
        namespace: routerRef.kvNamespace as any,
        entries: {
          [`${routeId}:metadata`]: Output.map(host, (value) =>
            JSON.stringify({
              servers: [[value, 0, 0]],
              origin: {
                protocol:
                  props.server.originProtocolPolicy === "http-only"
                    ? "http"
                    : "https",
              },
            }),
          ),
        },
      });
      yield* KvRoutesUpdate("RouterRoute", {
        store: routerRef.kvStoreArn,
        namespace: routerRef.kvNamespace as any,
        key: "routes",
        entry: `url,${routeId},,${routerDomain.path ?? "/"}`,
      });
      const names = [
        ...(routerDomain.name && !routerDomain.name.includes("*")
          ? [routerDomain.name]
          : []),
        ...(routerDomain.aliases ?? []).filter((name) => !name.includes("*")),
        ...(routerDomain.redirects ?? []),
      ];
      const inheritedZone = routerRef.bindTargets?.dnsZone ?? routerRef.dnsZone;
      const inheritedTarget = routerRef.bindTargets?.target ?? routerRef.target;
      if (names.length > 0 && inheritedZone && inheritedTarget) {
        const resolver = yield* Effect.serviceOption(Resolver);
        if (resolver._tag === "None") {
          return yield* Effect.fail(
            new DnsError({
              reason: "missing-adapter",
              message: `No DNS resolver is registered for explicit zone type '${inheritedZone.type}'. Provide DNS.adapterLayer(...) alongside the native provider layers.`,
            }),
          );
        }
        const bound = yield* bindDns(inheritedZone).pipe(
          Effect.provideService(Resolver, resolver.value),
        );
        const covered = routerRef.coveredHostnames ?? [];
        const uncovered = names.filter(
          (name) =>
            !covered.some((owner) => websiteCertificateCovers(owner, name)),
        );
        if (routerRef.coveredHostnames && uncovered.length > 0) {
          return yield* Effect.die(
            `Router does not cover attached hostname(s): ${uncovered.join(", ")}. Add an exact alias or wildcard to the owning Router.`,
          );
        }
        yield* createWebsiteDns({
          zone: bound,
          names,
          target: inheritedTarget,
          targetMetadata:
            routerRef.bindTargets?.targetMetadata ?? routerRef.targetMetadata,
          idPrefix: "RouterAttachment",
        });
      }
      return {
        assetBucket,
        assetFiles,
        assetOriginAccessControl: assetOac,
        certificate: undefined,
        distribution: undefined,
        records: [],
        invalidation: undefined,
        routeTargets,
        url: undefined,
        urls: [] as Input<string>[],
      };
    }

    if (props.cdn === false) {
      return {
        assetBucket,
        assetFiles,
        assetOriginAccessControl: assetOac,
        certificate: undefined,
        distribution: undefined,
        records: [],
        invalidation: undefined,
        routeTargets,
        url: undefined,
        urls: [] as Input<string>[],
      };
    }

    if (domain && domain.dns === false && !domain.cert) {
      return yield* Effect.fail(
        new Error(
          "SsrSite domain configuration with `dns: false` requires `cert`.",
        ),
      );
    }

    const dnsZone: ZoneDescriptor | undefined =
      domain && typeof domain.dns === "object" ? domain.dns : undefined;
    if (dnsZone && domain?.hostedZoneId) {
      return yield* Effect.die(
        "A website domain cannot set both hostedZoneId and an explicit DNS zone descriptor.",
      );
    }
    const boundDns = dnsZone
      ? yield* Effect.serviceOption(Resolver).pipe(
          Effect.flatMap((resolver) =>
            resolver._tag === "None"
              ? Effect.fail(
                  new DnsError({
                    reason: "missing-adapter",
                    message: `No DNS resolver is registered for explicit zone type '${dnsZone.type}'. Provide DNS.adapterLayer(...) alongside the native provider layers.`,
                  }),
                )
              : bindDns(dnsZone).pipe(
                  Effect.provideService(Resolver, resolver.value),
                ),
          ),
        )
      : undefined;

    const managedCertificate =
      domain && !domain.cert && dnsZone
        ? yield* Certificate("Certificate", {
            domainName: domain.name,
            subjectAlternativeNames: [
              ...(domain.aliases ?? []),
              ...(domain.redirects ?? []),
            ],
            validation: "external",
            tags: props.tags,
          })
        : undefined;
    const externalValidation =
      managedCertificate && boundDns
        ? yield* createAcmDnsValidation({
            zone: boundDns,
            identifiers: [
              domain!.name,
              ...(domain!.aliases ?? []),
              ...(domain!.redirects ?? []),
            ],
            certificate: managedCertificate,
            idPrefix: "Certificate",
          })
        : undefined;
    const certificate =
      !domain || domain.cert
        ? domain?.cert
          ? { certificateArn: domain.cert }
          : undefined
        : (managedCertificate ??
          (yield* Certificate("Certificate", {
            domainName: domain.name,
            subjectAlternativeNames: [
              ...(domain.aliases ?? []),
              ...(domain.redirects ?? []),
            ],
            hostedZoneId: domain.hostedZoneId,
            tags: props.tags,
          })));

    const distribution = yield* Distribution("Distribution", {
      aliases: domain ? [domain.name, ...(domain.aliases ?? [])] : undefined,
      origins: [
        {
          id: "server",
          domainName: serverOriginHost,
          customOriginConfig: {
            originProtocolPolicy:
              props.server.originProtocolPolicy ?? "https-only",
          },
        },
        ...(assetBucket && assetOac
          ? [
              {
                id: "assets",
                domainName: assetBucket.bucketRegionalDomainName,
                originPath: props.assets?.prefix,
                s3Origin: true,
                originAccessControlId: assetOac.originAccessControlId,
              },
            ]
          : []),
      ],
      defaultCacheBehavior: {
        targetOriginId: "server",
        viewerProtocolPolicy: "redirect-to-https",
        compress: true,
        allowedMethods: [
          "DELETE",
          "GET",
          "HEAD",
          "OPTIONS",
          "PATCH",
          "POST",
          "PUT",
        ],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId:
          props.cachePolicyId ?? MANAGED_CACHING_DISABLED_POLICY_ID,
        originRequestPolicyId: MANAGED_ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
      },
      orderedCacheBehaviors:
        assetBucket && assetOac
          ? [
              {
                pathPattern: assetPattern,
                targetOriginId: "assets",
                viewerProtocolPolicy: "redirect-to-https",
                compress: true,
                allowedMethods: ["GET", "HEAD", "OPTIONS"],
                cachedMethods: ["GET", "HEAD"],
                cachePolicyId: MANAGED_CACHING_OPTIMIZED_POLICY_ID,
              },
            ]
          : undefined,
      viewerCertificate: certificate
        ? {
            acmCertificateArn: externalValidation
              ? externalValidation.validation.certificateArn
              : (certificate as any).certificateArn,
            sslSupportMethod: "sni-only",
            minimumProtocolVersion: "TLSv1.2_2021",
          }
        : undefined,
      tags: props.tags,
    });

    if (assetBucket && assetOac) {
      const bucketPolicy: PolicyStatement = {
        Effect: "Allow",
        Principal: {
          Service: "cloudfront.amazonaws.com",
        },
        Action: ["s3:GetObject"],
        Resource: [Output.interpolate`${assetBucket.bucketArn}/*` as any],
        Condition: {
          StringEquals: {
            "AWS:SourceArn": distribution.distributionArn as any,
          },
        },
      };

      yield* assetBucket.bind`AWS.S3.Policy(${distribution}, ${assetBucket})`({
        policyStatements: [bucketPolicy],
      });
    }

    const records =
      domain && dnsZone && boundDns
        ? (yield* createWebsiteDns({
            zone: boundDns,
            names: [
              domain.name,
              ...(domain.aliases ?? []),
              ...(domain.redirects ?? []),
            ],
            target: distribution.domainName,
            targetMetadata: { aliasHostedZoneId: distribution.hostedZoneId },
            idPrefix: "Application",
          })).records
        : domain && domain.dns !== false
          ? yield* Effect.forEach(
              [
                domain.name,
                ...(domain.aliases ?? []),
                ...(domain.redirects ?? []),
              ],
              (name, index) =>
                Route53Record(`AliasRecord${index + 1}`, {
                  // Optional — the Record provider infers the most specific
                  // public zone containing `name` when omitted.
                  hostedZoneId: domain.hostedZoneId,
                  name,
                  type: "A",
                  aliasTarget: {
                    hostedZoneId: distribution.hostedZoneId,
                    dnsName: distribution.domainName,
                  },
                }),
              { concurrency: "unbounded" },
            )
          : [];

    const invalidation =
      props.invalidate === false || !assetFiles
        ? undefined
        : yield* Invalidation("Invalidation", {
            distributionId: distribution.distributionId,
            version: assetFiles.version,
            wait: props.invalidate?.wait,
            paths:
              props.invalidate?.paths === "versioned"
                ? [assetPattern]
                : props.invalidate?.paths === "all" || !props.invalidate?.paths
                  ? ["/*"]
                  : props.invalidate.paths,
          });

    // Precedence: the canonical domain, then aliases in declaration order,
    // then the CloudFront default domain. Redirect hostnames never appear.
    const urls: Input<string>[] = domain
      ? [
          Output.interpolate`https://${domain.name}`,
          ...(domain.aliases ?? []).map((alias) => `https://${alias}`),
          Output.interpolate`https://${distribution.domainName}`,
        ]
      : [Output.interpolate`https://${distribution.domainName}`];

    return {
      assetBucket,
      assetFiles,
      assetOriginAccessControl: assetOac,
      certificate,
      distribution,
      records,
      invalidation,
      routeTargets,
      /**
       * The most significant URL the site serves at — always `urls[0]`.
       */
      url: urls[0],
      /**
       * Every URL that serves this site, most significant first —
       * `[https://<domain.name>?, ...aliases, <CloudFront default
       * domain>]`. Redirect hostnames never appear — they serve no
       * content.
       */
      urls,
    };
  }).pipe(Namespace.push(id));

import * as Effect from "effect/Effect";
import * as Output from "../../Output.ts";
import { DnsError } from "../../DNS/Contract.ts";
import type {
  DnsConstructionServices,
  DnsRecordHandle,
  ZoneLike,
  ZoneSelector,
} from "../../DNS/Contract.ts";
import { bind as bindDns } from "../../DNS/Contract.ts";
import { createAcmDnsValidation } from "../ACM/DnsValidation.ts";
import { Certificate } from "../ACM/Certificate.ts";
import type { Certificate as CertificateResource } from "../ACM/Certificate.ts";
import { AWSEnvironment } from "../Environment.ts";
import { BasePathMapping } from "./BasePathMapping.ts";
import { DomainName } from "./DomainName.ts";
import type { RestApi } from "./RestApi.ts";
import type { ApiGatewayStage } from "./Stage.ts";

/** A DNS authority accepted by the API Gateway custom-domain component. */
export type ApiGatewayDns<R = DnsConstructionServices> =
  | ZoneLike
  | ZoneSelector<string, R>;

export interface CustomDomainProps<R = DnsConstructionServices> {
  /** The public hostname served by the API Gateway custom domain. */
  domainName: string;
  /** REST API to expose through the custom domain. */
  api: RestApi;
  /** Deployed stage to map at the custom-domain root or base path. */
  stage: ApiGatewayStage;
  /** Existing regional ACM certificate. Required when `dns` is `false`. */
  certificateArn?: string;
  /** DNS authority for certificate validation and the application CNAME. */
  dns?: false | ApiGatewayDns<R>;
  /** Optional base path. Omit to map the root. */
  basePath?: string;
  /** API Gateway endpoint configuration. Defaults to a regional endpoint. */
  endpointConfiguration?: {
    types: ["REGIONAL"];
  };
  /** Minimum TLS version served by the custom domain. */
  securityPolicy?: "TLS_1_0" | "TLS_1_2";
}

export interface CustomDomainResult {
  readonly domain: Effect.Success<ReturnType<typeof DomainName>>;
  readonly mapping: Effect.Success<ReturnType<typeof BasePathMapping>>;
  readonly certificate?: CertificateResource;
  readonly dnsRecords: ReadonlyArray<DnsRecordHandle>;
}

/**
 * Compose a regional API Gateway REST custom domain, its base-path mapping,
 * ACM DNS validation, and the application hostname record.
 *
 * The raw `DomainName` resource remains available for callers that manage DNS
 * themselves. Use `dns: false` with an existing certificate for that mode.
 */
export const CustomDomain = <R = DnsConstructionServices>(
  id: string,
  props: CustomDomainProps<R>,
): Effect.Effect<CustomDomainResult, DnsError, DnsConstructionServices | R> =>
  Effect.gen(function* () {
    const needsCertificate = props.certificateArn === undefined;
    if (needsCertificate && (props.dns === undefined || props.dns === false)) {
      return yield* Effect.fail(
        new DnsError({
          reason: "unsupported",
          message:
            "AWS.ApiGateway.CustomDomain requires a DNS authority when certificateArn is omitted.",
        }),
      );
    }
    const zone =
      props.dns !== undefined && props.dns !== false
        ? yield* "resolve" in props.dns
            ? bindDns(props.dns, props.domainName)
            : bindDns(props.dns)
        : undefined;
    const certificate = needsCertificate
      ? yield* Certificate(`${id}Certificate`, {
          domainName: props.domainName,
          validation: "external",
          region: (yield* AWSEnvironment.current).region,
        })
      : undefined;
    const validation =
      certificate && zone
        ? yield* createAcmDnsValidation({
            certificate,
            identifiers: [props.domainName],
            zone,
            idPrefix: `${id}Certificate`,
          })
        : undefined;
    const domain = yield* DomainName(`${id}Domain`, {
      domainName: props.domainName,
      regionalCertificateArn:
        props.certificateArn ??
        Output.map(
          validation!.validation.certificateArn,
          (certificateArn) => certificateArn ?? "",
        ),
      endpointConfiguration: props.endpointConfiguration ?? {
        types: ["REGIONAL"],
      },
      // API Gateway defaults a regional domain to TLS_1_2. Pass that default
      // explicitly so DomainName reconciliation does not interpret the API's
      // default as drift and issue an invalid removal patch immediately after
      // creation.
      securityPolicy: props.securityPolicy ?? "TLS_1_2",
    });
    const mapping = yield* BasePathMapping(`${id}Mapping`, {
      domainName: domain.domainName,
      restApiId: props.api.restApiId,
      stage: props.stage.stageName,
      basePath: props.basePath,
    });
    const applicationRecord = zone
      ? yield* zone.hostnameTarget({
          id: `${id}HostnameTarget`,
          name: props.domainName,
          target: Output.map(
            domain.regionalDomainName,
            (target) => target ?? "",
          ),
          targetMetadata: {
            aliasHostedZoneId: Output.map(
              domain.regionalHostedZoneId,
              (id) => id ?? "",
            ),
          },
        })
      : undefined;
    return {
      domain,
      mapping,
      certificate,
      dnsRecords: [
        ...(validation?.records ?? []),
        ...(applicationRecord === undefined ? [] : [applicationRecord]),
      ],
    };
  });

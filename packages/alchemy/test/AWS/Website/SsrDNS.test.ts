import * as AWS from "@/AWS";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { gcpDnsAdapter, gcpZone } from "@/GCP/DNS/Adapter";
import { hetznerDnsAdapter, hetznerZone } from "@/Hetzner/Adapter";
import { adapterLayer } from "@/DNS";
import { zoneSelector } from "@/DNS";
import * as Stack from "@/Stack";
import * as Output from "@/Output";
import { inMemoryState } from "@/State";
import { Stage } from "@/Stage";
import * as Test from "@/Test/Alchemy";
import { describe, expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const { test } = Test.make({ providers: Layer.empty });

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "ssr-dns-local",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((compiled: Stack.CompiledStack<any>) => compiled.resources),
    ),
  ).pipe(Effect.provideService(Stage, "test"));

const dnsResources = (resources: Record<string, any>) =>
  Object.values(resources).filter(
    (resource: any) =>
      String(resource.Type).includes("DNS.Record") ||
      resource.Type === "GCP.DNS.ResourceRecordSet" ||
      String(resource.Type).includes("Hetzner.DNS") ||
      resource.Type === "Hetzner.RecordSet",
  );

const serializedRouter = (coveredHostnames: string[]) => ({
  kvStoreArn: "arn:aws:cloudfront::123:key-value-store/router",
  kvNamespace: "abcd",
  distributionId: "EDFDVBD6EXAMPLE",
  distributionArn: "arn:aws:cloudfront::123:distribution/EXAMPLE",
  url: "https://router.example.com",
  dnsZone: cloudflareZone("cf-zone", "example.com"),
  coveredHostnames,
  target: "d123.cloudfront.net",
  targetMetadata: { aliasHostedZoneId: "ZCF" },
});

describe(
  "AWS.Website.SsrSite generic DNS",
  { tags: ["unit", "provider:aws", "provider:aws:website", "local"] },
  () => {
    test(
      "creates validation and application targets in Cloudflare",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("CloudflareSsr", {
            server: { type: "url", url: "https://origin.example.net" },
            domain: {
              name: "app.example.com",
              aliases: ["www.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.map((resources) => {
          expect(dnsResources(resources)).toHaveLength(4);
          expect(
            dnsResources(resources).every(
              (resource: any) => resource.Props.zoneId === "cf-zone",
            ),
          ).toBe(true);
          expect(
            dnsResources(resources).some((resource: any) =>
              Output.isOutput(resource.Props.name),
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "discovers a Cloudflare zone for the SSR custom domain",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("DiscoveredCloudflareSsr", {
            server: { type: "url", url: "https://origin.example.net" },
            domain: {
              name: "discovered.example.com",
              dns: zoneSelector("cloudflare", () =>
                Effect.succeed(
                  cloudflareZone("discovered-zone", "example.com"),
                ),
              ),
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.map((resources) => {
          const records = dnsResources(resources);
          expect(records).toHaveLength(2);
          expect(records[0]!.Props.zoneId).toBe("discovered-zone");
          expect(records[1]!.Props.zoneId).toBe("discovered-zone");
        }),
      ),
    );

    test(
      "creates provider-native targets for GCP and Hetzner subdomains",
      Effect.gen(function* () {
        const gcp = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("GcpSsr", {
              server: { type: "url", url: "https://origin.example.net" },
              domain: {
                name: "gcp.example.com",
                dns: gcpZone("managed-zone", "example.com"),
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(gcpDnsAdapter)));
        const hetzner = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("HetznerSsr", {
              server: { type: "url", url: "https://origin.example.net" },
              domain: {
                name: "hetzner.example.com",
                dns: hetznerZone("12345", "example.com"),
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(hetznerDnsAdapter)));
        expect(dnsResources(gcp)).toHaveLength(2);
        expect(dnsResources(hetzner)).toHaveLength(2);
        expect(
          Object.values(gcp).some(
            (resource: any) => resource.Props.managedZone === "managed-zone",
          ),
        ).toBe(true);
        expect(
          Object.values(hetzner).some(
            (resource: any) =>
              resource.Props.zone?.zoneId !== undefined ||
              resource.Props.name !== undefined,
          ),
        ).toBe(true);
      }),
    );

    test(
      "supplied certificates manage application DNS and manual DNS manages none",
      Effect.gen(function* () {
        const supplied = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("Supplied", {
              server: { type: "url", url: "https://origin.example.net" },
              domain: {
                name: "supplied.example.com",
                cert: "arn:aws:acm:us-east-1:123:certificate/existing",
                dns: cloudflareZone("cf-zone", "example.com"),
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(cloudflareDnsAdapter)));
        const manual = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("Manual", {
              server: { type: "url", url: "https://origin.example.net" },
              domain: {
                name: "manual.example.com",
                cert: "arn:aws:acm:us-east-1:123:certificate/existing",
                dns: false,
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(cloudflareDnsAdapter)));
        expect(dnsResources(supplied)).toHaveLength(1);
        expect(dnsResources(manual)).toHaveLength(0);
      }),
    );

    test(
      "does not create DNS resources without a domain",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("NoDomain", {
            server: { type: "url", url: "https://origin.example.net" },
          });
        }),
      ).pipe(
        Effect.map((resources) =>
          expect(dnsResources(resources)).toHaveLength(0),
        ),
      ),
    );

    test(
      "does not inherit same-stack Router DNS when an attached SsrSite opts out",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("NoDnsRouter", {
            domain: {
              name: "example.com",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
          yield* AWS.Website.SsrSite("NoDnsSite", {
            server: { type: "url", url: "https://origin.example.net" },
            cdn: false,
            domain: { router, name: "docs.example.com", dns: false },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.map((resources) => {
          expect(dnsResources(resources).length).toBeGreaterThan(0);
          expect(
            Object.keys(resources).some((key) =>
              key.includes("NoDnsSite/RouterAttachment"),
            ),
          ).toBe(false);
        }),
      ),
    );

    test(
      "applies one-label X509 wildcard coverage to SsrSite attachments",
      Effect.gen(function* () {
        const accepted = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("WildcardOneLabel", {
              server: { type: "url", url: "https://origin.example.net" },
              cdn: false,
              domain: {
                router: serializedRouter(["*.b.example.com"]),
                name: "a.b.example.com",
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(cloudflareDnsAdapter)));
        const exact = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.SsrSite("ExactCovered", {
              server: { type: "url", url: "https://origin.example.net" },
              cdn: false,
              domain: {
                router: serializedRouter(["docs.example.com"]),
                name: "docs.example.com",
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(cloudflareDnsAdapter)));
        expect(dnsResources(accepted)).toHaveLength(1);
        expect(dnsResources(exact)).toHaveLength(1);
      }),
    );

    test(
      "does not inherit serialized Router DNS when an attached SsrSite opts out",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("CrossStackNoDns", {
            server: { type: "url", url: "https://origin.example.net" },
            cdn: false,
            domain: {
              router: serializedRouter(["*.example.com"]),
              name: "api.example.com",
              dns: false,
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.map((resources) =>
          expect(dnsResources(resources)).toHaveLength(0),
        ),
      ),
    );

    test(
      "rejects an explicit SsrSite DNS override on a generic Router",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("Override", {
            server: { type: "url", url: "https://origin.example.net" },
            cdn: false,
            domain: {
              router: serializedRouter(["*.example.com"]),
              name: "docs.example.com",
              dns: cloudflareZone("other-zone", "example.com") as any,
            } as any,
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.exit,
        Effect.map((result) => {
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(String(result.cause)).toMatch(
              /explicit per-site.*zone descriptors are not supported/,
            );
          }
        }),
      ),
    );

    test(
      "rejects an explicit SsrSite DNS override on a legacy Router reference",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("LegacyRouter", {
            domain: { name: "example.com", hostedZoneId: "Z123" },
          });
          yield* AWS.Website.SsrSite("OverrideLegacy", {
            server: { type: "url", url: "https://origin.example.net" },
            cdn: false,
            domain: {
              router,
              name: "docs.example.com",
              dns: cloudflareZone("other-zone", "example.com") as any,
            } as any,
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.exit,
        Effect.map((result) => {
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(String(result.cause)).toMatch(
              /explicit per-site.*zone descriptors are not supported/,
            );
          }
        }),
      ),
    );

    test(
      "rejects a multi-label hostname under a broader SsrSite wildcard",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.SsrSite("WildcardTooBroad", {
            server: { type: "url", url: "https://origin.example.net" },
            cdn: false,
            domain: {
              router: serializedRouter(["*.example.com"]),
              name: "a.b.example.com",
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            expect(String(cause)).toContain("does not cover attached hostname"),
          ),
        ),
      ),
    );
  },
);

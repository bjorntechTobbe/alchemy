import * as AWS from "@/AWS";
import { cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { cloudflareDnsAdapter } from "@/Cloudflare/DNS/Adapter";
import { route53DnsAdapter, route53Zone } from "@/AWS/Route53/Adapter";
import { adapterLayer } from "@/DNS";
import * as Output from "@/Output";
import * as Stack from "@/Stack";
import { inMemoryState } from "@/State";
import { Stage } from "@/Stage";
import * as Test from "@/Test/Alchemy";
import { describe, expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fileURLToPath } from "node:url";

const fixtureDir = fileURLToPath(
  new URL("./fixtures/static-site", import.meta.url),
);

const { test } = Test.make({ providers: Layer.empty });

type Resource = any;

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "external-dns-website",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((compiled: Stack.CompiledStack<any>) => compiled.resources),
    ),
  ).pipe(
    Effect.provideService(Stage, "test"),
    Effect.provide(adapterLayer(route53DnsAdapter, cloudflareDnsAdapter)),
  );

const resource = (resources: Record<string, Resource>, suffix: string) => {
  const found = Object.entries(resources).find(
    ([key, value]) =>
      key.endsWith(suffix) ||
      (suffix.includes("DNS-A-") &&
        value.Type === "AWS.Route53.Record" &&
        value.Props.type === "A"),
  );
  expect(found, `missing resource ${suffix}`).toBeDefined();
  return found![1];
};

const keys = (resources: Record<string, Resource>) => Object.keys(resources);
const dnsRecordKeys = (resources: Record<string, Resource>) =>
  Object.entries(resources)
    .filter(
      ([, value]) =>
        value.Type === "Cloudflare.DNS.Record" ||
        value.Type === "AWS.Route53.Record",
    )
    .map(([key]) => key);

// Follow the actual Output expression graph and collect producer resources.
const outputSources = (value: unknown, seen = new Set<unknown>()): string[] => {
  if (value == null || seen.has(value)) return [];
  if (typeof value !== "object" && typeof value !== "function") return [];
  seen.add(value);
  const source = (value as any).src?.FQN;
  return [
    ...(typeof source === "string" ? [source] : []),
    ...Object.values(value as Record<string, unknown>).flatMap((item) =>
      outputSources(item, seen),
    ),
  ];
};

const outputIdentifiers = (
  value: unknown,
  seen = new Set<unknown>(),
): string[] => {
  if (value == null || seen.has(value)) return [];
  if (typeof value !== "object" && typeof value !== "function") return [];
  seen.add(value);
  const identifier = (value as any).identifier;
  return [
    ...(typeof identifier === "string" ? [identifier] : []),
    ...Object.values(value as Record<string, unknown>).flatMap((item) =>
      outputIdentifiers(item, seen),
    ),
  ];
};

describe(
  "AWS.Website external DNS composition",
  { tags: ["unit", "provider:aws", "provider:aws:website", "local"] },
  () => {
    test(
      "uses Cloudflare native validation and hostname records",
      compile(
        Effect.gen(function* () {
          const site = yield* AWS.Website.StaticSite("CloudflareSite", {
            path: fixtureDir,
            domain: {
              name: "www.example.com",
              aliases: ["example.com"],
              redirects: ["old.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
          return site;
        }),
      ).pipe(
        Effect.map((resources) => {
          const names = keys(resources);
          const records = dnsRecordKeys(resources).filter(
            (key) => resources[key].Props.type === "CNAME",
          );
          // Three ACM validation CNAMEs plus three application hostname targets.
          expect(records).toHaveLength(6);
          for (const key of records) {
            const record = resources[key];
            expect(record.Type).toBe("Cloudflare.DNS.Record");
            expect(record.Props.zoneId).toBe("cf-zone");
            expect(record.Props.proxied).toBe(false);
            expect(record.Props.type).toBe("CNAME");
          }
          const validation = resource(
            resources,
            "CloudflareSite/CertificateValidation",
          );
          const distribution = resource(
            resources,
            "CloudflareSite/Distribution",
          );
          expect(Output.isOutput(validation.Props.validationRecordFqdns)).toBe(
            true,
          );
          expect(
            Output.isOutput(
              distribution.Props.viewerCertificate.acmCertificateArn,
            ),
          ).toBe(true);
          expect(Output.isOutput(resources[records[0]].Props.name)).toBe(true);
          expect(
            outputSources(
              distribution.Props.viewerCertificate.acmCertificateArn,
            ),
          ).toContain("CloudflareSite/CertificateValidation");
          expect(
            outputSources(validation.Props.validationRecordFqdns).filter(
              (source) => source.includes("CertificateValidationRecord"),
            ),
          ).toHaveLength(3);
          expect(distribution.Props.aliases).toEqual([
            "www.example.com",
            "example.com",
            "old.example.com",
          ]);
        }),
      ),
    );

    test(
      "uses Route 53 alias metadata from the distribution output",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("Route53Site", {
            path: fixtureDir,
            domain: {
              name: "www.example.com",
              dns: route53Zone("Z123", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.flatMap((resources) =>
          Effect.gen(function* () {
            const record = resource(
              resources,
              "Route53Site/DNS-A-www-example-com",
            );
            const distribution = resource(
              resources,
              "Route53Site/Distribution",
            );
            expect(record.Type).toBe("AWS.Route53.Record");
            expect(
              outputSources(record.Props.aliasTarget.hostedZoneId),
            ).toContain("Route53Site/Distribution");
            expect(
              outputIdentifiers(record.Props.aliasTarget.hostedZoneId),
            ).toContain("hostedZoneId");
            expect(
              outputIdentifiers(record.Props.aliasTarget.hostedZoneId),
            ).not.toContain("domainName");
            const fakeDistributionAttrs = {
              "Route53Site/Distribution": {
                hostedZoneId: "Z-CLOUDFRONT",
                domainName: "d123.cloudfront.net",
              },
            };
            expect(
              yield* Output.evaluate(
                record.Props.aliasTarget.hostedZoneId,
                fakeDistributionAttrs,
              ),
            ).toBe("Z-CLOUDFRONT");
            expect(
              yield* Output.evaluate(
                record.Props.aliasTarget.dnsName,
                fakeDistributionAttrs,
              ),
            ).toBe("d123.cloudfront.net");
            expect(Output.isOutput(record.Props.aliasTarget.dnsName)).toBe(
              true,
            );
            expect(Output.isOutput(record.Props.aliasTarget.hostedZoneId)).toBe(
              true,
            );
          }),
        ),
      ),
    );

    test(
      "dns false with an existing certificate creates no application DNS",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("ManualDNS", {
            path: fixtureDir,
            domain: {
              name: "manual.example.com",
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
              dns: false,
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(keys(resources).some((key) => key.includes("DNS-"))).toBe(
            false,
          );
          expect(
            keys(resources).some((key) => key.includes("Certificate")),
          ).toBe(false);
          const distribution = resource(resources, "ManualDNS/Distribution");
          expect(distribution.Props.viewerCertificate.acmCertificateArn).toBe(
            "arn:aws:acm:us-east-1:123:certificate/existing",
          );
        }),
      ),
    );

    test(
      "preissued certificate with external DNS creates application DNS only",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("PreissuedDNS", {
            path: fixtureDir,
            domain: {
              name: "preissued.example.com",
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(
            keys(resources).some((key) =>
              key.includes("CertificateValidation"),
            ),
          ).toBe(false);
          expect(
            keys(resources).some((key) => key.endsWith("/Certificate")),
          ).toBe(false);
          expect(
            dnsRecordKeys(resources).filter(
              (key) => resources[key].Props.type === "CNAME",
            ),
          ).toHaveLength(1);
        }),
      ),
    );

    test(
      "rejects a hosted zone and explicit descriptor before native resources",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("InvalidDNS", {
            path: fixtureDir,
            domain: {
              name: "www.example.com",
              hostedZoneId: "Z123",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            expect(String(cause)).toContain("both hostedZoneId");
          }),
        ),
      ),
    );

    test(
      "omitted dns keeps the legacy Route 53 certificate and record path",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("LegacyDNS", {
            path: fixtureDir,
            domain: { name: "legacy.example.com", hostedZoneId: "Z123" },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(
            Object.values(resources).some(
              (node: any) => node.Type === "Cloudflare.DNS.Record",
            ),
          ).toBe(false);
          expect(
            Object.keys(resources).some((key) => key.endsWith("/Certificate")),
          ).toBe(true);
          expect(
            Object.values(resources).some(
              (node: any) => node.Type === "AWS.Route53.Record",
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "preissued certificate with hostedZoneId and dns false remains allowed",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("LegacyManualDNS", {
            path: fixtureDir,
            domain: {
              name: "legacy-manual.example.com",
              hostedZoneId: "Z123",
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
              dns: false,
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(
            Object.values(resources).some((node: any) =>
              String(node.Type).includes("Route53.Record"),
            ),
          ).toBe(false);
          expect(
            Object.keys(resources).some((key) => key.endsWith("/Certificate")),
          ).toBe(false);
        }),
      ),
    );

    test(
      "router-bound descriptor with external dns rejects before native construction",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("Router", {});
          yield* AWS.Website.StaticSite("RouterExternalDNS", {
            path: fixtureDir,
            domain: {
              name: "docs.example.com",
              router,
              dns: cloudflareZone("cf-zone", "example.com"),
            } as any,
          });
        }),
      ).pipe(
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
      "apex and wildcard SANs deduplicate to one native validation record",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("WildcardSAN", {
            path: fixtureDir,
            domain: {
              name: "EXAMPLE.COM.",
              aliases: ["*.Example.Com."],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(
            dnsRecordKeys(resources).filter(
              (key) =>
                resources[key].Props.type === "CNAME" &&
                key.includes("CertificateValidationRecord"),
            ),
          ).toHaveLength(1);
        }),
      ),
    );

    test(
      "keeps dotted and hyphenated validation records distinct",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("ValidationIdDotted", {
            path: fixtureDir,
            domain: {
              name: "a.b.example.com",
              aliases: ["a-b.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.flatMap((resources) =>
          Effect.gen(function* () {
            const records = dnsRecordKeys(resources).filter(
              (key) =>
                resources[key].Props.type === "CNAME" &&
                key.includes("CertificateValidationRecord"),
            );
            expect(records).toHaveLength(2);
            expect(new Set(records).size).toBe(2);
            const values = {
              "ValidationIdDotted/Certificate": {
                domainValidationOptions: [
                  {
                    DomainName: "a.b.example.com",
                    ResourceRecord: {
                      Name: "_a.b.example.com",
                      Type: "CNAME",
                      Value: "a-b-validation.example.com",
                    },
                  },
                  {
                    DomainName: "a-b.example.com",
                    ResourceRecord: {
                      Name: "_a-b.example.com",
                      Type: "CNAME",
                      Value: "a.b-validation.example.com",
                    },
                  },
                ],
              },
            };
            const names = yield* Effect.forEach(records, (key) =>
              Output.evaluate(resources[key].Props.name, values),
            );
            const validationValues = yield* Effect.forEach(records, (key) =>
              Output.evaluate(resources[key].Props.content, values),
            );
            expect(new Set(names)).toEqual(
              new Set(["_a.b.example.com", "_a-b.example.com"]),
            );
            expect(new Set(validationValues)).toEqual(
              new Set([
                "a-b-validation.example.com",
                "a.b-validation.example.com",
              ]),
            );
          }),
        ),
      ),
    );

    test(
      "keeps wildcard and wildcard-labeled validation records distinct",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("ValidationIdWildcard", {
            path: fixtureDir,
            domain: {
              name: "*.example.com",
              aliases: ["wildcard.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.flatMap((resources) =>
          Effect.gen(function* () {
            const records = dnsRecordKeys(resources).filter(
              (key) =>
                resources[key].Props.type === "CNAME" &&
                key.includes("CertificateValidationRecord"),
            );
            expect(records).toHaveLength(2);
            expect(new Set(records).size).toBe(2);
            const values = {
              "ValidationIdWildcard/Certificate": {
                domainValidationOptions: [
                  {
                    DomainName: "*.example.com",
                    ResourceRecord: {
                      Name: "_wildcard.example.com",
                      Type: "CNAME",
                      Value: "wildcard-validation.example.com",
                    },
                  },
                  {
                    DomainName: "wildcard.example.com",
                    ResourceRecord: {
                      Name: "_literal-wildcard.example.com",
                      Type: "CNAME",
                      Value: "literal-wildcard-validation.example.com",
                    },
                  },
                ],
              },
            };
            const names = yield* Effect.forEach(records, (key) =>
              Output.evaluate(resources[key].Props.name, values),
            );
            const validationValues = yield* Effect.forEach(records, (key) =>
              Output.evaluate(resources[key].Props.content, values),
            );
            expect(new Set(names)).toEqual(
              new Set([
                "_wildcard.example.com",
                "_literal-wildcard.example.com",
              ]),
            );
            expect(new Set(validationValues)).toEqual(
              new Set([
                "wildcard-validation.example.com",
                "literal-wildcard-validation.example.com",
              ]),
            );
          }),
        ),
      ),
    );

    test(
      "creates independent concrete and wildcard application records with an explicit adapter",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("WildcardApplication", {
            path: fixtureDir,
            domain: {
              name: "example.com",
              aliases: ["*.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = dnsRecordKeys(resources).filter(
            (key) => resources[key].Props.type === "CNAME",
          );
          expect(records).toHaveLength(2);
          expect(records.map((key) => resources[key].Props.name)).toHaveLength(
            2,
          );
        }),
      ),
    );

    test(
      "creates a wildcard-only application record with an explicit adapter",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("WildcardOnlyApplication", {
            path: fixtureDir,
            domain: {
              name: "*.example.com",
              dns: cloudflareZone("cf-zone", "example.com"),
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = dnsRecordKeys(resources).filter(
            (key) => resources[key].Props.type === "CNAME",
          );
          expect(records).toHaveLength(1);
        }),
      ),
    );

    test(
      "creates independent concrete and wildcard application records on legacy Route 53",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("LegacyWildcardApplication", {
            path: fixtureDir,
            domain: {
              name: "example.com",
              aliases: ["*.example.com"],
              hostedZoneId: "Z123",
              cert: "arn:aws:acm:us-east-1:123:certificate/existing",
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = Object.values(resources).filter(
            (resource) =>
              resource.Type === "AWS.Route53.Record" &&
              resource.Props.type === "A",
          );
          expect(records).toHaveLength(2);
        }),
      ),
    );

    test(
      "framework consumer forwards its external DNS descriptor through the shared site graph",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.Astro("FrameworkExternalDNS", {
            rootDir: fixtureDir,
            astro: { output: "static" },
            domain: {
              name: "framework.example.com",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(
            Object.values(resources).some(
              (node: any) => node.Type === "Cloudflare.DNS.Record",
            ),
          ).toBe(true);
          expect(
            Object.keys(resources).some((key) =>
              key.endsWith("/CertificateValidation"),
            ),
          ).toBe(true);
        }),
      ),
    );
  },
);

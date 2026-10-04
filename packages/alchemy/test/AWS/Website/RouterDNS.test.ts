import * as AWS from "@/AWS";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
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
import { fileURLToPath } from "node:url";

const { test } = Test.make({ providers: Layer.empty });
const fixtureDir = fileURLToPath(
  new URL("./fixtures/static-site", import.meta.url),
);

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "router-dns-local",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((compiled: Stack.CompiledStack<any>) => compiled.resources),
    ),
  ).pipe(
    Effect.provideService(Stage, "test"),
    Effect.provide(adapterLayer(cloudflareDnsAdapter)),
  );

const dnsRecords = (resources: Record<string, any>) =>
  Object.values(resources).filter((resource: any) =>
    String(resource.Type).includes("DNS.Record"),
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
  "AWS.Website.Router generic DNS",
  { tags: ["unit", "provider:aws", "provider:aws:website", "local"] },
  () => {
    test(
      "owns generic validation and application DNS in the selected zone",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.Router("Router", {
            domain: {
              name: "www.example.com",
              aliases: ["example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(dnsRecords(resources)).toHaveLength(4);
          expect(
            dnsRecords(resources).every(
              (resource: any) => resource.Props.zoneId === "cf-zone",
            ),
          ).toBe(true);
          expect(
            Object.keys(resources).some((key) =>
              key.endsWith("/CertificateValidation"),
            ),
          ).toBe(true);
          expect(
            dnsRecords(resources).some((resource: any) =>
              Output.isOutput(resource.Props.name),
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "discovers the selected provider zone once and maps all Router names",
      compile(
        Effect.gen(function* () {
          const selection = zoneSelector("cloudflare", () =>
            Effect.succeed(cloudflareZone("discovered-zone", "example.com")),
          );
          yield* AWS.Website.Router("DiscoveredRouter", {
            domain: {
              name: "www.example.com",
              aliases: ["alt.example.com"],
              redirects: ["old.example.com"],
              dns: selection,
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = dnsRecords(resources);
          expect(records).toHaveLength(6);
          expect(
            records.every(
              (resource: any) => resource.Props.zoneId === "discovered-zone",
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "keeps the native Route 53 path when no provider is selected",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.Router("NativeRouter", {
            domain: { name: "www.example.com", hostedZoneId: "Z123" },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = Object.values(resources).filter((resource: any) =>
            String(resource.Type).includes("Route53.Record"),
          );
          expect(records.length).toBeGreaterThan(0);
          expect(
            records.every((resource: any) =>
              String(resource.Type).includes("AWS.Route53.Record"),
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "creates independent attached-site SAN validation and application records",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("Router", {
            domain: {
              name: "example.com",
              aliases: ["*.example.com"],
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
          yield* AWS.Website.StaticSite("Docs", {
            path: fixtureDir,
            domain: {
              router,
              name: "docs.example.com",
              aliases: ["docs-alt.example.com"],
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = dnsRecords(resources);
          expect(records.length).toBeGreaterThanOrEqual(6);
          expect(
            records.some((resource: any) =>
              Output.isOutput(resource.Props.name),
            ),
          ).toBe(true);
          expect(
            records.filter((resource: any) =>
              Output.isOutput(resource.Props.name),
            ).length,
          ).toBeGreaterThanOrEqual(2);
          expect(
            Object.keys(resources).some((key) =>
              key.includes("Docs/RouterAttachmentCertificate"),
            ),
          ).toBe(true);
        }),
      ),
    );

    test(
      "does not inherit same-stack Router DNS when an attached StaticSite opts out",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("NoDnsRouter", {
            domain: {
              name: "example.com",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
          yield* AWS.Website.StaticSite("NoDnsSite", {
            path: fixtureDir,
            domain: {
              router,
              name: "docs.example.com",
              dns: false,
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(dnsRecords(resources).length).toBeGreaterThan(0);
          expect(
            Object.keys(resources).some((key) =>
              key.includes("NoDnsSite/RouterAttachment"),
            ),
          ).toBe(false);
        }),
      ),
    );

    test(
      "rejects an explicit StaticSite DNS override on a generic Router",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("GenericRouter", {
            domain: {
              name: "example.com",
              dns: cloudflareZone("cf-zone", "example.com"),
            },
          });
          yield* AWS.Website.StaticSite("Override", {
            path: fixtureDir,
            domain: {
              router,
              name: "docs.example.com",
              dns: cloudflareZone("other-zone", "example.com") as any,
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
      "rejects an explicit StaticSite DNS override on a legacy Router reference",
      compile(
        Effect.gen(function* () {
          const router = yield* AWS.Website.Router("LegacyRouter", {
            domain: { name: "example.com", hostedZoneId: "Z123" },
          });
          yield* AWS.Website.StaticSite("OverrideLegacy", {
            path: fixtureDir,
            domain: {
              router,
              name: "docs.example.com",
              dns: cloudflareZone("other-zone", "example.com") as any,
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
      "inherits serialized Router DNS metadata cross-stack without a descriptor",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("CrossStackDocs", {
            path: fixtureDir,
            domain: {
              router: {
                kvStoreArn: "arn:aws:cloudfront::123:key-value-store/router",
                kvNamespace: "abcd",
                distributionId: "EDFDVBD6EXAMPLE",
                distributionArn: "arn:aws:cloudfront::123:distribution/EXAMPLE",
                url: "https://router.example.com",
                dnsZone: cloudflareZone("cf-zone", "example.com"),
                coveredHostnames: ["*.example.com"],
                target: "d123.cloudfront.net",
                targetMetadata: { aliasHostedZoneId: "ZCF" },
              },
              name: "api.example.com",
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          const records = dnsRecords(resources);
          expect(records).toHaveLength(1);
          expect(records[0]!.Props.zoneId).toBe("cf-zone");
          expect(records[0]!.Props.content).toBe("d123.cloudfront.net");
        }),
      ),
    );

    test(
      "does not inherit serialized Router DNS when an attached StaticSite opts out",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("CrossStackNoDns", {
            path: fixtureDir,
            domain: {
              router: {
                kvStoreArn: "arn:aws:cloudfront::123:key-value-store/router",
                kvNamespace: "abcd",
                distributionId: "EDFDVBD6EXAMPLE",
                distributionArn: "arn:aws:cloudfront::123:distribution/EXAMPLE",
                url: "https://router.example.com",
                dnsZone: cloudflareZone("cf-zone", "example.com"),
                coveredHostnames: ["*.example.com"],
                target: "d123.cloudfront.net",
              },
              name: "api.example.com",
              dns: false,
            },
          });
        }),
      ).pipe(
        Effect.map((resources) =>
          expect(dnsRecords(resources)).toHaveLength(0),
        ),
      ),
    );

    test(
      "rejects an uncovered cross-stack hostname before mutating foreign DNS",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("Uncovered", {
            path: fixtureDir,
            domain: {
              router: {
                kvStoreArn: "arn:aws:cloudfront::123:key-value-store/router",
                kvNamespace: "abcd",
                distributionId: "EDFDVBD6EXAMPLE",
                distributionArn: "arn:aws:cloudfront::123:distribution/EXAMPLE",
                url: "https://router.example.com",
                dnsZone: cloudflareZone("cf-zone", "example.com"),
                coveredHostnames: ["www.example.com"],
                target: "d123.cloudfront.net",
              },
              name: "not-covered.example.com",
            },
          });
        }),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            expect(String(cause)).toContain("does not cover attached hostname"),
          ),
        ),
      ),
    );

    test(
      "applies one-label X509 wildcard coverage to StaticSite attachments",
      Effect.gen(function* () {
        const accepted = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.StaticSite("WildcardOneLabel", {
              path: fixtureDir,
              domain: {
                router: serializedRouter(["*.b.example.com"]),
                name: "a.b.example.com",
              },
            });
          }),
        );
        const exact = yield* compile(
          Effect.gen(function* () {
            yield* AWS.Website.StaticSite("ExactCovered", {
              path: fixtureDir,
              domain: {
                router: serializedRouter(["docs.example.com"]),
                name: "docs.example.com",
              },
            });
          }),
        );
        expect(dnsRecords(accepted)).toHaveLength(1);
        expect(dnsRecords(exact)).toHaveLength(1);
      }),
    );

    test(
      "rejects a multi-label hostname under a broader StaticSite wildcard",
      compile(
        Effect.gen(function* () {
          yield* AWS.Website.StaticSite("WildcardTooBroad", {
            path: fixtureDir,
            domain: {
              router: serializedRouter(["*.example.com"]),
              name: "a.b.example.com",
            },
          });
        }),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            expect(String(cause)).toContain("does not cover attached hostname"),
          ),
        ),
      ),
    );
  },
);

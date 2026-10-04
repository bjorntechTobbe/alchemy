import * as AWS from "@/AWS";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { adapterLayer } from "@/DNS";
import type { Input } from "@/Input";
import * as Output from "@/Output";
import * as Stack from "@/Stack";
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

type DnsRecordProps = {
  readonly name: Input<string>;
  readonly type: string;
  readonly content: Input<string>;
  readonly zoneId: Input<string>;
  readonly proxied?: boolean;
};

type CompiledResource = {
  readonly FQN: string;
  readonly Type: string;
  readonly Props: DnsRecordProps;
};

const compile = (
  program: Effect.Effect<unknown, unknown, unknown>,
  name = "router-record-identity",
) =>
  Effect.scoped(
    (program as Effect.Effect<unknown, unknown, never>).pipe(
      Stack.make({
        name,
        providers: Layer.empty,
        state: inMemoryState(),
      } as never),
      Effect.map(
        (compiled: Stack.CompiledStack<unknown>) => compiled.resources,
      ),
    ),
  ).pipe(Effect.provideService(Stage, "test"));

const isApplicationRecord = (resource: CompiledResource): boolean =>
  resource.Type === "Cloudflare.DNS.Record" &&
  resource.FQN.includes("HostnameTarget") &&
  !resource.FQN.includes("CertificateValidation");

const resolveString = (value: Input<string>) =>
  Effect.gen(function* () {
    const resolved =
      typeof value === "string"
        ? value
        : Effect.isEffect(value)
          ? yield* value
          : Output.isOutput(value)
            ? yield* Output.evaluate(value, {})
            : value;
    if (typeof resolved !== "string") {
      return yield* Effect.fail(new Error("DNS record name did not resolve"));
    }
    return resolved;
  });

describe(
  "AWS.Website DNS record identity",
  { tags: ["unit", "provider:aws", "provider:cloudflare", "local"] },
  () =>
    test.provider(
      "keeps concurrent Router, StaticSite, SsrSite, and dns:false records associated",
      (_stack) =>
        compile(
          Effect.gen(function* () {
            const router = yield* AWS.Website.Router("Router", {
              domain: {
                name: "router.example.com",
                aliases: [
                  "*.example.com",
                  "static.example.com",
                  "ssr.example.com",
                ],
                dns: cloudflareZone("mock-zone", "example.com"),
              },
            });

            yield* Effect.all(
              [
                AWS.Website.StaticSite("Static", {
                  path: fixtureDir,
                  domain: { router, name: "static.example.com" },
                }),
                AWS.Website.SsrSite("Ssr", {
                  server: { type: "url", url: "https://origin.example.net" },
                  cdn: false,
                  domain: { router, name: "ssr.example.com" },
                }),
                AWS.Website.StaticSite("NoDns", {
                  path: fixtureDir,
                  domain: {
                    router,
                    name: "nodns.example.com",
                    dns: false,
                  },
                }),
              ],
              { concurrency: "unbounded" },
            );
          }),
        )
          .pipe(
            Effect.provide(adapterLayer(cloudflareDnsAdapter)),
            Effect.map((resources) =>
              Object.values(resources as Record<string, CompiledResource>),
            ),
          )
          .pipe(
            Effect.flatMap((resources) =>
              Effect.gen(function* () {
                const records = resources.filter(isApplicationRecord);
                const resolved = yield* Effect.forEach(records, (record) =>
                  Effect.gen(function* () {
                    const name = yield* resolveString(record.Props.name);
                    return { fqn: record.FQN, name, type: record.Props.type };
                  }),
                );
                const names = resolved.map((record) => record.name).sort();

                expect(new Set(resolved.map((record) => record.fqn)).size).toBe(
                  resolved.length,
                );
                expect(names).toEqual(
                  [
                    "*.example.com",
                    "router.example.com",
                    "ssr.example.com",
                    "static.example.com",
                  ].sort(),
                );
                expect(names).not.toContain("nodns.example.com");
                expect(
                  resolved.every((record) => record.type === "CNAME"),
                ).toBe(true);
              }),
            ),
          ),
    ),
);

import * as AWS from "@/AWS";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { adapterLayer } from "@/DNS";
import * as Output from "@/Output";
import * as Stack from "@/Stack";
import { inMemoryState } from "@/State";
import { Stage } from "@/Stage";
import * as Test from "@/Test/Alchemy";
import { ConfigError } from "effect/Config";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fileURLToPath } from "node:url";

const fixtureDir = fileURLToPath(
  new URL("./fixtures/static-site", import.meta.url),
);

const { test } = Test.make({ providers: Layer.empty });

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "website-dns-resolver",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((compiled: Stack.CompiledStack<any>) => compiled.resources),
    ),
  ).pipe(Effect.provideService(Stage, "test"));

test(
  "legacy StaticSite does not require a DNS resolver",
  compile(
    Effect.gen(function* () {
      yield* AWS.Website.StaticSite("LegacySite", {
        path: fixtureDir,
      });
    }),
  ),
);

test(
  "an explicit DNS descriptor without a resolver fails as ConfigError",
  compile(
    Effect.gen(function* () {
      yield* AWS.Website.StaticSite("MissingResolverSite", {
        path: fixtureDir,
        domain: {
          name: "www.example.com",
          dns: cloudflareZone("cf-zone", "example.com"),
        },
      });
    }),
  ).pipe(
    Effect.matchEffect({
      onFailure: (error) => {
        expect(error).toBeInstanceOf(ConfigError);
        expect(String(error)).toContain("No DNS resolver is registered");
        return Effect.void;
      },
      onSuccess: () =>
        Effect.fail(new Error("expected explicit DNS resolution to fail")),
    }),
  ),
);

test(
  "an aggregate resolver is selected in the Stack construction context",
  compile(
    Effect.gen(function* () {
      yield* AWS.Website.StaticSite("ResolvedSite", {
        path: fixtureDir,
        domain: {
          name: "www.example.com",
          dns: cloudflareZone("cf-zone", "example.com"),
          cert: "arn:aws:acm:us-east-1:123:certificate/existing",
        },
      });
    }),
  ).pipe(
    Effect.provide(adapterLayer(cloudflareDnsAdapter)),
    Effect.map((resources) => {
      const records = Object.values(resources).filter(
        (resource: any) => resource.Type === "Cloudflare.DNS.Record",
      );
      expect(records.length).toBeGreaterThan(0);
      expect(Output.isOutput((records[0] as any).Props.name)).toBe(true);
    }),
  ),
);

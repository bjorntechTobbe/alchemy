import { describe, expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Test from "@/Test/Alchemy";
import {
  adapterLayer,
  bind,
  DnsError,
  type DnsAdapter,
  type ZoneSelector,
} from "@/DNS";

const { test } = Test.make({ providers: Layer.empty });

const adapter: DnsAdapter = {
  type: "mock",
  capabilities: {
    record: true,
    rrset: false,
    multiValue: false,
    ttl: true,
    autoTtl: true,
    fqdn: true,
    hostnameTargets: false,
  },
  record: () =>
    Effect.fail(
      new DnsError({ reason: "unsupported", message: "not constructed" }),
    ),
};

describe("DNS hostname discovery contract", { tags: ["unit", "local"] }, () => {
  test.provider("resolves an explicit selector once at bind", (stack) =>
    stack.plan(
      Effect.gen(function* () {
        let calls = 0;
        const selector: ZoneSelector<string, never> = {
          type: "mock",
          resolve: (hostname) => {
            calls++;
            expect(hostname).toBe("api.example.com");
            return Effect.succeed({
              type: "mock",
              identity: { kind: "mock", id: "zone", name: "example.com" },
            });
          },
        };
        yield* bind(selector, "api.example.com").pipe(
          Effect.provide(adapterLayer(adapter)),
        );
        expect(calls).toBe(1);
      }),
    ),
  );

  test.provider("rejects a selector that resolves another provider", (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const selector: ZoneSelector<string, never> = {
          type: "mock",
          resolve: () =>
            Effect.succeed({
              type: "cloudflare",
              identity: {
                kind: "cloudflare",
                id: "zone",
                name: "example.com",
              },
            }),
        };
        const error = yield* bind(selector, "api.example.com").pipe(
          Effect.provide(adapterLayer(adapter)),
          Effect.flip,
        );
        expect(error.reason).toBe("invalid-zone");
      }),
    ),
  );

  test.provider("preserves explicit descriptors without discovery", (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const never: ZoneSelector<"mock", never> = {
          type: "mock",
          resolve: () => Effect.die("discovery must not run"),
        };
        const bound = yield* bind({
          type: "mock",
          identity: { kind: "mock", id: "zone", name: "example.com" },
        }).pipe(Effect.provide(adapterLayer(adapter)));
        expect(bound.zone.identity.id).toBe("zone");
        expect(never.type).toBe("mock");
      }),
    ),
  );

  test.provider(
    "surfaces provider-selected missing zones as typed errors",
    (stack) =>
      stack.plan(
        Effect.gen(function* () {
          const selector: ZoneSelector<"mock", never> = {
            type: "mock",
            resolve: () =>
              Effect.fail(
                new DnsError({
                  reason: "zone-not-found",
                  message: "No zone",
                }),
              ),
          };
          const error = yield* bind(selector, "missing.example.com").pipe(
            Effect.provide(adapterLayer(adapter)),
            Effect.flip,
          );
          expect(error.reason).toBe("zone-not-found");
        }),
      ),
  );
});

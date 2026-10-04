import { describe, expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Test from "@/Test/Alchemy";
import {
  adapterLayer,
  bind,
  DnsError,
  Resolver,
  type DnsAdapter,
  type RecordRequest,
} from "@/DNS/index.ts";

const { test } = Test.make({ providers: Layer.empty });

const withConstruction = <A, E, R>(
  stack: Test.ScratchStack,
  effect: Effect.Effect<A, E, R>,
) => stack.plan(effect);

const zone = {
  type: "aws",
  identity: { kind: "mock", id: "zone-1", name: "example.com" },
} as const;

const failingAdapter = (type: string, multiValue: boolean): DnsAdapter => ({
  type,
  capabilities: {
    record: true,
    rrset: false,
    multiValue,
    ttl: true,
    autoTtl: false,
    fqdn: true,
    hostnameTargets: false,
  },
  record: (): Effect.Effect<never, DnsError, never> =>
    Effect.fail(new DnsError({ reason: "unsupported", message: type })),
});

describe("DNS contract", { tags: ["unit", "local"] }, () => {
  test.provider("an aggregate layer selects each registered adapter", (stack) =>
    withConstruction(
      stack,
      Effect.gen(function* () {
        const result = yield* bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({ name: "www.example.com", type: "A", values: ["1"] }),
          ),
          Effect.provide(
            adapterLayer(
              failingAdapter("aws", true),
              failingAdapter("cloudflare", true),
            ),
          ),
          Effect.flip,
        );
        expect(result.message).toBe("aws");

        const cloudflare = yield* bind({ ...zone, type: "cloudflare" }).pipe(
          Effect.flatMap((bound) =>
            bound.record({ name: "www.example.com", type: "A", values: ["1"] }),
          ),
          Effect.provide(
            adapterLayer(
              failingAdapter("aws", true),
              failingAdapter("cloudflare", true),
            ),
          ),
          Effect.flip,
        );
        expect(cloudflare.message).toBe("cloudflare");
      }),
    ),
  );

  test.provider(
    "rejects unsupported multi-value records before adapter construction",
    (stack) =>
      withConstruction(
        stack,
        Effect.gen(function* () {
          let constructed = false;
          const adapter: DnsAdapter = {
            ...failingAdapter("single", false),
            record: (): Effect.Effect<never, DnsError, never> => {
              constructed = true;
              return Effect.fail(
                new DnsError({ reason: "unsupported", message: "called" }),
              );
            },
          };
          const error = yield* bind({ ...zone, type: "single" }).pipe(
            Effect.flatMap((bound) =>
              bound.record({
                name: "www.example.com",
                type: "A",
                values: ["1", "2"],
              }),
            ),
            Effect.provide(adapterLayer(adapter)),
            Effect.flip,
          );
          expect(error.reason).toBe("unsupported");
          expect(constructed).toBe(false);
        }),
      ),
  );

  test.provider(
    "reports duplicate adapter types at the bind boundary",
    (stack) =>
      withConstruction(
        stack,
        bind(zone).pipe(
          Effect.provide(
            adapterLayer(
              failingAdapter("aws", true),
              failingAdapter("aws", false),
            ),
          ),
          Effect.flip,
          Effect.map((error: DnsError) => {
            expect(error.reason).toBe("invalid-adapter");
            expect(error.message).toContain("Duplicate DNS adapter type 'aws'");
          }),
          Effect.asVoid,
        ),
      ),
  );

  test.provider(
    "rejects duplicate adapter types through direct resolver access",
    (stack) =>
      withConstruction(
        stack,
        Effect.gen(function* () {
          const resolver = yield* Resolver;
          const error = yield* resolver.resolve("cloudflare").pipe(Effect.flip);
          expect(error.reason).toBe("invalid-adapter");
          expect(error.message).toContain("Duplicate DNS adapter type 'aws'");
        }).pipe(
          Effect.provide(
            adapterLayer(
              failingAdapter("aws", true),
              failingAdapter("aws", false),
              failingAdapter("cloudflare", true),
            ),
          ),
        ),
      ),
  );

  test.provider(
    "rejects invalid adapter capabilities through direct resolver access",
    (stack) =>
      withConstruction(
        stack,
        Effect.gen(function* () {
          const resolver = yield* Resolver;
          const error = yield* resolver.resolve("valid").pipe(Effect.flip);
          expect(error.reason).toBe("invalid-adapter");
          expect(error.message).toContain(
            "DNS adapter 'invalid' enables auto TTL without TTL support",
          );
        }).pipe(
          Effect.provide(
            adapterLayer(
              {
                ...failingAdapter("invalid", true),
                capabilities: {
                  ...failingAdapter("invalid", true).capabilities,
                  ttl: false,
                  autoTtl: true,
                },
              },
              failingAdapter("valid", true),
            ),
          ),
        ),
      ),
  );

  test.provider(
    "validates hostname target names before invoking the native handler",
    (stack) =>
      withConstruction(
        stack,
        Effect.gen(function* () {
          let constructed = 0;
          const adapter: DnsAdapter = {
            ...failingAdapter("hostname", true),
            capabilities: {
              ...failingAdapter("hostname", true).capabilities,
              hostnameTargets: true,
            },
            hostnameTarget: (): Effect.Effect<never, DnsError, never> => {
              constructed += 1;
              return Effect.fail(
                new DnsError({ reason: "unsupported", message: "called" }),
              );
            },
          };

          for (const name of ["notexample.com", "www.example.com.."]) {
            const error = yield* bind({ ...zone, type: "hostname" }).pipe(
              Effect.flatMap((bound) =>
                bound.hostnameTarget({ name, target: "target.example.net" }),
              ),
              Effect.provide(adapterLayer(adapter)),
              Effect.flip,
            );
            expect(error.reason).toBe("invalid-zone");
          }
          expect(constructed).toBe(0);

          for (const name of ["@", "WWW.Example.Com."]) {
            const error = yield* bind({ ...zone, type: "hostname" }).pipe(
              Effect.flatMap((bound) =>
                bound.hostnameTarget({ name, target: "target.example.net" }),
              ),
              Effect.provide(adapterLayer(adapter)),
              Effect.flip,
            );
            expect(error.reason).toBe("unsupported");
          }
          expect(constructed).toBe(2);
        }),
      ),
  );

  test.provider(
    "returns a stable typed error for an unknown adapter",
    (stack) =>
      withConstruction(
        stack,
        bind({ ...zone, type: "missing" }).pipe(
          Effect.provide(adapterLayer(failingAdapter("aws", true))),
          Effect.flip,
          Effect.map((error: DnsError) =>
            expect(error.reason).toBe("missing-adapter"),
          ),
          Effect.asVoid,
        ),
      ),
  );

  test.provider(
    "accepts case-insensitive and terminal-dot zone names",
    (stack) =>
      withConstruction(
        stack,
        Effect.gen(function* () {
          let constructed = 0;
          const adapter: DnsAdapter = {
            ...failingAdapter("names", true),
            hostnameTarget: undefined,
            record: (
              request: RecordRequest,
            ): Effect.Effect<never, DnsError, never> => {
              constructed += 1;
              return Effect.fail(
                new DnsError({
                  reason: "unsupported",
                  message: String(request.name),
                }),
              );
            },
          };
          const error = yield* bind({
            ...zone,
            type: "names",
            identity: { ...zone.identity, name: "EXAMPLE.COM." },
          }).pipe(
            Effect.flatMap((bound) =>
              bound.record({
                name: "WWW.Example.Com.",
                type: "A",
                values: ["1"],
              }),
            ),
            Effect.provide(adapterLayer(adapter)),
            Effect.flip,
          );
          expect(error.message).toBe("WWW.Example.Com.");
          expect(constructed).toBe(1);
        }),
      ),
  );
});

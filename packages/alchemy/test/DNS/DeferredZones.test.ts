import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect } from "alchemy-test";
import * as Test from "@/Test/Alchemy";
import * as DNS from "@/DNS";
import * as Output from "@/Output";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { gcpDnsAdapter, gcpZone } from "@/GCP/DNS/Adapter";
import { hetznerDnsAdapter, hetznerZone } from "@/Hetzner/Adapter";
import { route53DnsAdapter, route53Zone } from "@/AWS/Route53/Adapter";

const { test } = Test.make({ providers: Layer.empty });

describe("deferred DNS zones", { tags: ["unit", "local"] }, () => {
  test.provider("keeps native zone outputs in all core adapters", (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const zones = [
          cloudflareZone(
            Output.asOutput("cf-id"),
            Output.asOutput("example.com."),
          ),
          gcpZone(Output.asOutput("gcp-zone"), Output.asOutput("example.com.")),
          route53Zone(Output.asOutput("Z123"), Output.asOutput("example.com.")),
          hetznerZone(Output.asOutput(42), Output.asOutput("example.com.")),
        ] as const;
        const adapters = [
          cloudflareDnsAdapter,
          gcpDnsAdapter,
          route53DnsAdapter,
          hetznerDnsAdapter,
        ] as const;

        for (const [zone, adapter] of zones.map(
          (zone, index) => [zone, adapters[index]] as const,
        )) {
          let seen: DNS.RecordRequest | undefined;
          const observing = {
            ...adapter,
            record: (request: DNS.RecordRequest) => {
              seen = request;
              return Effect.fail(
                new DNS.DnsError({
                  reason: "unsupported",
                  message: "observed",
                }),
              );
            },
          } satisfies DNS.DnsAdapter;
          const error = yield* DNS.bind(zone).pipe(
            Effect.flatMap((bound) =>
              bound.record({
                id: `Deferred${zone.type}`,
                name: "www",
                type: "A",
                values: ["203.0.113.10"],
              }),
            ),
            Effect.provide(DNS.adapterLayer(observing)),
            Effect.flip,
          );
          expect(error.message).toBe("observed");
          expect(seen?.zone).toBe(zone);
        }
      }),
    ),
  );

  test(
    "rejects a whole deferred provider descriptor",
    Effect.gen(function* () {
      const error = yield* DNS.bind(
        Output.asOutput({
          type: "cloudflare",
          identity: { kind: "cloudflare", id: "id", name: "example.com" },
        }) as never,
      ).pipe(Effect.flip);
      expect(error.reason).toBe("invalid-zone");
    }).pipe(Effect.provide(DNS.adapterLayer())),
  );
});

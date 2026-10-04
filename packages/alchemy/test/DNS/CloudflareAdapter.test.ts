import * as Cloudflare from "@/Cloudflare";
import type { Record as CloudflareDNSRecord } from "@/Cloudflare/DNS/Record";
import {
  CloudflareDNSAdapter,
  cloudflareDnsAdapter,
  cloudflareZone,
} from "@/Cloudflare/DNS/Adapter";
import * as DNS from "@/DNS";
import { inMemoryState } from "@/State";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";

const zone = cloudflareZone("zone-123", "example.com");
const { test } = Test.make({
  providers: Cloudflare.providers(),
  state: inMemoryState(),
  adopt: false,
});

test(
  "Cloudflare zone descriptor and adapter exports",
  Effect.gen(function* () {
    expect(zone).toEqual({
      type: "cloudflare",
      identity: { kind: "cloudflare", id: "zone-123", name: "example.com" },
    });
    expect(CloudflareDNSAdapter).toBe(cloudflareDnsAdapter);
    const error = yield* DNS.bind({ ...zone, type: "missing" }).pipe(
      Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
      Effect.flip,
    );
    expect(error.reason).toBe("missing-adapter");
  }),
);

test.provider(
  "rejects non-Cloudflare zones before native construction",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const error = yield* DNS.bind({
          type: "cloudflare",
          identity: { kind: "aws", id: "zone-123", name: "example.com" },
        }).pipe(
          Effect.flatMap((bound) =>
            bound.record({ name: "www", type: "A", values: ["203.0.113.10"] }),
          ),
          Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          Effect.flip,
        );
        expect(error.reason).toBe("invalid-zone");
      }),
    ),
);

test.provider("rejects concrete and deferred multi-value records", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      for (const values of [
        ["203.0.113.10", "203.0.113.11"],
        [Effect.succeed("203.0.113.10"), "203.0.113.11"],
      ] as const) {
        const error = yield* DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({ name: "www.example.com", type: "A", values }),
          ),
          Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          Effect.flip,
        );
        expect(error.reason).toBe("unsupported");
      }
    }),
  ),
);

test.provider(
  "constructs native Cloudflare CNAME with graph-preserving outputs",
  (stack: Test.ScratchStack) =>
    stack
      .plan(
        DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.hostnameTarget({
              name: "@",
              target: Effect.succeed("validation.example.net."),
              ttl: "auto",
            }),
          ),
          Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          Effect.map((handle) => {
            const nativeResource = handle.resource as CloudflareDNSRecord;
            return {
              type: nativeResource.Type,
              logicalId: nativeResource.LogicalId,
              props: nativeResource.Props,
              handle,
            };
          }),
        ),
      )
      .pipe(
        Effect.tap((plan) =>
          Effect.sync(() => {
            const resource = plan.output!;
            expect(resource.type).toBe("Cloudflare.DNS.Record");
            expect(resource.logicalId).toBeDefined();
            expect(resource.props.zoneId).toBe("zone-123");
            expect(resource.props.type).toBe("CNAME");
            expect(resource.props.ttl).toBe("1");
            expect(resource.props.proxied).toBe(false);
            expect(resource.props.name).toBeDefined();
            expect(resource.props.content).toBeDefined();
            expect(resource.handle).toBeTruthy();
            expect(resource.handle).not.toBe("validation.example.net.");
          }),
        ),
      ),
  { tags: ["unit", "provider:cloudflare", "local"] },
);

test.provider(
  "rejects unresolved names instead of stringifying them into IDs",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const error = yield* DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              name: Effect.succeed("www"),
              type: "A",
              values: ["203.0.113.10"],
            }),
          ),
          Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          Effect.flip,
        );
        expect(error.reason).toBe("unsupported");
        expect(error.message).toContain("concrete");
      }),
    ),
);

test(
  "advertises safe singleton common-record capabilities",
  Effect.sync(() => {
    expect(cloudflareDnsAdapter.capabilities.record).toBe(true);
    expect(cloudflareDnsAdapter.capabilities.multiValue).toBe(false);
    expect(cloudflareDnsAdapter.capabilities.ttl).toBe(true);
    expect(cloudflareDnsAdapter.capabilities.autoTtl).toBe(true);
    expect(cloudflareDnsAdapter.capabilities.hostnameTargets).toBe(true);
  }),
);

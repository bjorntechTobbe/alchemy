import * as DNS from "@/DNS";
import * as Hetzner from "@/Hetzner";
import * as Provider from "@/Provider";
import {
  HetznerDNSAdapter,
  hetznerDnsAdapter,
  hetznerZone,
} from "@/Hetzner/Adapter";
import type { RecordSet as NativeRecordSet } from "@/Hetzner/RecordSet";
import * as Test from "@/Test/Alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Output from "@/Output";
import { expect } from "alchemy-test";
import { inMemoryState } from "@/State";

const zone = hetznerZone(42, "Example.com.");
const localRecordSetProvider = Provider.succeed(Hetzner.RecordSet, {
  list: () => Effect.succeed([]),
  diff: () => Effect.succeed(undefined),
  reconcile: Effect.fn(function* ({ output }) {
    return (
      output ?? {
        id: "unit/A",
        zoneId: 42,
        name: "unit",
        type: "A",
        ttl: undefined,
        records: [],
        labels: {},
        changeProtection: false,
      }
    );
  }),
  delete: () => Effect.void,
});
const localProviders = Layer.effect(
  Hetzner.Providers,
  Provider.collection([Hetzner.RecordSet]),
).pipe(Layer.provide(localRecordSetProvider));
const { test } = Test.make({
  providers: localProviders,
  state: inMemoryState(),
});

test(
  "Hetzner descriptor and capabilities preserve native DNS semantics",
  Effect.sync(() => {
    expect(zone).toEqual({
      type: "hetzner",
      identity: { kind: "hetzner", id: "42", name: "Example.com." },
    });
    expect(HetznerDNSAdapter).toBe(hetznerDnsAdapter);
    expect(hetznerDnsAdapter.capabilities).toEqual({
      record: true,
      rrset: true,
      multiValue: true,
      ttl: true,
      autoTtl: false,
      fqdn: true,
      hostnameTargets: true,
    });
  }),
);

test.provider("constructs a multivalue RRSet with numeric TTL", (stack) =>
  stack.plan(
    DNS.bind(zone).pipe(
      Effect.flatMap((bound) =>
        bound.record({
          name: "www.example.com.",
          type: "A",
          values: ["192.0.2.1", "192.0.2.2"],
          ttl: 300,
        }),
      ),
      Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
      Effect.map((handle) => {
        const native = handle.resource as NativeRecordSet;
        expect(native.Type).toBe("Hetzner.RecordSet");
        expect(native.Props.zone).toEqual({ zoneId: 42 });
        expect(native.Props.type).toBe("A");
        expect(native.Props.records).toEqual([
          { value: "192.0.2.1" },
          { value: "192.0.2.2" },
        ]);
        expect(native.Props.ttl).toBe(300);
        expect(handle.recordName).toBeDefined();
      }),
    ),
  ),
);

test.provider("constructs CNAME targets and rejects apex CNAME", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const bound = yield* DNS.bind(zone).pipe(
        Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
      );
      const target = yield* bound.hostnameTarget({
        name: "app",
        target: "target.example.net.",
      });
      expect((target.resource as NativeRecordSet).Props.type).toBe("CNAME");
      const targetValue = (target.resource as NativeRecordSet).Props.records[0]!
        .value;
      if (!Output.isOutput(targetValue)) throw new Error("expected output");
      expect(yield* Output.evaluate(targetValue, {})).toBe(
        "target.example.net.",
      );
      const error = yield* bound
        .hostnameTarget({ name: "@", target: "target.example.net." })
        .pipe(Effect.flip);
      expect(error.reason).toBe("unsupported");
      expect(error.message).toContain("zone apex");
    }),
  ),
);

test.provider(
  "normalizes deferred CNAME targets without losing graph inputs",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const bound = yield* DNS.bind(zone).pipe(
          Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
        );
        let evaluations = 0;
        const deferred = yield* bound.hostnameTarget({
          name: "app",
          target: Effect.sync(() => {
            evaluations += 1;
            return "d123.cloudfront.net";
          }),
        });
        const value = (deferred.resource as NativeRecordSet).Props.records[0]!
          .value;
        if (!Output.isOutput(value)) throw new Error("expected output");
        expect(evaluations).toBe(0);
        expect(yield* Output.evaluate(value, {})).toBe("d123.cloudfront.net.");
        expect(evaluations).toBe(1);
      }),
    ),
);

test.provider("rejects unresolved names without an explicit id", (stack) =>
  stack.plan(
    DNS.bind(zone).pipe(
      Effect.flatMap((bound) =>
        bound.record({
          name: Effect.succeed("www"),
          type: "TXT",
          values: ["hello"],
        }),
      ),
      Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error.reason).toBe("unsupported");
          expect(error.message).toContain("concrete");
        }),
      ),
    ),
  ),
);

test.provider(
  "rejects automatic TTL and invalid provider identities",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const auto = yield* DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              name: "www",
              type: "A",
              values: ["192.0.2.10"],
              ttl: "auto",
            }),
          ),
          Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
          Effect.flip,
        );
        expect(auto.reason).toBe("unsupported");
        expect(auto.message).toContain("automatic TTL");

        const invalid = yield* DNS.bind({
          type: "hetzner",
          identity: { kind: "route53", id: "42", name: "example.com" },
        }).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              name: "www",
              type: "A",
              values: ["192.0.2.10"],
            }),
          ),
          Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
          Effect.flip,
        );
        expect(invalid.reason).toBe("invalid-zone");
      }),
    ),
);

test.provider("preserves explicit ids for deferred names", (stack) =>
  stack.plan(
    DNS.bind(zone).pipe(
      Effect.flatMap((bound) =>
        bound.record({
          id: "StableRecord",
          name: Effect.succeed("www"),
          type: "TXT",
          values: ["hello"],
        }),
      ),
      Effect.provide(DNS.adapterLayer(hetznerDnsAdapter)),
      Effect.map((handle) => {
        const native = handle.resource as NativeRecordSet;
        expect(native.LogicalId).toBe("StableRecord");
        expect(native.Props.name).toBeDefined();
        expect(native.Props.records).toEqual([{ value: "hello" }]);
      }),
    ),
  ),
);

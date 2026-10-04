import * as DNS from "@/DNS";
import { GcpDNSAdapter, gcpDnsAdapter, gcpZone } from "@/GCP/DNS/Adapter";
import * as GCP from "@/GCP";
import * as Provider from "@/Provider";
import * as Output from "@/Output";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";

const zone = gcpZone("managed-zone", "example.com.");
const recordSetTestProvider = Provider.succeed(GCP.DNS.ResourceRecordSet, {
  diff: () => Effect.succeed(undefined),
  read: () => Effect.succeed(undefined),
  list: () => Effect.succeed([]),
  reconcile: () => Effect.succeed({} as never),
  delete: () => Effect.void,
});
const { test } = Test.make({ providers: recordSetTestProvider });

test(
  "GCP descriptor and adapter exports preserve the managed-zone identity",
  Effect.sync(() => {
    expect(zone).toEqual({
      type: "gcp",
      identity: { kind: "gcp", id: "managed-zone", name: "example.com." },
    });
    expect(GcpDNSAdapter).toBe(gcpDnsAdapter);
    expect(gcpDnsAdapter.capabilities.rrset).toBe(true);
    expect(gcpDnsAdapter.capabilities.multiValue).toBe(true);
    expect(gcpDnsAdapter.capabilities.autoTtl).toBe(false);
  }),
);

test.provider(
  "constructs native record sets with normalized names and values",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const bound = yield* DNS.bind(zone).pipe(
          Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
        );
        const handle = yield* bound.record({
          name: "www",
          type: "A",
          values: ["203.0.113.10", "203.0.113.11"],
          ttl: 120,
        });
        const resource = handle.resource as GCP.DNS.ResourceRecordSet;
        expect(resource.Type).toBe("GCP.DNS.ResourceRecordSet");
        expect(resource.Props.managedZone).toBe("managed-zone");
        expect(resource.Props.name).toBeDefined();
        expect(resource.Props.type).toBe("A");
        expect(resource.Props.rrdatas).toEqual([
          "203.0.113.10",
          "203.0.113.11",
        ]);
        expect(resource.Props.ttl).toBe(120);
        expect(handle.recordName).toBeDefined();
      }),
    ),
);

test.provider("normalizes apex and forwards fully-qualified names", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const bound = yield* DNS.bind(zone).pipe(
        Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
      );
      const apex = yield* bound.record({
        name: "@",
        type: "TXT",
        values: ['"verification"'],
      });
      const fqdn = yield* bound.record({
        name: "api.example.com.",
        type: "AAAA",
        values: ["2001:db8::10"],
      });
      expect(
        (apex.resource as GCP.DNS.ResourceRecordSet).Props.name,
      ).toBeDefined();
      expect(
        (fqdn.resource as GCP.DNS.ResourceRecordSet).Props.name,
      ).toBeDefined();
    }),
  ),
);

test.provider("rejects automatic TTL and invalid zone identities", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const auto = yield* DNS.bind(zone).pipe(
        Effect.flatMap((bound) =>
          bound.record({
            name: "www",
            type: "A",
            values: ["203.0.113.10"],
            ttl: "auto",
          }),
        ),
        Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
        Effect.flip,
      );
      expect(auto.reason).toBe("unsupported");
      expect(auto.message).toContain("automatic TTL");

      const identity = yield* DNS.bind({
        type: "gcp",
        identity: { kind: "route53", id: "zone", name: "example.com" },
      }).pipe(
        Effect.flatMap((bound) =>
          bound.record({ name: "www", type: "A", values: ["203.0.113.10"] }),
        ),
        Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
        Effect.flip,
      );
      expect(identity.reason).toBe("invalid-zone");
    }),
  ),
);

test.provider(
  "requires explicit ids for unresolved names and preserves explicit ids",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const unresolved = Effect.succeed("www");
        const missing = yield* DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              name: unresolved,
              type: "A",
              values: ["203.0.113.10"],
            }),
          ),
          Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
          Effect.flip,
        );
        expect(missing.reason).toBe("unsupported");
        expect(missing.message).toContain("concrete");

        const handle = yield* DNS.bind(zone).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              id: "StableRecord",
              name: unresolved,
              type: "A",
              values: ["203.0.113.10"],
            }),
          ),
          Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
        );
        expect((handle.resource as GCP.DNS.ResourceRecordSet).LogicalId).toBe(
          "StableRecord",
        );
      }),
    ),
);

test.provider(
  "maps subdomain hostname targets to CNAME and rejects apex targets",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const bound = yield* DNS.bind(zone).pipe(
          Effect.provide(DNS.adapterLayer(gcpDnsAdapter)),
        );
        const target = yield* bound.hostnameTarget({
          name: "validation",
          target: "validation.example.net.",
        });
        const resource = target.resource as GCP.DNS.ResourceRecordSet;
        expect(resource.Props.type).toBe("CNAME");
        expect(resource.Props.rrdatas).toEqual(["validation.example.net."]);

        const undotted = yield* bound.hostnameTarget({
          name: "aws-alb",
          target: "internal-alb.amazonaws.com",
        });
        expect(
          (undotted.resource as GCP.DNS.ResourceRecordSet).Props.rrdatas,
        ).toEqual(["internal-alb.amazonaws.com."]);

        const dotted = yield* bound.hostnameTarget({
          name: "aws-alb-dotted",
          target: "internal-alb.amazonaws.com.",
        });
        expect(
          (dotted.resource as GCP.DNS.ResourceRecordSet).Props.rrdatas,
        ).toEqual(["internal-alb.amazonaws.com."]);

        const deferredTarget = Effect.succeed("cloudfront.amazonaws.com");
        const deferred = yield* bound.hostnameTarget({
          name: "aws-cloudfront",
          target: deferredTarget,
        });
        const deferredRrdatas = (deferred.resource as GCP.DNS.ResourceRecordSet)
          .Props.rrdatas;
        expect(Output.isOutput(deferredRrdatas?.[0])).toBe(true);
        expect(deferredRrdatas?.[0]).not.toBe(deferredTarget);

        const apex = yield* bound
          .hostnameTarget({
            name: "@",
            target: "validation.example.net.",
          })
          .pipe(Effect.flip);
        expect(apex.reason).toBe("unsupported");
        expect(apex.message).toContain("zone apex");
      }),
    ),
);

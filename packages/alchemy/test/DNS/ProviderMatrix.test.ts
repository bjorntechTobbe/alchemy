import * as DNS from "@/DNS";
import * as Provider from "@/Provider";
import { inMemoryState } from "@/State";
import * as Test from "@/Test/Alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect } from "alchemy-test";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { gcpDnsAdapter, gcpZone } from "@/GCP/DNS/Adapter";
import { hetznerDnsAdapter, hetznerZone } from "@/Hetzner/Adapter";
import { route53DnsAdapter, route53Zone } from "@/AWS/Route53/Adapter";
import { Record as Route53Record } from "@/AWS/Route53/Record";
import { Records as Route53Records } from "@/AWS/Route53/Records";
import { Record as CloudflareRecord } from "@/Cloudflare/DNS/Record";
import { ResourceRecordSet } from "@/GCP/DNS/ResourceRecordSet";
import { RecordSet as HetznerRecordSet } from "@/Hetzner/RecordSet";
import type { ResourceClass, ResourceLike } from "@/Resource";

const fakeProvider = <T extends ResourceLike>(resource: ResourceClass<T>) =>
  Provider.succeed(resource, {
    list: () => Effect.succeed([]),
    diff: () => Effect.succeed(undefined),
    reconcile: Effect.fn(function* ({ output }) {
      return output ?? ({} as never);
    }),
    delete: () => Effect.void,
  });

const providers = Layer.mergeAll(
  fakeProvider(Route53Record),
  fakeProvider(Route53Records),
  fakeProvider(CloudflareRecord),
  fakeProvider(ResourceRecordSet),
  fakeProvider(HetznerRecordSet),
);

const zones = [
  {
    name: "route53",
    zone: route53Zone("Z-MATRIX", "example.com.", {
      aliasHostedZoneId: "Z-TARGET",
    }),
    adapter: route53DnsAdapter,
  },
  {
    name: "cloudflare",
    zone: cloudflareZone("CF-MATRIX", "example.com."),
    adapter: cloudflareDnsAdapter,
  },
  {
    name: "gcp",
    zone: gcpZone("gcp-matrix", "example.com."),
    adapter: gcpDnsAdapter,
  },
  {
    name: "hetzner",
    zone: hetznerZone(4242, "example.com."),
    adapter: hetznerDnsAdapter,
  },
] as const;

describe("DNS provider matrix", { tags: ["unit", "local"] }, () => {
  const { test } = Test.make({ providers, state: inMemoryState() });

  test.provider(
    "registers all core DNS adapters concurrently without shadowing native resources",
    (stack) =>
      stack.plan(
        Effect.gen(function* () {
          const aggregate = DNS.adapterLayer(
            ...zones.map(({ adapter }) => adapter),
          );
          const logicalIds = new Map<string, string>();

          for (const { name, zone, adapter } of zones) {
            const bound = yield* DNS.bind(zone).pipe(Effect.provide(aggregate));
            const handle = yield* bound.record({
              name: "www",
              type: "A",
              values: ["203.0.113.10"],
              ttl: 300,
            });
            const native = handle.resource as {
              Type: string;
              LogicalId: string;
              Props: Record<string, unknown>;
            };
            logicalIds.set(name, native.LogicalId);

            expect(native.Type).toBe(
              {
                route53: "AWS.Route53.Record",
                cloudflare: "Cloudflare.DNS.Record",
                gcp: "GCP.DNS.ResourceRecordSet",
                hetzner: "Hetzner.RecordSet",
              }[name],
            );
            expect(native.Props).toBeDefined();
            expect(handle.recordName).toBeDefined();
          }

          expect(new Set(logicalIds.values()).size).toBe(4);

          const route53Bound = yield* DNS.bind(zones[0].zone).pipe(
            Effect.provide(aggregate),
          );
          const alias = yield* route53Bound.hostnameTarget({
            name: "app",
            target: "d123.example.net.",
            targetMetadata: { aliasHostedZoneId: "Z-ALIAS" },
          });
          const aliasNative = alias.resource as {
            Type: string;
            Props: Record<string, any>;
          };
          expect(aliasNative.Type).toBe("AWS.Route53.Record");
          expect(aliasNative.Props.aliasTarget).toEqual({
            hostedZoneId: "Z-ALIAS",
            dnsName: "d123.example.net.",
          });

          for (const { name, zone } of zones) {
            const bound = yield* DNS.bind(zone).pipe(Effect.provide(aggregate));
            const target = yield* bound.hostnameTarget({
              name: "validation",
              target: "target.example.net.",
              ...(name === "route53"
                ? { targetMetadata: { aliasHostedZoneId: "Z-TARGET" } }
                : {}),
            });
            const native = target.resource as {
              Type: string;
              Props: Record<string, unknown>;
            };
            expect(native.Type).toBe(
              name === "route53"
                ? "AWS.Route53.Record"
                : name === "cloudflare"
                  ? "Cloudflare.DNS.Record"
                  : name === "gcp"
                    ? "GCP.DNS.ResourceRecordSet"
                    : "Hetzner.RecordSet",
            );
            expect(native.Props).toBeDefined();
          }

          for (const { name, zone } of zones.filter(
            ({ name }) => name !== "cloudflare",
          )) {
            const bound = yield* DNS.bind(zone).pipe(Effect.provide(aggregate));
            const many = yield* bound.record({
              name: "pool",
              type: "A",
              values: ["203.0.113.10", "203.0.113.11"],
            });
            expect(many.resource).toBeDefined();
            expect(name).not.toBe("cloudflare");
          }

          const cloudflareBound = yield* DNS.bind(zones[1].zone).pipe(
            Effect.provide(aggregate),
          );
          const many = yield* cloudflareBound
            .record({
              name: "www",
              type: "A",
              values: ["203.0.113.10", "203.0.113.11"],
            })
            .pipe(Effect.flip);
          expect(many.reason).toBe("unsupported");

          for (const { zone, name } of zones.slice(2)) {
            const bound = yield* DNS.bind(zone).pipe(Effect.provide(aggregate));
            const apex = yield* bound
              .hostnameTarget({ name: "@", target: "target.example.net." })
              .pipe(Effect.flip);
            expect(apex.reason).toBe("unsupported");
            expect(apex.message).toContain("zone apex");
            expect(name).toMatch(/^(gcp|hetzner)$/);
          }

          for (const { zone } of zones) {
            const bound = yield* DNS.bind(zone).pipe(Effect.provide(aggregate));
            const concrete = yield* bound.record({
              name: "api",
              type: "A",
              values: ["203.0.113.20"],
            });
            const wildcard = yield* bound.record({
              name: "*.example.com.",
              type: "A",
              values: ["203.0.113.20"],
            });
            expect(
              (concrete.resource as { LogicalId: string }).LogicalId,
            ).not.toBe((wildcard.resource as { LogicalId: string }).LogicalId);
          }
        }),
      ),
    { tags: ["unit", "local", "provider:dns"] },
  );
});

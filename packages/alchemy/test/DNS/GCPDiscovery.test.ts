import {
  gcpDns,
  gcpDnsAdapter,
  gcpZone,
  selectGcpManagedZone,
  selectGcpManagedZonePages,
} from "@/GCP/DNS/Adapter";
import * as DNS from "@/DNS";
import * as Test from "@/Test/Alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expect } from "alchemy-test";

const { test } = Test.make({ providers: Layer.empty });

const managedZone = (name: string, dnsName: string, visibility = "public") =>
  ({ name, dnsName, visibility }) as never;

test.provider("selects the longest canonical label-boundary suffix", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const selected = yield* selectGcpManagedZone("API.Dev.Example.COM.", [
        managedZone("root", "example.com."),
        managedZone("dev", "DEV.EXAMPLE.COM"),
        managedZone("not-a-match", "xample.com."),
      ]);
      expect(selected).toEqual({
        type: "gcp",
        identity: { kind: "gcp", id: "dev", name: "DEV.EXAMPLE.COM" },
      });
    }),
  ),
);

test.provider(
  "flattens mocked managed-zone pages for project discovery",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const selected = yield* selectGcpManagedZonePages("api.example.com", [
          { managedZones: [managedZone("root", "example.com.")] },
          { managedZones: [managedZone("child", "api.example.com.")] },
        ]);
        expect(selected.identity.id).toBe("child");
      }),
    ),
);

test.provider(
  "rejects missing and duplicate public/private best zones",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const missing = yield* selectGcpManagedZone("www.other.net", [
          managedZone("zone", "example.com."),
        ]).pipe(Effect.flip);
        expect(missing.reason).toBe("zone-not-found");

        const duplicate = yield* selectGcpManagedZone("www.example.com.", [
          managedZone("public", "example.com.", "public"),
          managedZone("private", "EXAMPLE.COM", "private"),
        ]).pipe(Effect.flip);
        expect(duplicate.reason).toBe("ambiguous-zone");
      }),
    ),
);

test.provider(
  "gcpDns exposes the selector and explicit zones remain network-free",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const selector = gcpDns();
        expect(selector.type).toBe("gcp");
        expect(gcpZone("managed-zone", "example.com.").identity.id).toBe(
          "managed-zone",
        );
        const explicit = yield* DNS.bind(
          gcpZone("managed-zone", "example.com."),
        ).pipe(Effect.provide(DNS.adapterLayer(gcpDnsAdapter)));
        expect(explicit.zone.identity.id).toBe("managed-zone");
      }),
    ),
);

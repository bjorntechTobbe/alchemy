import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expect } from "alchemy-test";
import * as DNS from "@/DNS";
import { hetznerDnsAdapter, hetznerZone } from "@/Hetzner/Adapter";
import * as HetznerDNS from "@/Hetzner/ZoneLookup";
import * as Test from "@/Test/Alchemy";

const { test } = Test.make({ providers: Layer.empty });

const zones = [
  { id: 1, name: "example.com." },
  { id: 2, name: "api.example.com" },
];

test.provider("selects the longest canonical dot-boundary match", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const selected = yield* HetznerDNS.selectHetznerZone(
        "WWW.API.EXAMPLE.COM.",
        zones,
      );
      expect(selected.id).toBe(2);
    }),
  ),
);

test.provider("does not match a partial label suffix", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const error = yield* HetznerDNS.selectHetznerZone(
        "badexample.com",
        zones,
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(DNS.DnsError);
      expect(error.reason).toBe("zone-not-found");
    }),
  ),
);

test.provider("rejects equally specific duplicate zones", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const error = yield* HetznerDNS.selectHetznerZone("www.example.com", [
        { id: 1, name: "example.com" },
        { id: 2, name: "EXAMPLE.COM." },
      ]).pipe(Effect.flip);
      expect(error.reason).toBe("ambiguous-zone");
    }),
  ),
);

test.provider("explicit zone descriptors bypass discovery", (stack) =>
  stack.plan(
    Effect.gen(function* () {
      const zone = HetznerDNS.dns();
      expect(zone.type).toBe("hetzner");
      expect(hetznerZone(42, "example.com").identity.id).toBe("42");
      expect(hetznerDnsAdapter.type).toBe("hetzner");
    }),
  ),
);

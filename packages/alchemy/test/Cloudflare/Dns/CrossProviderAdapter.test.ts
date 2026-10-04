import * as Cloudflare from "@/Cloudflare";
import { cloudflareDnsAdapter } from "@/Cloudflare/DNS/Adapter";
import * as DNS from "@/DNS";
import * as Test from "@/Test/Alchemy";
import * as dns from "@distilled.cloud/cloudflare/dns";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

const { test } = Test.make({ providers: Cloudflare.providers() });

const domain = process.env.DOMAIN;
if (!domain) {
  throw new Error("DOMAIN is required for the Cloudflare DNS live test");
}

const recordName = `alchemy-cross-provider-cf-test.${domain}`;
const initialAddress = "192.0.2.41";
const updatedAddress = "192.0.2.42";

const findRecord = (zoneId: string) =>
  dns.listRecords
    .items({
      zoneId,
      name: { exact: recordName },
      type: "A",
    })
    .pipe(
      Stream.filter(
        (record) => record.name === recordName && record.type === "A",
      ),
      Stream.runCollect,
      Effect.map((records) => Array.from(records)[0]),
    );

const discoveredZone = DNS.bind(Cloudflare.DNS.dns(), recordName).pipe(
  Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
);

const nativeRecord = (content: string) =>
  DNS.bind(Cloudflare.DNS.dns(), recordName).pipe(
    Effect.flatMap((bound) =>
      bound.record({
        id: "CrossProviderCloudflareRecord",
        name: recordName,
        type: "A",
        values: [content],
        ttl: 120,
      }),
    ),
    Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
  );

test.provider(
  "uses the shared Cloudflare domain for native adapter record CRUD",
  (stack) =>
    Effect.gen(function* () {
      // Discovery belongs to the provider selector. The discovered identity is
      // used only for collision checks and independent verification.
      const bound = yield* discoveredZone;
      const zoneId = bound.zone.identity.id;
      if (typeof zoneId !== "string") {
        return yield* Effect.fail(
          new Error("Cloudflare DNS selector returned a deferred zone id"),
        );
      }

      // Never adopt, overwrite, or delete a pre-existing record. A collision
      // is an explicit failure, including after an interrupted prior run.
      const before = yield* findRecord(zoneId);
      if (before) {
        return yield* Effect.fail(
          new Error("Cloudflare DNS live-test record name is already in use"),
        );
      }

      yield* stack.destroy();

      yield* Effect.gen(function* () {
        const created = yield* stack.deploy(nativeRecord(initialAddress));
        expect(created.resource).toBeDefined();

        const observed = yield* findRecord(zoneId);
        expect(observed?.id).toBeDefined();
        expect(observed?.name).toBe(recordName);
        expect(observed?.content).toBe(initialAddress);

        const updated = yield* stack.deploy(nativeRecord(updatedAddress));
        expect(updated.resource).toBeDefined();

        const observedUpdate = yield* findRecord(zoneId);
        expect(observedUpdate?.id).toBe(observed?.id);
        expect(observedUpdate?.content).toBe(updatedAddress);
      }).pipe(Effect.ensuring(Effect.ignore(stack.destroy())));

      const after = yield* findRecord(zoneId);
      expect(after).toBeUndefined();
    }),
  {
    tags: [
      "provider:cloudflare",
      "provider:cloudflare:dns",
      "provider:cloudflare:zone",
      "live",
    ],
    timeout: 120_000,
    retry: 0,
  },
);

import { Unowned } from "@/AdoptPolicy.ts";
import type { CloudflareResolvedCredentials } from "@/Cloudflare/Auth/AuthConfig.ts";
import { CloudflareEnvironment } from "@/Cloudflare/CloudflareEnvironment.ts";
import {
  Record as DNSRecord,
  RecordProvider,
} from "@/Cloudflare/DNS/Record.ts";
import * as Provider from "@/Provider.ts";
import {
  apiTokenCredentials,
  Credentials,
} from "@distilled.cloud/cloudflare/Credentials";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, test } from "alchemy-test";

const zoneId = "zone-123";
const accountId = "0123456789abcdef0123456789abcdef";
const name = "api.example.com";

type WireRecord = {
  id: string;
  zone_id: string;
  name: string;
  type: "A";
  content: string;
  ttl: number;
  proxied: boolean;
  created_on: string;
  modified_on: string;
};

type Call = {
  method: string;
  url: string;
  body?: globalThis.Record<string, unknown>;
};

const record = (id: string, content: string): WireRecord => ({
  id,
  zone_id: zoneId,
  name,
  type: "A",
  content,
  ttl: 300,
  proxied: false,
  created_on: "2026-01-01T00:00:00.000Z",
  modified_on: "2026-01-01T00:00:00.000Z",
});

const fakeCloudflare = (records: WireRecord[]) => {
  const calls: Call[] = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = request?.method ?? init?.method ?? "GET";
    const bodyText = request ? await request.text() : init?.body;
    const body = bodyText ? JSON.parse(String(bodyText)) : undefined;
    calls.push({ method, url: url.toString(), body });

    if (url.pathname === `/client/v4/zones/${zoneId}` && method === "GET") {
      return Response.json({
        success: true,
        result: { id: zoneId, name: "example.com" },
        errors: [],
        messages: [],
      });
    }
    if (!url.pathname.startsWith(`/client/v4/zones/${zoneId}/dns_records`)) {
      throw new Error(`Unexpected Cloudflare URL: ${method} ${url}`);
    }

    const match = url.pathname.match(/dns_records(?:\/([^/]+))?$/)?.[1];
    if (method === "GET" && match) {
      const found = records.find((item) => item.id === match);
      if (!found)
        return Response.json(
          {
            success: false,
            errors: [{ code: 81044, message: "Record not found" }],
          },
          { status: 404 },
        );
      return Response.json({
        success: true,
        result: found,
        errors: [],
        messages: [],
      });
    }
    if (method === "GET" && !match) {
      return Response.json({
        success: true,
        result: records,
        result_info: { page: 1, total_pages: 1 },
        errors: [],
        messages: [],
      });
    }
    if (method === "PUT" && match) {
      const index = records.findIndex((item) => item.id === match);
      if (index < 0)
        return Response.json(
          {
            success: false,
            errors: [{ code: 81044, message: "Record not found" }],
          },
          { status: 404 },
        );
      records[index] = {
        ...records[index]!,
        ...body,
        id: match,
        zone_id: zoneId,
      } as WireRecord;
      return Response.json({
        success: true,
        result: records[index],
        errors: [],
        messages: [],
      });
    }
    if (method === "DELETE" && match) {
      const index = records.findIndex((item) => item.id === match);
      if (index < 0)
        return Response.json(
          {
            success: false,
            errors: [{ code: 81044, message: "Record not found" }],
          },
          { status: 404 },
        );
      records.splice(index, 1);
      return Response.json({
        success: true,
        result: {},
        errors: [],
        messages: [],
      });
    }
    throw new Error(`Unexpected Cloudflare operation: ${method} ${url}`);
  };
  const fetch = Object.assign(fetchImpl, { preconnect: () => {} });
  return {
    calls,
    records,
    layer: FetchHttpClient.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
    ),
  };
};

const services = (transport: Layer.Layer<any, never, never>) =>
  Layer.mergeAll(
    RecordProvider(),
    Layer.succeed(
      CloudflareEnvironment,
      Effect.succeed({
        type: "apiToken",
        apiToken: Redacted.make("offline-token"),
        accountId,
        source: { type: "env" },
      } satisfies CloudflareResolvedCredentials),
    ),
    Layer.succeed(
      Credentials,
      Effect.succeed(apiTokenCredentials({ apiToken: "offline-token" })),
    ),
  ).pipe(Layer.provideMerge(transport));

const context = {
  id: "DnsRecord",
  fqn: "OfflineStack/DnsRecord",
  instanceId: "offline-instance",
  bindings: [],
  session: {
    emit: () => Effect.void,
    done: () => Effect.void,
    note: () => Effect.void,
  },
};

const props = (content: string) => ({
  zoneId,
  name,
  type: "A" as const,
  content,
  ttl: 300,
  proxied: false,
});

test("native Cloudflare DNS read marks a matching foreign record Unowned without writes", async () => {
  const http = fakeCloudflare([record("foreign-a", "203.0.113.10")]);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<DNSRecord>(DNSRecord.Type);
      return yield* provider.read!({
        ...context,
        olds: props("203.0.113.10"),
        output: undefined,
      });
    }).pipe(Effect.provide(services(http.layer))),
  );
  expect(result).toBeDefined();
  expect(Unowned.is(result)).toBe(true);
  expect(result?.recordId).toBe("foreign-a");
  expect(http.calls.map(({ method }) => method)).toEqual(["GET", "GET"]);
});

test("native Cloudflare DNS reconcile and delete use only persisted ID", async () => {
  const owned = record("owned-a", "203.0.113.10");
  const foreign = record("foreign-a", "203.0.113.10");
  const http = fakeCloudflare([owned, foreign]);
  await Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<DNSRecord>(DNSRecord.Type);
      const output = {
        recordId: owned.id,
        zoneId,
        name,
        type: "A" as const,
        content: owned.content,
        ttl: owned.ttl,
        proxied: false,
        createdOn: owned.created_on,
        modifiedOn: owned.modified_on,
      };
      const updated = yield* provider.reconcile!({
        ...context,
        news: props("203.0.113.11"),
        olds: props(owned.content),
        output,
      });
      expect(updated.recordId).toBe("owned-a");
      yield* provider.delete({
        ...context,
        olds: props("203.0.113.11"),
        output: updated,
      });
    }).pipe(Effect.provide(services(http.layer))),
  );
  expect(
    http.calls.map(({ method, url }) => `${method} ${new URL(url).pathname}`),
  ).toEqual([
    "GET /client/v4/zones/zone-123/dns_records/owned-a",
    "PUT /client/v4/zones/zone-123/dns_records/owned-a",
    "DELETE /client/v4/zones/zone-123/dns_records/owned-a",
  ]);
  expect(http.calls[1]?.url).toContain("/owned-a");
  expect(http.calls[2]?.url).toContain("/owned-a");
  expect(http.calls.some(({ url }) => url.includes("foreign-a"))).toBe(false);
  expect(http.records).toEqual([foreign]);
});

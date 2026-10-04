import { OwnedBySomeoneElse, Unowned } from "@/AdoptPolicy.ts";
import { Records, RecordsProvider } from "@/AWS/Route53/Records.ts";
import * as Provider from "@/Provider.ts";
import type { ScopedPlanStatusSession } from "@/Report.ts";
import * as route53 from "@distilled.cloud/aws/route-53";
import { fromCredentials, Credentials } from "@distilled.cloud/aws/Credentials";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, test } from "alchemy-test";

const zoneId = "Z123";
type Wire = { name: string; type: "A"; ttl: number; value: string };
type Call = { action: string; body: string; url: string };

const xml = (records: Wire[]) =>
  `<ListResourceRecordSetsResponse><ResourceRecordSets>${records
    .map(
      (record) =>
        `<ResourceRecordSet><Name>${record.name}.</Name><Type>${record.type}</Type><TTL>${record.ttl}</TTL><ResourceRecords><ResourceRecord><Value>${record.value}</Value></ResourceRecord></ResourceRecords></ResourceRecordSet>`,
    )
    .join("")}</ResourceRecordSets></ListResourceRecordSetsResponse>`;

const fakeRoute53 = (initial: Wire[], pages?: string[]) => {
  const records = [...initial];
  const calls: Call[] = [];
  let listPage = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = request?.method ?? init?.method ?? "GET";
    if (url.hostname !== "route53.amazonaws.com") {
      throw new Error(`Unexpected Route53 URL: ${url}`);
    }
    const body = request ? await request.text() : String(init?.body ?? "");
    const action = body.match(/<(?:[^:>]+:)?Action>([^<]+)/)?.[1] ?? "";
    calls.push({
      action:
        method === "POST" && url.pathname.endsWith("/rrset")
          ? "ChangeResourceRecordSets"
          : action,
      body,
      url: url.toString(),
    });
    if (method === "GET" && url.pathname.endsWith("/rrset")) {
      return new Response(pages?.[listPage++] ?? xml(records), { status: 200 });
    }
    if (method === "GET" && url.pathname.includes("/change/")) {
      return new Response(
        "<GetChangeResponse><ChangeInfo><Status>INSYNC</Status></ChangeInfo></GetChangeResponse>",
        { status: 200 },
      );
    }
    if (method === "POST" && url.pathname.endsWith("/rrset")) {
      const change = body.match(
        /<Action>(CREATE|UPSERT|DELETE)<\/Action>/,
      )?.[1];
      const name = body.match(/<Name>([^<]+)<\/Name>/)?.[1]?.replace(/\.$/, "");
      const value = body.match(/<Value>([^<]+)<\/Value>/)?.[1];
      if (!change || !name) throw new Error("Malformed change request");
      const index = records.findIndex((record) => record.name === name);
      if (change === "DELETE") records.splice(index, 1);
      else if (index < 0)
        records.push({ name, type: "A", ttl: 60, value: value! });
      else records[index] = { ...records[index]!, value: value! };
      return new Response(
        "<ChangeResourceRecordSetsResponse><ChangeInfo><Id>/change/C1</Id><Status>INSYNC</Status></ChangeInfo></ChangeResourceRecordSetsResponse>",
        { status: 200 },
      );
    }
    if (action === "GetChange") {
      return new Response(
        "<GetChangeResponse><ChangeInfo><Status>INSYNC</Status></ChangeInfo></GetChangeResponse>",
        { status: 200 },
      );
    }
    throw new Error(`Unexpected Route53 operation: ${action}`);
  };
  return {
    records,
    calls,
    layer: FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(
          FetchHttpClient.Fetch,
          Object.assign(fetch, { preconnect: () => {} }),
        ),
      ),
    ),
  };
};

const credentials = fromCredentials(
  { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "test-secret" },
  "us-east-1",
);
const services = (transport: Layer.Layer<never, never, never>) => {
  const ambient = Layer.mergeAll(
    transport,
    credentials.pipe(Layer.provide(transport)),
  );
  return Layer.mergeAll(
    RecordsProvider().pipe(Layer.provide(ambient)),
    ambient,
  );
};

// Importing the type through the service keeps this test bound to the native
// provider contract rather than exercising a Provider.findProvider wrapper.
const session: ScopedPlanStatusSession = {
  emit: () => Effect.void,
  done: () => Effect.void,
  note: (_message: string) => Effect.void,
};
const context = {
  id: "Records",
  fqn: "Offline/Records",
  instanceId: "offline",
  bindings: [],
  session,
};
const props = (names: string[], records: string[] = ['"v"']) => ({
  hostedZoneId: zoneId,
  type: "A" as const,
  names,
  ttl: "60 seconds" as const,
  records,
});
const output = (names: string[], records: string[] = ['"v"']) => ({
  hostedZoneId: zoneId,
  type: "A" as const,
  names,
  ttl: 60,
  records,
  aliasTarget: undefined,
});

type RecordsResource = import("@/AWS/Route53/Records.ts").Records;

test("native Records read marks any initial foreign name unowned", async () => {
  const http = fakeRoute53([
    { name: "foreign.example.com", type: "A", ttl: 60, value: '"v"' },
  ]);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const p = yield* Provider.Provider<RecordsResource>(Records.Type);
      return yield* p.read!({
        ...context,
        olds: props(["foreign.example.com", "new.example.com"]),
        output: undefined,
      });
    }).pipe(Effect.provide(services(http.layer)), Effect.provide(http.layer)),
  );
  expect(Unowned.is(result)).toBe(true);
  expect(
    http.calls.filter((call) => call.action === "ChangeResourceRecordSets"),
  ).toHaveLength(0);
});

test("native Records lookup follows paginated routing-policy siblings", async () => {
  const first = `<ListResourceRecordSetsResponse><ResourceRecordSets><ResourceRecordSet><Name>api.example.com.</Name><Type>A</Type><TTL>60</TTL><SetIdentifier>foreign-id</SetIdentifier><ResourceRecords><ResourceRecord><Value>\"foreign\"</Value></ResourceRecord></ResourceRecords></ResourceRecordSet></ResourceRecordSets><IsTruncated>true</IsTruncated><NextRecordName>api.example.com.</NextRecordName><NextRecordType>A</NextRecordType><NextRecordIdentifier>target-id</NextRecordIdentifier></ListResourceRecordSetsResponse>`;
  const second = `<ListResourceRecordSetsResponse><ResourceRecordSets><ResourceRecordSet><Name>API.Example.com.</Name><Type>A</Type><TTL>60</TTL><ResourceRecords><ResourceRecord><Value>\"owned\"</Value></ResourceRecord></ResourceRecords></ResourceRecordSet></ResourceRecordSets><IsTruncated>false</IsTruncated></ListResourceRecordSetsResponse>`;
  const http = fakeRoute53([], [first, second]);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const p = yield* Provider.Provider<RecordsResource>(Records.Type);
      return yield* p.read!({
        ...context,
        olds: props(["api.example.com"]),
        output: undefined,
      });
    }).pipe(Effect.provide(services(http.layer)), Effect.provide(http.layer)),
  );
  expect(Unowned.is(result)).toBe(true);
  expect(http.calls[1]?.url).toContain("target-id");
});

test("native Records preflights added names before changing an owned sibling", async () => {
  const http = fakeRoute53([
    { name: "a.example.com", type: "A", ttl: 60, value: '"old"' },
    { name: "b.example.com", type: "A", ttl: 60, value: '"foreign"' },
  ]);
  const error = await Effect.runPromise(
    Effect.gen(function* () {
      const p = yield* Provider.Provider<RecordsResource>(Records.Type);
      return yield* p.reconcile!({
        ...context,
        olds: props(["a.example.com"]),
        news: props(["a.example.com", "b.example.com"], ['"new"']),
        output: output(["a.example.com"], ['"old"']),
      });
    }).pipe(
      Effect.provide(services(http.layer)),
      Effect.provide(http.layer),
      Effect.flip,
    ),
  );
  expect(error).toBeInstanceOf(OwnedBySomeoneElse);
  expect(
    http.calls.filter((call) => call.action === "ChangeResourceRecordSets"),
  ).toHaveLength(0);
  expect(http.records).toHaveLength(2);
});

test("native Records creates every new name with CREATE and deletes only persisted names", async () => {
  const http = fakeRoute53([]);
  await Effect.runPromise(
    Effect.gen(function* () {
      const p = yield* Provider.Provider<RecordsResource>(Records.Type);
      const created = yield* p.reconcile!({
        ...context,
        olds: undefined,
        news: props(["a.example.com", "b.example.com"]),
        output: undefined,
      });
      expect(
        http.calls.filter(
          (call) => call.action === "ChangeResourceRecordSets",
        )[0]?.body,
      ).toContain("<Action>CREATE</Action>");
      yield* p.delete!({
        ...context,
        olds: props(["a.example.com", "b.example.com"]),
        output: created,
      });
    }).pipe(Effect.provide(services(http.layer)), Effect.provide(http.layer)),
  );
  expect(http.records).toEqual([]);
  const changes = http.calls.filter(
    (call) => call.action === "ChangeResourceRecordSets",
  );
  expect(changes).toHaveLength(2);
  expect(changes[1]?.body).toContain("<Action>DELETE</Action>");
});

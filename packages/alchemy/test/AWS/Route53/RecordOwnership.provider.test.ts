import { Record, RecordProvider } from "@/AWS/Route53/Record.ts";
import { Unowned } from "@/AdoptPolicy.ts";
import * as Provider from "@/Provider.ts";
import * as Credentials from "@distilled.cloud/aws/Credentials";
import * as Endpoint from "@distilled.cloud/aws/Endpoint";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, test } from "alchemy-test";

const zoneId = "ZOWNED";
const name = "Api.Example.com";
const wireName = "api.example.com.";

type Call = { url: string; body: string };

const xml = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });

const fakeRoute53 = (
  recordSet?: string,
  rejectChange = false,
  listPages?: string[],
) => {
  const calls: Call[] = [];
  let listPage = 0;
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const body = request ? await request.text() : String(init?.body ?? "");
    calls.push({ url: url.toString(), body });
    if (
      url.pathname !== "/2013-04-01/hostedzone/ZOWNED/rrset" &&
      url.pathname !== "/2013-04-01/change/C1"
    ) {
      throw new Error(`Unexpected Route53 request: ${url.pathname}`);
    }
    if (url.pathname.endsWith("/rrset") && body.includes("<ChangeBatch>")) {
      if (rejectChange) {
        return new Response(
          `<ErrorResponse><Error><Type>Sender</Type><Code>InvalidChangeBatch</Code><Message>already exists</Message></Error></ErrorResponse>`,
          { status: 400, headers: { "content-type": "text/xml" } },
        );
      }
      return xml(
        `<ChangeResourceRecordSetsResponse><ChangeInfo><Id>/change/C1</Id><Status>PENDING</Status></ChangeInfo></ChangeResourceRecordSetsResponse>`,
      );
    }
    if (url.pathname.endsWith("/change/C1")) {
      return xml(
        `<GetChangeResponse><ChangeInfo><Id>/change/C1</Id><Status>INSYNC</Status></ChangeInfo></GetChangeResponse>`,
      );
    }
    return xml(
      listPages?.[listPage++] ??
        `<ListResourceRecordSetsResponse><ResourceRecordSets>${recordSet ?? ""}</ResourceRecordSets><IsTruncated>false</IsTruncated></ListResourceRecordSetsResponse>`,
    );
  };
  const fetch = Object.assign(fetchImpl, { preconnect: () => {} });
  return {
    calls,
    layer: FetchHttpClient.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
    ),
  };
};

const services = (transport: Layer.Layer<never, never, never>) =>
  Layer.mergeAll(
    RecordProvider(),
    Credentials.mock,
    Endpoint.of("https://route53.amazonaws.com"),
  ).pipe(Layer.provideMerge(transport));

const context = {
  id: "Route53Record",
  fqn: "OfflineStack/Route53Record",
  instanceId: "offline-instance",
  bindings: [],
  session: {
    emit: () => Effect.void,
    done: () => Effect.void,
    note: () => Effect.void,
  },
};

const props = (value: string) => ({
  hostedZoneId: zoneId,
  name,
  type: "A" as const,
  ttl: 60,
  records: [value],
});

test("Route53 record lookup follows all pagination cursor fields", async () => {
  const first = `<ListResourceRecordSetsResponse><ResourceRecordSets>${rrset('"foreign"', "other-id")}</ResourceRecordSets><IsTruncated>true</IsTruncated><NextRecordName>Api.Example.com.</NextRecordName><NextRecordType>A</NextRecordType><NextRecordIdentifier>target-id</NextRecordIdentifier></ListResourceRecordSetsResponse>`;
  const second = `<ListResourceRecordSetsResponse><ResourceRecordSets>${rrset('"owned"', "target-id")}</ResourceRecordSets><IsTruncated>false</IsTruncated></ListResourceRecordSetsResponse>`;
  const http = fakeRoute53(undefined, false, [first, second]);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<Record>(Record.Type);
      return yield* provider.read!({
        ...context,
        olds: { ...props('"owned"'), setIdentifier: "target-id" },
        output: undefined,
      });
    }).pipe(
      Effect.provide(services(http.layer)),
      Effect.provide(Credentials.mock),
      Effect.provide(http.layer),
    ),
  );
  expect(Unowned.is(result)).toBe(true);
  expect(http.calls[1]?.url).toContain("target-id");
});

const rrset = (value: string, identifier?: string) =>
  `<ResourceRecordSet><Name>${wireName}</Name><Type>A</Type><TTL>60</TTL><ResourceRecords><ResourceRecord><Value>${value}</Value></ResourceRecord></ResourceRecords>${identifier ? `<SetIdentifier>${identifier}</SetIdentifier>` : ""}</ResourceRecordSet>`;

test("Route53 read treats mixed-case trailing-dot match as unowned and does not write", async () => {
  const http = fakeRoute53(rrset('"203.0.113.10"'));
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<Record>(Record.Type);
      return yield* provider.read!({
        ...context,
        olds: props('"203.0.113.10"'),
        output: undefined,
      });
    }).pipe(
      Effect.provide(services(http.layer)),
      Effect.provide(Credentials.mock),
      Effect.provide(http.layer),
    ),
  );
  expect(result).toBeDefined();
  expect(result?.name).toBe(wireName);
  expect(http.calls).toHaveLength(1);
});

test("Route53 new reconcile uses CREATE and propagates a concurrent conflict", async () => {
  const http = fakeRoute53(undefined, true);
  const result = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<Record>(Record.Type);
      return yield* provider.reconcile!({
        ...context,
        news: props('"203.0.113.10"'),
        olds: undefined,
        output: undefined,
      });
    }).pipe(
      Effect.provide(services(http.layer)),
      Effect.provide(Credentials.mock),
      Effect.provide(http.layer),
    ),
  );
  expect(result._tag).toBe("Failure");
  expect(http.calls[0]?.body).toContain("CREATE");
  expect(http.calls[0]?.body).not.toContain("UPSERT");
});

test("Route53 owned update uses UPSERT and delete serializes the owned RRset", async () => {
  const http = fakeRoute53(rrset('"203.0.113.11"'));
  await Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Provider<Record>(Record.Type);
      const output = {
        ...props('"203.0.113.10"'),
        name: wireName,
        aliasTarget: undefined,
        setIdentifier: undefined,
        weight: undefined,
        region: undefined,
        failover: undefined,
        geoLocation: undefined,
        geoProximityLocation: undefined,
        multiValueAnswer: undefined,
        cidrRoutingConfig: undefined,
        healthCheckId: undefined,
      };
      const updated = yield* provider.reconcile!({
        ...context,
        news: props('"203.0.113.11"'),
        olds: props('"203.0.113.10"'),
        output,
      });
      yield* provider.delete!({
        ...context,
        olds: props('"203.0.113.10"'),
        output: updated,
      });
    }).pipe(
      Effect.provide(services(http.layer)),
      Effect.provide(Credentials.mock),
      Effect.provide(http.layer),
    ),
  );
  expect(http.calls[0]?.body).toContain("UPSERT");
  const deleteCall = http.calls.find((call) => call.body.includes("DELETE"));
  expect(deleteCall?.body).toContain("DELETE");
  expect(deleteCall?.body).toContain("203.0.113.11");
});

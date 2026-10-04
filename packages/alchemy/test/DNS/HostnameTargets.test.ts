import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Test from "@/Test/Alchemy";
import { BoundZone, type DnsAdapter } from "@/DNS/Contract.ts";
import { createHostnameTargets } from "@/DNS/HostnameTargets.ts";

const requests: string[] = [];
const adapter: DnsAdapter = {
  type: "mock",
  capabilities: {
    record: true,
    rrset: false,
    multiValue: false,
    ttl: false,
    autoTtl: false,
    fqdn: true,
    hostnameTargets: true,
  },
  record: () => Effect.die("unused"),
  hostnameTarget: (request) => {
    requests.push(String(request.name));
    return Effect.succeed({
      resource: {} as never,
      recordName: request.name as never,
    });
  },
};
const zone = new BoundZone(
  { type: "mock", identity: { kind: "mock", id: "1", name: "example.com" } },
  adapter,
);

const { test } = Test.make({ providers: Layer.empty });

test.provider(
  "keeps wildcard and concrete hostname target IDs distinct",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        requests.length = 0;
        const result = yield* createHostnameTargets({
          zone,
          names: ["example.com", "*.example.com"],
          target: "target.example.net",
          idPrefix: "Site",
        });
        expect(result).toHaveLength(2);
        expect(requests).toEqual(["example.com", "*.example.com"]);
      }),
    ),
);

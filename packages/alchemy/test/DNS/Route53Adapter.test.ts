import {
  Route53DNSAdapter,
  route53DnsAdapter,
  route53Zone,
} from "@/AWS/Route53/Adapter";
import * as AWS from "@/AWS";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as DNS from "@/DNS";

const { test } = Test.make({ providers: AWS.providers() });
const routeZone = route53Zone("Z123", "Example.com.");

test(
  "Route 53 descriptor and adapter preserve explicit native zone metadata",
  Effect.sync(() => {
    expect(route53Zone("Z123", "example.com")).toEqual({
      type: "route53",
      identity: { kind: "route53", id: "Z123", name: "example.com" },
    });
    expect(
      route53Zone("Z123", "example.com", { aliasHostedZoneId: "ZCF" }).identity
        .metadata,
    ).toEqual({ aliasHostedZoneId: "ZCF" });
    expect(Route53DNSAdapter).toBe(route53DnsAdapter);
    expect(route53DnsAdapter.capabilities.rrset).toBe(true);
    expect(route53DnsAdapter.capabilities.autoTtl).toBe(false);
  }),
);

test.provider(
  "rejects unresolved names before constructing a native resource",
  (stack) =>
    stack.plan(
      Effect.gen(function* () {
        const error = yield* DNS.bind(routeZone).pipe(
          Effect.flatMap((bound) =>
            bound.record({
              name: Effect.succeed("www"),
              type: "A",
              values: ["1.1.1.1"],
            }),
          ),
          Effect.provide(DNS.adapterLayer(route53DnsAdapter)),
          Effect.flip,
        );
        expect(error.reason).toBe("unsupported");
        expect(error.message).toContain("concrete");
      }),
    ),
);

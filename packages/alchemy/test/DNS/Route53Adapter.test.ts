import {
  Route53DNSAdapter,
  route53Dns,
  route53DnsFrom,
  route53DnsAdapter,
  route53Zone,
} from "@/AWS/Route53/Adapter";
import { AmbiguousHostedZone } from "@/AWS/Route53/HostedZoneLookup";
import * as AWS from "@/AWS";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as DNS from "@/DNS";

const { test } = Test.make({ providers: AWS.providers() });
const routeZone = route53Zone("Z123", "Example.com.");

const discoveredZone = {
  id: "/hostedzone/ZDISCOVERED",
  name: "Example.com.",
};

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

test(
  "Route 53 selector binds the discovered full zone identity",
  Effect.gen(function* () {
    const selector = route53DnsFrom(() => Effect.succeed(discoveredZone));
    const bound = yield* DNS.bind(selector, "www.example.com").pipe(
      Effect.provide(DNS.adapterLayer(route53DnsAdapter)),
    );
    expect(bound.zone).toEqual({
      type: "route53",
      identity: {
        kind: "route53",
        id: "/hostedzone/ZDISCOVERED",
        name: "Example.com.",
      },
    });
  }),
);

test(
  "Route 53 selector reports a missing zone",
  Effect.gen(function* () {
    const error = yield* DNS.bind(
      route53DnsFrom(() => Effect.succeed(undefined)),
      "www.example.com",
    ).pipe(Effect.provide(DNS.adapterLayer(route53DnsAdapter)), Effect.flip);
    expect(error.reason).toBe("zone-not-found");
  }),
);

test(
  "Route 53 selector reports ambiguity without choosing a zone",
  Effect.gen(function* () {
    const error = yield* DNS.bind(
      route53DnsFrom(() =>
        Effect.fail(
          new AmbiguousHostedZone({
            domainName: "www.example.com",
            zoneName: "example.com.",
            hostedZoneIds: ["Z1", "Z2"],
            message: "ambiguous",
          }),
        ),
      ),
      "www.example.com",
    ).pipe(Effect.provide(DNS.adapterLayer(route53DnsAdapter)), Effect.flip);
    expect(error.reason).toBe("ambiguous-zone");
  }),
);

test(
  "explicit Route 53 zones bypass selectors",
  Effect.gen(function* () {
    const bound = yield* DNS.bind(routeZone).pipe(
      Effect.provide(DNS.adapterLayer(route53DnsAdapter)),
    );
    expect(bound.zone).toBe(routeZone);
    // Keep the public constructor exercised so the provider alias remains
    // part of the documented API without performing a network lookup.
    expect(typeof route53Dns).toBe("function");
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

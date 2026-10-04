import * as Effect from "effect/Effect";
import * as route53 from "@distilled.cloud/aws/route-53";
import { expect, test } from "alchemy-test";
import {
  AmbiguousHostedZone,
  findPublicHostedZoneIdFrom,
  hostedZoneNameCandidates,
  normalizeHostedZoneName,
  resolveHostedZoneId,
} from "@/AWS/Route53/HostedZoneLookup";

const zone = (Name: string, Id: string, PrivateZone = false) => ({
  Name,
  Id,
  CallerReference: "test",
  Config: { PrivateZone },
});

const page = (
  HostedZones: route53.HostedZone[],
  options: Partial<route53.ListHostedZonesByNameResponse> = {},
): route53.ListHostedZonesByNameResponse => ({
  HostedZones,
  IsTruncated: false,
  MaxItems: 100,
  ...options,
});

const lookup = (
  responses: route53.ListHostedZonesByNameResponse[],
  requests: route53.ListHostedZonesByNameRequest[] = [],
) =>
  findPublicHostedZoneIdFrom("WWW.Example.COM.", (request) => {
    requests.push(request);
    const response = responses.shift();
    if (response === undefined) {
      return Effect.succeed(page([]));
    }
    return Effect.succeed(response);
  });

test("normalizes names and generates longest dot-boundary candidates", () => {
  expect(normalizeHostedZoneName("Example.COM...")).toBe("example.com.");
  expect(hostedZoneNameCandidates("*.WWW.Example.COM.")).toEqual([
    "*.www.example.com.",
    "www.example.com.",
    "example.com.",
  ]);
});

test.effect(
  "selects the longest public suffix and excludes private zones",
  () =>
    Effect.gen(function* () {
      const result = yield* findPublicHostedZoneIdFrom(
        "www.example.com.",
        (request) =>
          Effect.succeed(
            page(
              request.DNSName === "www.example.com."
                ? [zone("WWW.Example.COM.", "/hostedzone/Z-WWW", true)]
                : request.DNSName === "example.com."
                  ? [zone("Example.COM.", "/hostedzone/Z-EXAMPLE")]
                  : [],
            ),
          ),
      );
      expect(result).toBe("Z-EXAMPLE");
    }),
);

test.effect("rejects a public duplicate on a later page", () =>
  Effect.gen(function* () {
    const requests: route53.ListHostedZonesByNameRequest[] = [];
    const error = yield* lookup(
      [
        page([zone("www.example.com.", "/hostedzone/Z-ONE")], {
          IsTruncated: true,
          NextDNSName: "www.example.com.",
          NextHostedZoneId: "/hostedzone/Z-ONE",
        }),
        page([zone("WWW.EXAMPLE.COM", "/hostedzone/Z-TWO")]),
      ],
      requests,
    ).pipe(Effect.flip);
    expect(error).toBeInstanceOf(AmbiguousHostedZone);
    expect(requests[1]).toEqual({
      DNSName: "www.example.com.",
      HostedZoneId: "/hostedzone/Z-ONE",
      MaxItems: 100,
    });
  }),
);

test.effect("rejects duplicate public zones at the longest match", () =>
  Effect.gen(function* () {
    const error = yield* findPublicHostedZoneIdFrom("www.example.com", () =>
      Effect.succeed(
        page([
          zone("www.example.com.", "/hostedzone/Z-ONE"),
          zone("WWW.EXAMPLE.COM", "/hostedzone/Z-TWO"),
        ]),
      ),
    ).pipe(Effect.flip);
    expect(error).toBeInstanceOf(AmbiguousHostedZone);
    if (error instanceof AmbiguousHostedZone) {
      expect(error.hostedZoneIds).toEqual(["Z-ONE", "Z-TWO"]);
    }
  }),
);

test.effect("stops pagination when the next name is unrelated", () =>
  Effect.gen(function* () {
    const requests: route53.ListHostedZonesByNameRequest[] = [];
    const result = yield* lookup(
      [
        page([], {
          IsTruncated: true,
          NextDNSName: "zzz.example.com.",
          NextHostedZoneId: "/hostedzone/Z-ZZZ",
        }),
      ],
      requests,
    );
    expect(result).toBeUndefined();
    expect(requests.some((request) => request.HostedZoneId !== undefined)).toBe(
      false,
    );
  }),
);

test.effect("explicit hosted zone bypasses lookup", () =>
  Effect.gen(function* () {
    const result = yield* resolveHostedZoneId(
      "/hostedzone/Z-EXPLICIT",
      "not a DNS name",
    ) as Effect.Effect<string, never, never>;
    expect(result).toBe("/hostedzone/Z-EXPLICIT");
  }),
);

import * as Hetzner from "@distilled.cloud/hetzner";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import {
  DnsError,
  type DnsConstructionServices,
  zoneSelector,
  type ZoneInputDescriptor,
  type ZoneSelector,
} from "../DNS/Contract.ts";
import { hetznerZone } from "./Adapter.ts";

export interface HetznerZoneCandidate {
  readonly id: number;
  readonly name: string;
}

export const canonicalZoneName = (name: string): string =>
  name.replace(/\.+$/, "").toLowerCase();

const matchesZone = (hostname: string, zone: string): boolean =>
  hostname === zone || hostname.endsWith(`.${zone}`);

/** Select the longest dot-boundary zone match without performing I/O. */
export const selectHetznerZone = (
  hostname: string,
  zones: ReadonlyArray<HetznerZoneCandidate>,
): Effect.Effect<HetznerZoneCandidate, DnsError> => {
  const canonicalHostname = canonicalZoneName(hostname);
  const matches = zones.filter((zone) =>
    matchesZone(canonicalHostname, canonicalZoneName(zone.name)),
  );
  if (matches.length === 0) {
    return Effect.fail(
      new DnsError({
        reason: "zone-not-found",
        message: `No Hetzner DNS zone contains "${hostname}".`,
      }),
    );
  }
  const longest = Math.max(
    ...matches.map((zone) => canonicalZoneName(zone.name).length),
  );
  const best = matches.filter(
    (zone) => canonicalZoneName(zone.name).length === longest,
  );
  if (best.length !== 1) {
    return Effect.fail(
      new DnsError({
        reason: "ambiguous-zone",
        message: `Multiple Hetzner DNS zones contain "${hostname}" at the same specificity.`,
      }),
    );
  }
  return Effect.succeed(best[0]!);
};

const discover = (hostname: string) =>
  Hetzner.zones.listZones.items({ per_page: 50 }).pipe(
    Stream.runCollect,
    Effect.flatMap((zones) =>
      selectHetznerZone(
        hostname,
        [...zones].map((zone) => ({ id: zone.id, name: zone.name })),
      ),
    ),
    Effect.mapError((error) =>
      error instanceof DnsError
        ? error
        : new DnsError({
            reason: "discovery-failed",
            message: "Hetzner DNS zone discovery failed.",
          }),
    ),
  );

export const dns = (): ZoneSelector<
  "hetzner",
  DnsConstructionServices | Hetzner.HetznerOpContext
> =>
  zoneSelector<"hetzner", DnsConstructionServices | Hetzner.HetznerOpContext>(
    "hetzner",
    (
      hostname,
    ): Effect.Effect<
      ZoneInputDescriptor<"hetzner">,
      DnsError,
      DnsConstructionServices | Hetzner.HetznerOpContext
    > =>
      discover(hostname).pipe(
        Effect.map((zone) => hetznerZone(zone.id, zone.name)),
      ),
  );

export const hetznerDns = dns;

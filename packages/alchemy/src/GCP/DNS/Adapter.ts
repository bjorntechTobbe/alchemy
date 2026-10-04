import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as gcpDnsApi from "@distilled.cloud/gcp/dns_v1";
import {
  DnsError,
  type DnsAdapter,
  type DnsConstructionServices,
  type DnsRecordHandle,
  type RecordRequest,
  validateResolvedName,
  type ZoneInputDescriptor,
  type ZoneDescriptor,
  type ZoneIdentity,
  type ZoneSelector,
  zoneSelector,
} from "../../DNS/Contract.ts";
import type { Input, InputProps } from "../../Input.ts";
import * as Output from "../../Output.ts";
import type { ResourceLike } from "../../Resource.ts";
import { GcpEnvironment } from "../Environment.ts";
import {
  ResourceRecordSet,
  type ResourceRecordSetProps,
} from "./ResourceRecordSet.ts";

/** The non-secret identity needed to select a Cloud DNS managed zone. */
export interface GcpZoneIdentity extends ZoneIdentity {
  readonly kind: "gcp";
}

/** Construct a serializable descriptor for an existing Cloud DNS managed zone. */
export function gcpZone(
  managedZone: string,
  name: string,
): ZoneDescriptor<"gcp"> & { readonly identity: GcpZoneIdentity };
export function gcpZone(
  managedZone: Input<string>,
  name: Input<string>,
): ZoneInputDescriptor<"gcp">;
export function gcpZone(
  managedZone: Input<string>,
  name: Input<string>,
): ZoneInputDescriptor<"gcp"> {
  return {
    type: "gcp",
    identity: { kind: "gcp", id: managedZone, name },
  };
}

const canonicalDnsName = (name: string): string =>
  name.replace(/\.$/, "").toLowerCase();

const matchesHostname = (hostname: string, zoneName: string): boolean => {
  const hostnameName = canonicalDnsName(hostname);
  const zone = canonicalDnsName(zoneName);
  return hostnameName === zone || hostnameName.endsWith(`.${zone}`);
};

/**
 * Select the unique longest-boundary Cloud DNS zone for a hostname.
 *
 * This helper is pure so discovery policy can be tested without credentials.
 * Public and private zones are intentionally treated alike: when the best
 * suffix has more than one managed zone, callers must provide an explicit
 * {@link gcpZone} descriptor.
 */
export const selectGcpManagedZone = (
  hostname: string,
  zones: ReadonlyArray<gcpDnsApi.ManagedZone>,
): Effect.Effect<ZoneInputDescriptor<"gcp">, DnsError> => {
  const candidates = zones.filter(
    (zone) =>
      typeof zone.name === "string" &&
      typeof zone.dnsName === "string" &&
      matchesHostname(hostname, zone.dnsName),
  );
  if (candidates.length === 0) {
    return Effect.fail(
      new DnsError({
        reason: "zone-not-found",
        message: `No Google Cloud DNS managed zone found for '${hostname}'.`,
      }),
    );
  }
  const longestLength = Math.max(
    ...candidates.map((zone) => canonicalDnsName(zone.dnsName!).length),
  );
  const best = candidates.filter(
    (zone) => canonicalDnsName(zone.dnsName!).length === longestLength,
  );
  if (best.length !== 1) {
    return Effect.fail(
      new DnsError({
        reason: "ambiguous-zone",
        message: `Multiple Google Cloud DNS managed zones match '${hostname}'. Provide an explicit gcpZone(...).`,
      }),
    );
  }
  const zone = best[0]!;
  return Effect.succeed(gcpZone(zone.name!, zone.dnsName!));
};

/** Select from all pages returned by the Cloud DNS managed-zone paginator. */
export const selectGcpManagedZonePages = (
  hostname: string,
  pages: ReadonlyArray<gcpDnsApi.ManagedZonesListResponse>,
): Effect.Effect<ZoneInputDescriptor<"gcp">, DnsError> =>
  selectGcpManagedZone(
    hostname,
    pages.flatMap((page) => page.managedZones ?? []),
  );

/**
 * Select a Google Cloud DNS managed zone from the configured GCP project.
 * Discovery is lazy and executes when the selector is bound. Explicit
 * {@link gcpZone} descriptors bypass this lookup entirely.
 */
export const gcpDns = (): ZoneSelector<
  "gcp",
  DnsConstructionServices | GcpEnvironment | gcpDnsApi.GcpOpContext
> =>
  zoneSelector<
    "gcp",
    DnsConstructionServices | GcpEnvironment | gcpDnsApi.GcpOpContext
  >("gcp", (hostname) =>
    Effect.gen(function* () {
      const environment = yield* GcpEnvironment.current;
      const pages = yield* gcpDnsApi.listManagedZones
        .pages({ project: environment.project, maxResults: 1000 })
        .pipe(Stream.runCollect);
      return yield* selectGcpManagedZonePages(hostname, Array.from(pages));
    }).pipe(
      Effect.mapError((error) =>
        error instanceof DnsError
          ? error
          : new DnsError({
              reason: "discovery-failed",
              message: `Google Cloud DNS zone discovery failed: ${error.message}`,
            }),
      ),
    ),
  );

/** Short alias for the provider-scoped DNS selector. */
export const dns = gcpDns;

const encodeIdentity = (value: string): string =>
  [...value]
    .map((character) => character.codePointAt(0)!.toString(16).padStart(6, "0"))
    .join("");

const canonicalRecordName = (request: RecordRequest): string | undefined => {
  if (typeof request.name !== "string") return undefined;
  if (typeof request.zone.identity.name !== "string") return undefined;
  const zone = request.zone.identity.name.replace(/\.$/, "").toLowerCase();
  const name = request.name;
  if (name === "@" || name === "") return zone;
  const canonical = name.replace(/\.$/, "").toLowerCase();
  return name.includes(".") ? canonical : `${canonical}.${zone}`;
};

const logicalId = (request: RecordRequest): string | undefined => {
  if (request.id !== undefined) return request.id;
  if (typeof request.zone.identity.id !== "string") return undefined;
  const name = canonicalRecordName(request);
  if (name === undefined) return undefined;
  return [
    "DNS",
    request.zone.identity.kind,
    request.zone.identity.id,
    name,
    request.type,
  ]
    .map(encodeIdentity)
    .join("-");
};

const deferredNameError = () =>
  new DnsError({
    reason: "unsupported",
    message:
      "DNS record name must be concrete unless you provide an explicit DNS resource id.",
  });

const invalidName = (error: DnsError): Output.Output<string> =>
  Output.mapEffect(() => Effect.as(Effect.die(error), ""))(Output.asOutput(""));

const canonicalName = (name: string): string =>
  name.replace(/\.$/, "").toLowerCase();

const nameInput = (request: RecordRequest, rejectApex = false): Input<string> =>
  Output.flatMap(Output.asOutput(request.name), (name) =>
    Output.flatMap(Output.asOutput(request.zone.identity.name), (zone) => {
      const error = validateResolvedName(gcpDnsAdapter, name, zone);
      if (error) return invalidName(error);
      if (
        rejectApex &&
        (name === "@" ||
          name === "" ||
          canonicalName(name) === canonicalName(zone))
      ) {
        return invalidName(
          new DnsError({
            reason: "unsupported",
            message:
              "Google Cloud DNS does not support CNAME hostname targets at the zone apex.",
          }),
        );
      }
      return Output.asOutput(name === "@" || name === "" ? zone : name);
    }),
  );

const invalidZone = (message: string) =>
  Effect.fail(new DnsError({ reason: "invalid-zone", message }));

const makeRecord = (
  request: RecordRequest,
  type: RecordRequest["type"] = request.type,
  values: ReadonlyArray<Input<string>> = request.values,
  rejectApex = false,
): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> => {
  if (request.zone.identity.kind !== "gcp")
    return invalidZone(
      "The Google Cloud DNS adapter requires a GCP zone identity.",
    );
  const id = logicalId({ ...request, type });
  if (id === undefined) return Effect.fail(deferredNameError());

  return Effect.map(
    ResourceRecordSet(id, {
      managedZone: request.zone.identity.id,
      name: nameInput(request, rejectApex),
      type,
      ttl:
        request.ttl === undefined || request.ttl === "auto"
          ? undefined
          : request.ttl,
      rrdatas: values as Input<string[]>,
    } as InputProps<ResourceRecordSetProps>),
    (resource) => ({
      resource: resource as ResourceLike,
      recordName: Output.asOutput(resource.name),
    }),
  );
};

/** Composition adapter backed by the existing Cloud DNS ResourceRecordSet resource. */
export const gcpDnsAdapter: DnsAdapter = {
  type: "gcp",
  capabilities: {
    record: true,
    rrset: true,
    multiValue: true,
    ttl: true,
    autoTtl: false,
    fqdn: true,
    hostnameTargets: true,
  },
  record: (request) => makeRecord(request),
  hostnameTarget: (request) => {
    if (request.zone.identity.kind !== "gcp")
      return invalidZone(
        "The Google Cloud DNS adapter requires a GCP zone identity.",
      );
    if (typeof request.name === "string") {
      if (request.name === "@" || request.name === "") {
        return Effect.fail(
          new DnsError({
            reason: "unsupported",
            message:
              "Google Cloud DNS does not support CNAME hostname targets at the zone apex.",
          }),
        );
      }
      if (typeof request.zone.identity.name !== "string") {
        // The zone name is deferred, so apex validation remains deferred too.
      } else {
        const zone = request.zone.identity.name
          .replace(/\.$/, "")
          .toLowerCase();
        const name = request.name.replace(/\.$/, "").toLowerCase();
        if (canonicalName(name) === canonicalName(zone)) {
          return Effect.fail(
            new DnsError({
              reason: "unsupported",
              message:
                "Google Cloud DNS does not support CNAME hostname targets at the zone apex.",
            }),
          );
        }
      }
    }
    // Cloud DNS requires CNAME rrdatas to be absolute hostnames. Keep this
    // as an Output transformation so a deferred target remains graph-linked.
    const target =
      typeof request.target === "string"
        ? request.target.endsWith(".")
          ? request.target
          : `${request.target}.`
        : Output.map(Output.asOutput(request.target), (value) =>
            value.endsWith(".") ? value : `${value}.`,
          );
    return makeRecord(
      { ...request, type: "CNAME", values: [target] },
      "CNAME",
      [target],
      true,
    );
  },
};

export const GcpDNSAdapter = gcpDnsAdapter;
export const GcpZone = gcpZone;

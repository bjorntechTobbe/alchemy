import * as Effect from "effect/Effect";
import {
  DnsError,
  type DnsAdapter,
  type DnsConstructionServices,
  type DnsRecordHandle,
  type RecordRequest,
  type ZoneInputDescriptor,
  type ZoneDescriptor,
  type ZoneIdentity,
  validateResolvedName,
} from "../DNS/Contract.ts";
import type { Input } from "../Input.ts";
import type { InputProps } from "../Input.ts";
import * as Output from "../Output.ts";
import type { ResourceLike } from "../Resource.ts";
import {
  RecordSet,
  type RecordSetProps,
  type RecordSetType,
} from "./RecordSet.ts";

/** The non-secret identity needed to select a Hetzner DNS zone. */
export interface HetznerZoneIdentity extends ZoneIdentity {
  readonly kind: "hetzner";
}

/** Construct a serializable descriptor for an existing Hetzner DNS zone. */
export function hetznerZone(
  zoneId: number | string,
  name: string,
): ZoneDescriptor<"hetzner"> & { readonly identity: HetznerZoneIdentity };
export function hetznerZone(
  zoneId: Input<number | string>,
  name: Input<string>,
): ZoneInputDescriptor<"hetzner">;
export function hetznerZone(
  zoneId: Input<number | string>,
  name: Input<string>,
): ZoneInputDescriptor<"hetzner"> {
  return {
    type: "hetzner",
    identity: {
      kind: "hetzner",
      id:
        typeof zoneId === "number"
          ? String(zoneId)
          : typeof zoneId === "string"
            ? zoneId
            : Output.map(Output.asOutput(zoneId), String),
      name,
    },
  };
}

const encodeIdentity = (value: string): string =>
  [...value]
    .map((character) => character.codePointAt(0)!.toString(16).padStart(6, "0"))
    .join("");

const zoneName = (request: Pick<RecordRequest, "zone">): string =>
  typeof request.zone.identity.name === "string"
    ? request.zone.identity.name.replace(/\.$/, "").toLowerCase()
    : "";

const isApexName = (request: Pick<RecordRequest, "name" | "zone">): boolean => {
  if (typeof request.name !== "string") return false;
  const name = request.name.replace(/\.$/, "").toLowerCase();
  return name === "" || name === "@" || name === zoneName(request);
};

const canonicalRecordName = (request: RecordRequest): string | undefined => {
  if (typeof request.name !== "string") return undefined;
  const name = request.name;
  if (name === "@" || name === "") return "@";
  const canonical = name.replace(/\.$/, "").toLowerCase();
  const zone = zoneName(request);
  return canonical === zone
    ? "@"
    : canonical.endsWith(`.${zone}`)
      ? canonical.slice(0, -(zone.length + 1))
      : canonical;
};

const logicalId = (request: RecordRequest): string | undefined => {
  if (request.id !== undefined) return request.id;
  if (typeof request.zone.identity.id !== "string") return undefined;
  const name = canonicalRecordName(request);
  if (name === undefined) return undefined;
  return ["DNS", request.zone.identity.id, name, request.type]
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
      const error = validateResolvedName(hetznerDnsAdapter, name, zone);
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
            message: "Hetzner does not support CNAME records at the zone apex.",
          }),
        );
      }
      if (name === "@" || name === "") return Output.asOutput("@");
      const canonical = name.replace(/\.$/, "").toLowerCase();
      const normalizedZone = zone.replace(/\.$/, "").toLowerCase();
      return Output.asOutput(
        canonical === normalizedZone
          ? "@"
          : canonical.endsWith(`.${normalizedZone}`)
            ? canonical.slice(0, -(normalizedZone.length + 1))
            : canonical,
      );
    }),
  );

const cnameTargetInput = (target: Input<string>): Input<string> =>
  Output.map(Output.asOutput(target), (value) =>
    value.endsWith(".") ? value : `${value}.`,
  );

const makeRecord = (
  request: RecordRequest,
  rejectApex = false,
): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> => {
  if (request.zone.identity.kind !== "hetzner") {
    return Effect.fail(
      new DnsError({
        reason: "invalid-zone",
        message: "The Hetzner DNS adapter requires a Hetzner zone identity.",
      }),
    );
  }
  const id = logicalId(request);
  if (id === undefined) return Effect.fail(deferredNameError());
  if (
    typeof request.zone.identity.id === "string" &&
    (!/^\d+$/.test(request.zone.identity.id) ||
      !Number.isSafeInteger(Number(request.zone.identity.id)) ||
      Number(request.zone.identity.id) < 1)
  ) {
    return Effect.fail(
      new DnsError({
        reason: "invalid-zone",
        message: "The Hetzner zone identity must contain a numeric zone id.",
      }),
    );
  }
  const zoneId =
    typeof request.zone.identity.id === "string"
      ? Number(request.zone.identity.id)
      : Output.map(Output.asOutput(request.zone.identity.id), (id) =>
          Number(id),
        );
  const props = {
    zone: { zoneId },
    name: nameInput(request, rejectApex),
    type: request.type as RecordSetType,
    records: request.values.map((value) => ({ value })),
    ...(request.ttl === undefined || request.ttl === "auto"
      ? {}
      : { ttl: request.ttl }),
  } satisfies InputProps<RecordSetProps>;
  return Effect.map(RecordSet(id, props), (resource) => ({
    resource: resource as ResourceLike,
    recordName: Output.asOutput(resource.name),
  }));
};

/** Composition adapter backed by the existing Hetzner `RecordSet` resource. */
export const hetznerDnsAdapter: DnsAdapter = {
  type: "hetzner",
  capabilities: {
    record: true,
    rrset: true,
    multiValue: true,
    ttl: true,
    autoTtl: false,
    fqdn: true,
    hostnameTargets: true,
  },
  record: makeRecord,
  hostnameTarget: (request) => {
    if (request.zone.identity.kind !== "hetzner") {
      return Effect.fail(
        new DnsError({
          reason: "invalid-zone",
          message: "The Hetzner DNS adapter requires a Hetzner zone identity.",
        }),
      );
    }
    if (isApexName(request)) {
      return Effect.fail(
        new DnsError({
          reason: "unsupported",
          message: "Hetzner does not support CNAME records at the zone apex.",
        }),
      );
    }
    const recordRequest: RecordRequest = {
      id: request.id,
      zone: request.zone,
      name: request.name,
      type: "CNAME",
      values: [cnameTargetInput(request.target)],
      ...(request.ttl === undefined ? {} : { ttl: request.ttl }),
      ...(request.targetMetadata === undefined
        ? {}
        : { targetMetadata: request.targetMetadata }),
    };
    return makeRecord(recordRequest, true);
  },
};

export const HetznerDNSAdapter = hetznerDnsAdapter;
export const HetznerZone = hetznerZone;

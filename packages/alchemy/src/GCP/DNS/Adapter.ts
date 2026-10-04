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
} from "../../DNS/Contract.ts";
import type { Input, InputProps } from "../../Input.ts";
import * as Output from "../../Output.ts";
import type { ResourceLike } from "../../Resource.ts";
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

const nameInput = (request: RecordRequest): Input<string> =>
  Output.flatMap(Output.asOutput(request.name), (name) =>
    Output.map(Output.asOutput(request.zone.identity.name), (zone) =>
      name === "@" || name === "" ? zone : name,
    ),
  );

const invalidZone = (message: string) =>
  Effect.fail(new DnsError({ reason: "invalid-zone", message }));

const makeRecord = (
  request: RecordRequest,
  type: RecordRequest["type"] = request.type,
  values: ReadonlyArray<Input<string>> = request.values,
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
      name: nameInput(request),
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
        if (name === zone) {
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
    );
  },
};

export const GcpDNSAdapter = gcpDnsAdapter;
export const GcpZone = gcpZone;

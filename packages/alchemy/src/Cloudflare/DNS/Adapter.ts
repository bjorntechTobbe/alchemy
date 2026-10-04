import * as Effect from "effect/Effect";

import {
  DnsError,
  type DnsAdapter,
  type RecordRequest,
  type ZoneInputDescriptor,
  type ZoneDescriptor,
  type ZoneIdentity,
  type DnsConstructionServices,
} from "../../DNS/Contract.ts";
import type { Input } from "../../Input.ts";
import * as Output from "../../Output.ts";
import type { ResourceLike } from "../../Resource.ts";
import type { DnsRecordHandle } from "../../DNS/Contract.ts";
import { Record } from "./Record.ts";

/** The non-secret identity needed to select a Cloudflare DNS zone. */
export interface CloudflareZoneIdentity extends ZoneIdentity {
  readonly kind: "cloudflare";
}

/** Construct a serializable zone descriptor for an existing Cloudflare zone. */
export function cloudflareZone(
  zoneId: string,
  name: string,
): ZoneDescriptor<"cloudflare"> & { readonly identity: CloudflareZoneIdentity };
export function cloudflareZone(
  zoneId: Input<string>,
  name: Input<string>,
): ZoneInputDescriptor<"cloudflare">;
export function cloudflareZone(
  zoneId: Input<string>,
  name: Input<string>,
): ZoneInputDescriptor<"cloudflare"> {
  return {
    type: "cloudflare",
    identity: { kind: "cloudflare", id: zoneId, name },
  };
}

/** Encode identity components without lossy punctuation replacement. */
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

const recordId = (request: RecordRequest): string | undefined => {
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

const makeRecord = (
  request: RecordRequest,
  content: Input<string>,
): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> => {
  if (request.zone.identity.kind !== "cloudflare") {
    return Effect.fail(
      new DnsError({
        reason: "invalid-zone",
        message:
          "The Cloudflare DNS adapter requires a Cloudflare zone identity.",
      }),
    );
  }
  if (request.values.length !== 1) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message:
          "The Cloudflare DNS adapter supports one value per native record resource.",
      }),
    );
  }
  const id = recordId(request);
  if (id === undefined) return Effect.fail(deferredNameError());

  return Effect.map(
    Record(id, {
      zoneId: request.zone.identity.id,
      name: nameInput(request),
      type: request.type,
      content,
      // DNS validation records and application hostnames must remain DNS-only.
      proxied: false,
      ttl: request.ttl === "auto" ? "1" : request.ttl,
    }),
    (resource) => ({
      resource: resource as ResourceLike,
      recordName: Output.asOutput(resource.name),
    }),
  );
};

/** Composition adapter backed by the existing Cloudflare.DNS.Record resource. */
export const cloudflareDnsAdapter: DnsAdapter = {
  type: "cloudflare",
  capabilities: {
    record: true,
    rrset: false,
    multiValue: false,
    ttl: true,
    autoTtl: true,
    fqdn: true,
    hostnameTargets: true,
  },
  record: (request) => makeRecord(request, request.values[0]),
  hostnameTarget: (request) =>
    makeRecord(
      { ...request, type: "CNAME", values: [request.target] },
      request.target,
    ),
};

export const CloudflareDNSAdapter = cloudflareDnsAdapter;
export const CloudflareZone = cloudflareZone;

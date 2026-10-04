import type { Credentials } from "@distilled.cloud/aws/Credentials";
import * as route53 from "@distilled.cloud/aws/route-53";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import type { HttpClientError } from "effect/http/HttpClientError";
import type { PlatformError } from "effect/PlatformError";
import {
  DnsError,
  type DnsAdapter,
  type DnsConstructionServices,
  type RecordRequest,
  type ZoneDescriptor,
  type ZoneInputDescriptor,
  type ZoneIdentity,
  type ZoneSelector,
  zoneSelector,
} from "../../DNS/Contract.ts";
import type { Input } from "../../Input.ts";
import type { InputProps } from "../../Input.ts";
import * as Output from "../../Output.ts";
import type { ResourceLike } from "../../Resource.ts";
import type { DnsRecordHandle } from "../../DNS/Contract.ts";
import { Record, type RecordProps } from "./Record.ts";
import { Records, type RecordsProps } from "./Records.ts";
import {
  AmbiguousHostedZone,
  findPublicHostedZone,
  type PublicHostedZone,
} from "./HostedZoneLookup.ts";

export interface Route53ZoneIdentity extends ZoneIdentity {
  readonly kind: "route53";
  readonly metadata?: Readonly<{
    readonly aliasHostedZoneId?: string;
    readonly [key: string]: string | undefined;
  }>;
}
export function route53Zone(
  hostedZoneId: string,
  name: string,
  metadata?: Route53ZoneIdentity["metadata"],
): ZoneDescriptor<"route53"> & { readonly identity: Route53ZoneIdentity };
export function route53Zone(
  hostedZoneId: Input<string>,
  name: Input<string>,
  metadata?: Route53ZoneIdentity["metadata"],
): ZoneInputDescriptor<"route53">;
export function route53Zone(
  hostedZoneId: Input<string>,
  name: Input<string>,
  metadata?: Route53ZoneIdentity["metadata"],
): ZoneInputDescriptor<"route53"> {
  return {
    type: "route53",
    identity: {
      kind: "route53",
      id: hostedZoneId,
      name,
      ...(metadata === undefined ? {} : { metadata }),
    },
  };
}

export type Route53ZoneLookup<R> = (
  hostname: string,
) => Effect.Effect<
  PublicHostedZone | undefined,
  | route53.ListHostedZonesByNameError
  | AmbiguousHostedZone
  | Error
  | HttpClientError
  | PlatformError,
  R
>;

const makeRoute53Dns = <R>(lookup: Route53ZoneLookup<R>) =>
  zoneSelector("route53", (hostname) =>
    lookup(hostname).pipe(
      Effect.flatMap((match) =>
        match === undefined
          ? Effect.fail(
              new DnsError({
                reason: "zone-not-found",
                message:
                  `No public Route 53 hosted zone contains '${hostname}'. ` +
                  "Create the zone first or pass an explicit route53Zone.",
              }),
            )
          : Effect.succeed(route53Zone(match.id, match.name)),
      ),
      Effect.mapError((error) =>
        error instanceof DnsError
          ? error
          : error instanceof AmbiguousHostedZone
            ? new DnsError({
                reason: "ambiguous-zone",
                message: error.message,
              })
            : new DnsError({
                reason: "discovery-failed",
                message: `Route 53 zone discovery failed: ${String(error)}`,
              }),
      ),
    ),
  );

/** Testable/provider-scoped constructor for a Route 53 hostname selector. */
export const route53DnsFrom = <R>(lookup: Route53ZoneLookup<R>) =>
  makeRoute53Dns(lookup);

/** Select the longest matching public Route 53 zone using ambient AWS auth. */
export const route53Dns = (): ZoneSelector<
  "route53",
  DnsConstructionServices | Credentials | HttpClient.HttpClient
> => makeRoute53Dns(findPublicHostedZone);

/** Short provider-scoped alias. */
export const dns = route53Dns;
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
const ttlInput = (ttl: RecordRequest["ttl"]): string | undefined =>
  ttl === undefined ? undefined : `${ttl} seconds`;
const invalidZone = (message: string) =>
  Effect.fail(new DnsError({ reason: "invalid-zone", message }));
const makeRecord = (
  request: RecordRequest,
): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> => {
  if (request.zone.identity.kind !== "route53")
    return invalidZone(
      "The Route 53 adapter requires a Route 53 zone identity.",
    );
  const id = logicalId(request);
  if (id === undefined) return Effect.fail(deferredNameError());
  const common = {
    hostedZoneId: request.zone.identity.id,
    name: nameInput(request),
    type: request.type,
    ttl: ttlInput(request.ttl),
    records: request.values as Input<string[]>,
  };
  if (request.values.length === 1)
    return Effect.map(
      Record(id, common as InputProps<RecordProps>),
      (resource) => ({
        resource: resource as ResourceLike,
        recordName: Output.asOutput(resource.name),
      }),
    );
  return Effect.map(
    Records(id, {
      ...common,
      names: [nameInput(request)] as Input<string[]>,
    } as InputProps<RecordsProps>),
    (resource) => ({
      resource: resource as ResourceLike,
      recordName: Output.map(resource.names, (names) => names[0]!),
    }),
  );
};
/** Native Route 53 adapter. It only constructs Alchemy resources. */
export const route53DnsAdapter: DnsAdapter = {
  type: "route53",
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
    if (request.zone.identity.kind !== "route53")
      return invalidZone(
        "The Route 53 adapter requires a Route 53 zone identity.",
      );
    const aliasHostedZoneId = request.targetMetadata?.aliasHostedZoneId;
    if (aliasHostedZoneId === undefined)
      return Effect.fail(
        new DnsError({
          reason: "unsupported",
          message:
            "Route 53 hostname targets require aliasHostedZoneId target metadata.",
        }),
      );
    const recordRequest: RecordRequest = {
      ...request,
      type: "A",
      values: [request.target],
    };
    const id = logicalId(recordRequest);
    if (id === undefined) return Effect.fail(deferredNameError());
    return Effect.map(
      Record(id, {
        hostedZoneId: request.zone.identity.id,
        name: nameInput(recordRequest),
        type: "A",
        aliasTarget: {
          hostedZoneId: aliasHostedZoneId,
          dnsName: request.target,
        },
      }),
      (resource) => ({
        resource: resource as ResourceLike,
        recordName: Output.asOutput(resource.name),
      }),
    );
  },
};
export const Route53DNSAdapter = route53DnsAdapter;
export const Route53Zone = route53Zone;

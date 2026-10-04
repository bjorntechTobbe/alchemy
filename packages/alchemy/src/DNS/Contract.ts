import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Output from "../Output.ts";
import type { Input } from "../Input.ts";
import type { ResourceLike } from "../Resource.ts";
import type { ProviderServices, StackServices } from "../Stack.ts";

/** Services available while composing a Stack, including native providers. */
export type DnsConstructionServices = StackServices | ProviderServices;

/**
 * Safe, serializable identity for a DNS authority. `id` is opaque to core;
 * provider adapters may narrow this with their own metadata. Credentials and
 * SDK objects must never be placed in this value.
 */
export interface ZoneIdentity {
  readonly kind: string;
  readonly id: string;
  readonly name: string;
  readonly metadata?: Readonly<Record<string, string | undefined>>;
}

/** A zone selection is data and may therefore be safely persisted in resource props. */
export interface ZoneDescriptor<T extends string = string> {
  readonly type: T;
  readonly identity: ZoneIdentity;
}

/**
 * Construction-only form of a zone descriptor.
 *
 * The provider discriminator remains concrete so an adapter can be selected
 * without resolving an Output. Identity values may be native Inputs because
 * they commonly come from a zone resource declared earlier in the same
 * stack. This type is intentionally not used as a Resource Props type.
 */
export interface ZoneInputDescriptor<T extends string = string> {
  readonly type: T;
  readonly identity: {
    readonly kind: T;
    readonly id: Input<string>;
    readonly name: Input<string>;
    readonly metadata?: ZoneIdentity["metadata"];
  };
}

/** Backward-compatible spelling for callers that prefer the Input-first name. */
export type InputZoneDescriptor<T extends string = string> =
  ZoneInputDescriptor<T>;

export type ZoneLike = ZoneDescriptor | ZoneInputDescriptor;

export type CommonRecordType = "A" | "AAAA" | "CNAME" | "TXT";
export type Ttl = number | "auto";

export interface RecordRequest {
  /** Stable native resource logical ID, independent of the DNS name input. */
  readonly id?: string;
  readonly zone: ZoneInputDescriptor;
  readonly name: Input<string>;
  readonly type: CommonRecordType;
  readonly values: ReadonlyArray<Input<string>>;
  readonly ttl?: Ttl;
  /** Provider-neutral opaque target metadata for native hostname aliases. */
  readonly targetMetadata?: Readonly<Record<string, Input<string>>>;
}
export type HostnameTargetRequest = Omit<RecordRequest, "type" | "values"> & {
  readonly target: Input<string>;
};

export interface DnsRecordHandle {
  readonly resource: ResourceLike;
  /** Name/FQDN from the native resource attributes, not the request input. */
  readonly recordName: import("../Output.ts").Output<string>;
}

export type OwnershipMode = "record" | "rrset";
export interface DnsCapabilities {
  /** Native ownership model(s), not a caller-selected overwrite policy. */
  readonly record: boolean;
  readonly rrset: boolean;
  readonly multiValue: boolean;
  readonly ttl: boolean;
  readonly autoTtl: boolean;
  readonly fqdn: boolean;
  /** Alias targets are deliberately separate from ordinary CNAME records. */
  readonly hostnameTargets: boolean;
}

export class DnsError extends Data.TaggedError("DnsError")<{
  readonly reason:
    | "invalid-zone"
    | "missing-adapter"
    | "invalid-adapter"
    | "unsupported";
  readonly message: string;
}> {}

export interface DnsAdapter {
  readonly type: string;
  readonly capabilities: DnsCapabilities;
  /**
   * Constructs the provider's native Resource. It does not run its lifecycle.
   * Adapters must map deferred Inputs through Alchemy Output helpers and
   * perform any deferred validation before constructing a resource that could
   * mutate native state.
   */
  readonly record: (
    request: RecordRequest,
  ) => Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices>;
  readonly hostnameTarget?: (
    request: HostnameTargetRequest,
  ) => Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices>;
}

export interface DnsResolver {
  /**
   * Resolves an adapter without bypassing aggregate validation. This remains
   * an Effect so callers outside `bind` cannot accidentally select an adapter
   * from an invalid registration.
   */
  readonly resolve: (type: string) => Effect.Effect<DnsAdapter, DnsError>;
  /** Validation is reported when the resolver is used, not as a layer defect. */
  readonly error?: DnsError;
}

/** Construction-time service. It is not serialized and never performs network I/O. */
export class Resolver extends Context.Service<Resolver, DnsResolver>()(
  "Alchemy.DNS.Resolver",
) {}

const validIdentity = (identity: unknown): boolean => {
  if (identity === null || typeof identity !== "object") return false;
  const candidate = identity as ZoneInputDescriptor["identity"];
  return (
    typeof candidate.kind === "string" &&
    candidate.kind.length > 0 &&
    candidate.id !== undefined &&
    candidate.id !== null &&
    (typeof candidate.id !== "string" || candidate.id.length > 0) &&
    candidate.name !== undefined &&
    candidate.name !== null &&
    (typeof candidate.name !== "string" || candidate.name.length > 0)
  );
};

export const validateZone = (zone: ZoneLike): Effect.Effect<void, DnsError> =>
  zone !== null &&
  typeof zone === "object" &&
  typeof zone.type === "string" &&
  validIdentity(zone.identity)
    ? Effect.void
    : Effect.fail(
        new DnsError({
          reason: "invalid-zone",
          message:
            "A DNS zone identity must contain its required non-secret fields.",
        }),
      );

const validateRequest = (
  adapter: DnsAdapter,
  request: RecordRequest,
): Effect.Effect<void, DnsError> => {
  if (
    request.id !== undefined &&
    !/^[A-Za-z][A-Za-z0-9_-]*$/.test(request.id)
  ) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message: "DNS resource id must be a non-empty Alchemy logical ID.",
      }),
    );
  }
  if (request.values.length === 0) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message: "values must not be empty.",
      }),
    );
  }
  const nameError = validateName(adapter, request.zone, request.name);
  if (nameError) return Effect.fail(nameError);
  if (request.values.length > 1 && !adapter.capabilities.multiValue) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message: `${adapter.type} does not support multi-value records.`,
      }),
    );
  }
  if (request.ttl !== undefined && !adapter.capabilities.ttl) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message: `${adapter.type} does not support explicit TTL values.`,
      }),
    );
  }
  if (request.ttl === "auto" && !adapter.capabilities.autoTtl) {
    return Effect.fail(
      new DnsError({
        reason: "unsupported",
        message: `${adapter.type} does not support automatic TTL.`,
      }),
    );
  }
  return Effect.void;
};

const validateName = (
  adapter: DnsAdapter,
  zone: ZoneInputDescriptor,
  name: Input<string>,
): DnsError | undefined => {
  // Output/Effect inputs are intentionally left unresolved. The adapter must
  // validate their resolved value before its native resource performs I/O.
  if (typeof name !== "string") return undefined;
  if (!isValidDnsName(name)) {
    return new DnsError({
      reason: "invalid-zone",
      message: "Record name must be a relative name, @, or an FQDN.",
    });
  }
  if (!adapter.capabilities.fqdn && name !== "@" && name.includes(".")) {
    return new DnsError({
      reason: "unsupported",
      message: `${adapter.type} does not support fully-qualified record names.`,
    });
  }
  if (name === "@" || !name.includes(".")) return undefined;
  const canonicalName = canonicalDnsName(name);
  // A native zone's name is often an Output. Defer apex/containment
  // validation until the native resource resolves it in that case.
  if (typeof zone.identity.name !== "string") return undefined;
  const canonicalZone = canonicalDnsName(zone.identity.name);
  if (
    canonicalName !== canonicalZone &&
    !canonicalName.endsWith(`.${canonicalZone}`)
  ) {
    return new DnsError({
      reason: "invalid-zone",
      message: "Record name is outside the selected zone.",
    });
  }
  return undefined;
};

const isValidDnsName = (name: string): boolean => {
  if (name === "@") return true;
  if (name === "*") return true;
  if (name.endsWith("..")) return false;
  const fqdn = name.endsWith(".") ? name.slice(0, -1) : name;
  return (
    fqdn.length > 0 &&
    fqdn.length <= 253 &&
    !fqdn.startsWith(".") &&
    !fqdn.includes("..") &&
    fqdn
      .split(".")
      .every(
        (label, index) =>
          (label !== "*" || index === 0) &&
          (label === "*" || label.length > 0) &&
          label.length <= 63 &&
          (label === "*" ||
            /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/.test(label)),
      ) &&
    !fqdn.split(".").slice(1).includes("*") &&
    (!fqdn.startsWith("*") || fqdn.startsWith("*."))
  );
};

const canonicalDnsName = (name: string): string =>
  (name.endsWith(".") ? name.slice(0, -1) : name).toLowerCase();

/** Bind a serializable zone descriptor to the provider adapter supplied by layers. */
export const bind = (
  zone: ZoneLike,
): Effect.Effect<BoundZone, DnsError, Resolver> =>
  Effect.gen(function* () {
    yield* validateZone(zone);
    const resolver = yield* Resolver;
    if (resolver.error) return yield* Effect.fail(resolver.error);
    const adapter = yield* resolver.resolve(zone.type);
    return new BoundZone(zone as ZoneInputDescriptor, adapter);
  });

export class BoundZone {
  constructor(
    readonly zone: ZoneInputDescriptor,
    private readonly adapter: DnsAdapter,
  ) {}

  record(
    request: Omit<RecordRequest, "zone">,
  ): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> {
    const full = { ...request, zone: this.zone };
    return validateRequest(this.adapter, full).pipe(
      Effect.flatMap(() => this.adapter.record(full)),
    );
  }

  hostnameTarget(
    request: Omit<RecordRequest, "zone" | "type" | "values"> & {
      readonly target: Input<string>;
    },
  ): Effect.Effect<DnsRecordHandle, DnsError, DnsConstructionServices> {
    const full: HostnameTargetRequest = { ...request, zone: this.zone };
    const nameError = validateName(this.adapter, this.zone, full.name);
    if (nameError) return Effect.fail(nameError);
    if (
      !this.adapter.capabilities.hostnameTargets ||
      !this.adapter.hostnameTarget
    ) {
      return Effect.fail(
        new DnsError({
          reason: "unsupported",
          message: `${this.adapter.type} does not implement hostname targets.`,
        }),
      );
    }
    return this.adapter.hostnameTarget(full);
  }
}

/**
 * Register one explicit, aggregate adapter layer. Layers for individual
 * providers must be combined by the caller before providing this layer:
 * `adapterLayer(awsAdapter, cloudflareAdapter)`. Separate layers defining the
 * same `Resolver` service are not implicitly merged by Effect and must not be
 * advertised as a provider auto-discovery mechanism.
 */
export const adapterLayer = (
  ...adapters: ReadonlyArray<DnsAdapter>
): Layer.Layer<Resolver> => {
  const byType = new Map<string, DnsAdapter>();
  let validationError: DnsError | undefined;
  for (const adapter of adapters) {
    const error = validateAdapter(adapter, byType.has(adapter.type));
    if (error && validationError === undefined) validationError = error;
    byType.set(adapter.type, adapter);
  }
  return Layer.effect(
    Resolver,
    Effect.succeed({
      resolve: (type) => {
        if (validationError) return Effect.fail(validationError);
        const adapter = byType.get(type);
        return adapter
          ? Effect.succeed(adapter)
          : Effect.fail(
              new DnsError({
                reason: "missing-adapter",
                message: `No DNS adapter is registered for '${type}'.`,
              }),
            );
      },
      error: validationError,
    }),
  );
};

const validateAdapter = (
  adapter: DnsAdapter,
  duplicate: boolean,
): DnsError | undefined => {
  const capabilities = adapter.capabilities;
  if (duplicate) {
    return new DnsError({
      reason: "invalid-adapter",
      message: `Duplicate DNS adapter type '${adapter.type}'.`,
    });
  }
  if (
    adapter.type.length === 0 ||
    typeof capabilities.record !== "boolean" ||
    typeof capabilities.rrset !== "boolean" ||
    typeof capabilities.multiValue !== "boolean" ||
    typeof capabilities.ttl !== "boolean" ||
    typeof capabilities.autoTtl !== "boolean" ||
    typeof capabilities.fqdn !== "boolean" ||
    typeof capabilities.hostnameTargets !== "boolean"
  ) {
    return new DnsError({
      reason: "invalid-adapter",
      message: `DNS adapter '${adapter.type}' has invalid capabilities.`,
    });
  }
  if (!capabilities.record) {
    return new DnsError({
      reason: "invalid-adapter",
      message: `DNS adapter '${adapter.type}' must implement record construction.`,
    });
  }
  if (capabilities.autoTtl && !capabilities.ttl) {
    return new DnsError({
      reason: "invalid-adapter",
      message: `DNS adapter '${adapter.type}' enables auto TTL without TTL support.`,
    });
  }
  if (capabilities.hostnameTargets && !adapter.hostnameTarget) {
    return new DnsError({
      reason: "invalid-adapter",
      message: `DNS adapter '${adapter.type}' advertises hostname targets without a handler.`,
    });
  }
  return undefined;
};

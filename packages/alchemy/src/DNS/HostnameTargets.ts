import * as Effect from "effect/Effect";
import type { Input } from "../Input.ts";
import { sha256 } from "../Util/sha256.ts";
import { BoundZone, type DnsRecordHandle, type DnsError } from "./Contract.ts";

export interface HostnameTargetsProps {
  readonly zone: BoundZone;
  readonly names: ReadonlyArray<Input<string>>;
  readonly target: Input<string>;
  readonly targetMetadata?: Readonly<Record<string, Input<string>>>;
  readonly idPrefix?: string;
}

const normalize = (name: string): string =>
  name.trim().replace(/\.$/, "").toLowerCase();

const readableName = (name: string): string =>
  normalize(name)
    .replace(/^\*\./, "wildcard-")
    .replace(/[^a-z0-9_-]/g, "-");

const idFor = (prefix: string, name: Input<string>, index: number) => {
  // An unresolved Input cannot safely contribute its eventual value to an ID.
  // The deterministic position fallback keeps composition possible; callers
  // should keep names in a stable order when using deferred names.
  if (typeof name !== "string") return Effect.succeed(`${prefix}-${index + 1}`);
  const normalized = normalize(name);
  return sha256(`hostname-target:${normalized}`).pipe(
    Effect.map(
      (hash) =>
        `${prefix}-${readableName(name) || "root"}-${hash.slice(0, 12)}`,
    ),
  );
};

/** Construct native hostname-target resources through the selected DNS adapter. */
export const createHostnameTargets = ({
  zone,
  names,
  target,
  targetMetadata,
  idPrefix = "HostnameTarget",
}: HostnameTargetsProps): Effect.Effect<
  ReadonlyArray<DnsRecordHandle>,
  DnsError,
  import("./Contract.ts").DnsConstructionServices
> =>
  Effect.forEach(
    names,
    (name, index) =>
      Effect.gen(function* () {
        const id = yield* idFor(idPrefix, name, index);
        return yield* zone.hostnameTarget({
          id,
          name,
          target,
          targetMetadata,
        });
      }),
    { concurrency: "unbounded" },
  );

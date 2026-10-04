import * as route53 from "@distilled.cloud/aws/route-53";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { isResolved } from "../../Diff.ts";
import { OwnedBySomeoneElse, Unowned } from "../../AdoptPolicy.ts";
import * as Provider from "../../Provider.ts";
import { Resource, type ResourceBinding } from "../../Resource.ts";
import { durationToSeconds } from "../IAM/common.ts";
import type { Providers } from "../Providers.ts";
import { resolveHostedZoneId } from "./HostedZoneLookup.ts";
import {
  normalizeHostedZoneId,
  normalizeName,
  toAliasTarget,
  toRecordSet,
  type RecordAliasTarget,
  type ResolvedRecordAliasTarget,
} from "./Record.ts";

/**
 * Binding contract of {@link Records}: composites (e.g. an
 * `AWS.Website.StaticSite` attached to an `AWS.Website.Router`) contribute
 * additional record names without a circular input prop.
 */
export type RecordsBinding = {
  /**
   * Additional record names to manage alongside {@link RecordsProps.names}.
   */
  names?: string[];
};

export interface RecordsProps {
  /**
   * Hosted zone that owns the records. When omitted, the most specific
   * PUBLIC hosted zone in the account containing the set's first name is
   * inferred by walking its parent domains; the deploy fails actionably
   * when no zone matches. Every name in the set lives in the one zone
   * either way.
   */
  hostedZoneId?: string;
  /**
   * Record type shared by every record in the set.
   */
  type: route53.RRType;
  /**
   * Record names managed by this set. Names contributed through the binding
   * contract (see {@link RecordsBinding}) are merged in at reconcile time.
   */
  names?: string[];
  /**
   * TTL for non-alias records, e.g. `"60 seconds"` (a bare number is
   * milliseconds). Rounded to whole seconds on the wire.
   */
  ttl?: Duration.Input;
  /**
   * Record values for non-alias records (shared by every name in the set).
   */
  records?: string[];
  /**
   * Alias target for alias records (shared by every name in the set).
   */
  aliasTarget?: RecordAliasTarget;
}

export interface Records extends Resource<
  "AWS.Route53.Records",
  RecordsProps,
  {
    /**
     * Hosted zone that owns the records. `undefined` only while the set
     * is empty with no explicit zone — resolved (explicit or inferred) on
     * the first reconcile that has a name.
     */
    hostedZoneId: string | undefined;
    /**
     * Record type shared by every record in the set.
     */
    type: route53.RRType;
    /**
     * Fully qualified names of every record currently managed by this set
     * (declared `names` plus bound names, as of the last reconcile).
     */
    names: string[];
    /**
     * Current TTL for non-alias records.
     */
    ttl: number | undefined;
    /**
     * Current non-alias record values.
     */
    records: string[] | undefined;
    /**
     * Current alias target, when the set manages alias records.
     */
    aliasTarget: ResolvedRecordAliasTarget | undefined;
  },
  RecordsBinding,
  Providers
> {}

/**
 * A dynamic set of identically-configured Route 53 records that differ only
 * by name.
 *
 * Unlike {@link Record} (one resource per record), `Records` reconciles a
 * whole name set against the hosted zone — names added to the set are
 * upserted, names removed from the set are deleted. The set is the union of
 * the declared `names` prop and names contributed through the
 * {@link RecordsBinding} binding contract, which is how composites (e.g. a
 * site attached to an `AWS.Website.Router`) register hostnames on a
 * distribution's DNS without a circular input prop.
 * ### Managing Record Sets
 * **Example:** Alias Records For Several Hostnames
 * ```typescript
 * const records = yield* Records("AliasRecords", {
 *   hostedZoneId: "Z1234567890",
 *   type: "A",
 *   names: ["www.example.com", "docs.example.com"],
 *   aliasTarget: {
 *     hostedZoneId: distribution.hostedZoneId,
 *     dnsName: distribution.domainName,
 *   },
 * });
 * ```
 *
 * **Example:** Binding Target For Composite-Contributed Names
 * ```typescript
 * // Names may also arrive through the binding contract — an
 * // `AWS.Website.Router` declares an empty set and attached sites bind
 * // their hostnames onto it:
 * const records = yield* Records("SiteAliasRecords", {
 *   hostedZoneId: "Z1234567890",
 *   type: "A",
 *   aliasTarget: {
 *     hostedZoneId: distribution.hostedZoneId,
 *     dnsName: distribution.domainName,
 *   },
 * });
 * // elsewhere:
 * yield* records.bind`MySite`({ names: ["docs.example.com"] });
 * ```
 *
 * @resource
 */
export const Records = Resource<Records>("AWS.Route53.Records");

/**
 * Union of declared and bound record names, deduped (case-insensitively via
 * trailing-dot-insensitive normalization) and sorted for stable comparisons.
 * Tolerates both `{ sid, data }` rows (provider lifecycle) and bare binding
 * payloads.
 * @internal
 */
const resolveDesiredNames = (
  declared: string[] | undefined,
  bindings: ReadonlyArray<RecordsBinding | ResourceBinding<RecordsBinding>>,
): string[] => {
  const bound = bindings.flatMap((binding) =>
    "data" in binding && binding.data !== undefined
      ? ((binding as ResourceBinding<RecordsBinding>).data.names ?? [])
      : ((binding as RecordsBinding).names ?? []),
  );
  const byNormalized = new Map<string, string>();
  for (const name of [...(declared ?? []), ...bound]) {
    const key = normalizeName(name).toLowerCase();
    if (!byNormalized.has(key)) {
      byNormalized.set(key, name);
    }
  }
  return [...byNormalized.values()].sort((a, b) => a.localeCompare(b));
};

export const RecordsProvider = () =>
  Provider.effect(
    Records,
    Effect.gen(function* () {
      const waitForChange = Effect.fn(function* (changeId: string) {
        return yield* route53
          .getChange({ Id: changeId.replace(/^\/change\//, "") })
          .pipe(
            Effect.map((response) => response.ChangeInfo.Status),
            Effect.catchTag("NoSuchChange", () => Effect.succeed("PENDING")),
            Effect.repeat({
              schedule: Schedule.max([
                Schedule.fixed("2 seconds"),
                Schedule.recurs(60),
              ]),
              until: (status) => status === "INSYNC",
            }),
          );
      });

      const findRecord = Effect.fn(function* (
        hostedZoneId: string,
        name: string,
        type: route53.RRType,
      ) {
        let request: route53.ListResourceRecordSetsRequest = {
          HostedZoneId: normalizeHostedZoneId(hostedZoneId),
          StartRecordName: normalizeName(name),
          StartRecordType: type,
          MaxItems: 10,
        };
        const seenCursors = new Set<string>();
        while (true) {
          const response = yield* route53
            .listResourceRecordSets(request)
            .pipe(
              Effect.catchTag("NoSuchHostedZone", () =>
                Effect.succeed(undefined),
              ),
            );
          const found = (response?.ResourceRecordSets ?? []).find(
            (recordSet) =>
              normalizeName(recordSet.Name) === normalizeName(name) &&
              recordSet.Type === type &&
              recordSet.SetIdentifier === undefined,
          );
          if (found) return found;
          if (!response?.IsTruncated || response.NextRecordName === undefined) {
            return undefined;
          }
          const cursor = [
            response.NextRecordName,
            response.NextRecordType ?? "",
            response.NextRecordIdentifier ?? "",
          ].join("\u0000");
          if (seenCursors.has(cursor)) {
            return yield* Effect.fail(
              new Error("Route53 record-set pagination repeated a cursor"),
            );
          }
          seenCursors.add(cursor);
          request = {
            HostedZoneId: normalizeHostedZoneId(hostedZoneId),
            StartRecordName: response.NextRecordName,
            StartRecordType: response.NextRecordType,
            StartRecordIdentifier: response.NextRecordIdentifier,
            MaxItems: 10,
          };
        }
      });

      const desiredRecordSet = (news: RecordsProps, name: string) =>
        toRecordSet({
          name,
          type: news.type,
          ttl: durationToSeconds(news.ttl),
          records: news.records,
          aliasTarget: news.aliasTarget,
        });

      /** Trailing-dot/case-insensitive comparison of a live record set
       * against the desired wire shape for one name. */
      const matchesDesired = (
        live: route53.ResourceRecordSet,
        desired: route53.ResourceRecordSet,
      ): boolean => {
        const normalizeDns = (value: string | undefined) =>
          value?.toLowerCase().replace(/\.$/, "");
        if (desired.AliasTarget) {
          return (
            normalizeDns(live.AliasTarget?.DNSName) ===
              normalizeDns(desired.AliasTarget.DNSName) &&
            live.AliasTarget?.HostedZoneId ===
              desired.AliasTarget.HostedZoneId &&
            (live.AliasTarget?.EvaluateTargetHealth ?? false) ===
              (desired.AliasTarget.EvaluateTargetHealth ?? false)
          );
        }
        const liveValues = (live.ResourceRecords ?? [])
          .map((record) => record.Value)
          .sort();
        const desiredValues = (desired.ResourceRecords ?? [])
          .map((record) => record.Value)
          .sort();
        return (
          live.TTL === desired.TTL &&
          liveValues.length === desiredValues.length &&
          liveValues.every((value, index) => value === desiredValues[index])
        );
      };

      /** Delete `names` (exact live shape) tolerantly — missing records,
       * missing zones, and already-deleted batches are all no-ops. */
      const deleteNames = Effect.fn(function* (
        hostedZoneId: string,
        type: route53.RRType,
        names: string[],
        expected: route53.ResourceRecordSet,
      ) {
        const changes: route53.Change[] = [];
        for (const name of names) {
          const live = yield* findRecord(hostedZoneId, name, type);
          // Never delete a foreign/drifted RRset merely because its name was
          // once in this resource. Route 53 DELETE is exact, so require the
          // stored managed payload to still match first.
          if (live && matchesDesired(live, expected)) {
            changes.push({ Action: "DELETE", ResourceRecordSet: live });
          }
        }
        if (changes.length === 0) {
          return;
        }
        yield* route53
          .changeResourceRecordSets({
            HostedZoneId: normalizeHostedZoneId(hostedZoneId),
            ChangeBatch: {
              Comment: "Alchemy Route53 record-set delete",
              Changes: changes,
            },
          })
          .pipe(
            Effect.flatMap((response) => waitForChange(response.ChangeInfo.Id)),
            Effect.catchTag("NoSuchHostedZone", () => Effect.void),
            Effect.catchTag("InvalidChangeBatch", (error) =>
              /not found|does not exist|already absent/i.test(
                error.message ?? error.messages?.join(" ") ?? "",
              )
                ? Effect.void
                : Effect.fail(error),
            ),
          );
      });

      return {
        stables: ["hostedZoneId", "type"],
        diff: Effect.fn(function* ({ olds, news }) {
          if (!isResolved(news)) return undefined;
          // Identity change → replace (same rule as `Record`); the names
          // themselves are mutable — prop/binding deltas fall through to
          // the engine's default update logic.
          if (
            // An undefined side means "inferred" — reconcile resolves it
            // against the live account, so only two explicit, differing
            // zones are a replacement.
            (olds.hostedZoneId !== undefined &&
              news.hostedZoneId !== undefined &&
              normalizeHostedZoneId(olds.hostedZoneId) !==
                normalizeHostedZoneId(news.hostedZoneId)) ||
            olds.type !== news.type
          ) {
            return { action: "replace" } as const;
          }
        }),
        read: Effect.fn(function* ({ output, olds }) {
          if (output === undefined) {
            // Route 53 has no ownership marker. Probe declared names and
            // report an existing RRset as unowned. `adopt(true)` is the
            // explicit escape hatch for taking it over.
            const zone = olds?.hostedZoneId;
            const names = olds?.names ?? [];
            if (zone === undefined || names.length === 0) return undefined;
            const found: string[] = [];
            let sample: route53.ResourceRecordSet | undefined;
            for (const name of names) {
              const live = yield* findRecord(zone, name, olds.type);
              if (live) {
                found.push(name);
                sample ??= live;
              }
            }
            if (sample === undefined) return undefined;
            return Unowned({
              hostedZoneId: normalizeHostedZoneId(zone),
              type: olds.type,
              names: found.map(normalizeName),
              ttl: sample.TTL,
              records: sample.ResourceRecords?.map((record) => record.Value),
              aliasTarget: toAliasTarget(sample.AliasTarget),
            });
          }
          if (output.hostedZoneId === undefined) {
            // An empty set that never resolved a zone — nothing to observe.
            return output;
          }
          const found: string[] = [];
          let recordSet: route53.ResourceRecordSet | undefined;
          for (const name of output.names) {
            const live = yield* findRecord(
              output.hostedZoneId,
              name,
              output.type,
            );
            if (live) {
              found.push(name);
              recordSet ??= live;
            }
          }
          return {
            ...output,
            names: found,
            ttl: recordSet?.TTL ?? output.ttl,
            records:
              recordSet?.ResourceRecords?.map((record) => record.Value) ??
              output.records,
            aliasTarget:
              toAliasTarget(recordSet?.AliasTarget) ?? output.aliasTarget,
          };
        }),
        reconcile: Effect.fn(function* ({ news, output, session, bindings }) {
          const desired = resolveDesiredNames(news.names, bindings);
          // Resolve the zone: explicit prop, else the zone this set already
          // resolved to, else infer from the first name in the set. A set
          // that is still empty with no explicit zone stays unresolved —
          // the zone materializes on the first reconcile that has a name.
          const explicitZoneId = news.hostedZoneId ?? output?.hostedZoneId;
          if (explicitZoneId === undefined && desired.length === 0) {
            yield* session.note(`${news.type} × 0 record(s)`);
            return {
              hostedZoneId: undefined,
              type: news.type,
              names: [],
              ttl: undefined,
              records: undefined,
              aliasTarget: undefined,
            };
          }
          const hostedZoneId = yield* resolveHostedZoneId(
            explicitZoneId,
            desired[0] ?? "",
          );
          // `output.names` is the cache of which records this resource
          // managed before — the only way to know what to garbage-collect
          // (Route 53 records carry no tags to observe ownership from).
          const previous = output?.names ?? [];
          const desiredKeys = new Set(
            desired.map((name) => normalizeName(name).toLowerCase()),
          );
          const stale = previous.filter(
            (name) => !desiredKeys.has(normalizeName(name).toLowerCase()),
          );

          // A Records output proves ownership only for the names that were
          // persisted in that output.  In particular, adding a name to an
          // already-owned set must not silently adopt an existing RRset.  Do
          // this complete preflight before constructing a change batch so a
          // conflict cannot partially update an older member of the set.
          const previousKeys = new Set(
            previous.map((name) => normalizeName(name).toLowerCase()),
          );
          for (const name of desired) {
            if (previousKeys.has(normalizeName(name).toLowerCase())) continue;
            const live = yield* findRecord(hostedZoneId, name, news.type);
            if (live !== undefined) {
              return yield* Effect.fail(
                new OwnedBySomeoneElse({
                  message: `Route 53 record set ${normalizeName(name)} already exists and is not owned by this Records resource`,
                  resourceType: "AWS.Route53.Records",
                  physicalName: normalizeName(name),
                }),
              );
            }
          }

          // Sync — observe each desired name and upsert only the delta.
          const changes: route53.Change[] = [];
          for (const name of desired) {
            const target = desiredRecordSet(news, name);
            const live = yield* findRecord(hostedZoneId, name, news.type);
            if (!live || !matchesDesired(live, target)) {
              changes.push({
                Action: output?.names.some(
                  (managedName) =>
                    normalizeName(managedName).toLowerCase() ===
                    normalizeName(name).toLowerCase(),
                )
                  ? "UPSERT"
                  : "CREATE",
                ResourceRecordSet: target,
              });
            }
          }
          if (changes.length > 0) {
            const response = yield* route53.changeResourceRecordSets({
              HostedZoneId: normalizeHostedZoneId(hostedZoneId),
              ChangeBatch: {
                Comment: "Alchemy Route53 record-set upsert",
                Changes: changes,
              },
            });
            yield* waitForChange(response.ChangeInfo.Id);
          }

          // Garbage-collect names that left the set.
          yield* deleteNames(
            hostedZoneId,
            news.type,
            stale,
            toRecordSet({
              name: stale[0] ?? desired[0] ?? "",
              type: news.type,
              records: output?.records,
              aliasTarget: output?.aliasTarget,
              ttl: output?.ttl,
            }),
          );

          yield* session.note(
            `${news.type} × ${desired.length} record(s)` +
              (stale.length > 0 ? ` (-${stale.length})` : ""),
          );

          const sample =
            desired.length > 0
              ? yield* findRecord(hostedZoneId, desired[0]!, news.type)
              : undefined;
          return {
            hostedZoneId: normalizeHostedZoneId(hostedZoneId),
            type: news.type,
            names: desired.map((name) => normalizeName(name)),
            ttl: sample?.TTL,
            records: sample?.ResourceRecords?.map((record) => record.Value),
            aliasTarget: toAliasTarget(sample?.AliasTarget),
          };
        }),
        delete: Effect.fn(function* ({ output }) {
          if (output.hostedZoneId === undefined) {
            // The set never resolved a zone — it never created records.
            return;
          }
          yield* deleteNames(
            output.hostedZoneId,
            output.type,
            output.names,
            toRecordSet({
              name: output.names[0] ?? "",
              type: output.type,
              records: output.records,
              aliasTarget: output.aliasTarget,
              ttl: output.ttl,
            }),
          );
        }),
      };
    }),
  );

import * as acm from "@distilled.cloud/aws/acm";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Output from "../../Output.ts";
import type { Input } from "../../Input.ts";
import { sha256 } from "../../Util/sha256.ts";
import type { Certificate } from "./Certificate.ts";
import {
  CertificateValidation,
  type CertificateValidation as CertificateValidationResource,
} from "./CertificateValidation.ts";
import type {
  BoundZone,
  DnsConstructionServices,
  DnsError,
  DnsRecordHandle,
} from "../../DNS/Contract.ts";

export class AcmValidationRecordSelectionError extends Data.TaggedError(
  "AcmValidationRecordSelectionError",
)<{
  readonly requestedDomain: string;
  readonly reason:
    | "missing-option"
    | "missing-record"
    | "malformed-record"
    | "non-cname-record"
    | "conflicting-record";
  readonly details: string;
}> {}

const normalizeDnsName = (value: string): string =>
  value.trim().toLowerCase().replace(/\.$/, "");
const validationGroup = (value: string): string =>
  normalizeDnsName(value).replace(/^\*\./, "");

export const selectAcmValidationRecord = (
  options: readonly acm.DomainValidation[],
  requestedDomain: string,
): acm.ResourceRecord => {
  const matching = options.filter(
    (option) =>
      typeof option?.DomainName === "string" &&
      validationGroup(option.DomainName) === validationGroup(requestedDomain),
  );
  if (matching.length === 0)
    throw new AcmValidationRecordSelectionError({
      requestedDomain,
      reason: "missing-option",
      details: "ACM returned no domain validation option for this name",
    });
  const records = matching.map((option) => option.ResourceRecord);
  if (records.some((record) => !record))
    throw new AcmValidationRecordSelectionError({
      requestedDomain,
      reason: "missing-record",
      details: "A matching ACM validation option has no ResourceRecord",
    });
  if (
    records.some(
      (record) =>
        typeof record?.Name !== "string" ||
        typeof record?.Type !== "string" ||
        typeof record?.Value !== "string" ||
        !record.Name.trim() ||
        !record.Type.trim() ||
        !record.Value.trim(),
    )
  )
    throw new AcmValidationRecordSelectionError({
      requestedDomain,
      reason: "malformed-record",
      details: "ACM returned an empty or malformed ResourceRecord",
    });
  const normalized = records.map((record) => ({
    Name: normalizeDnsName(record!.Name),
    Type: record!.Type.trim().toUpperCase(),
    Value: normalizeDnsName(record!.Value),
  }));
  if (normalized.some((record) => record.Type !== "CNAME"))
    throw new AcmValidationRecordSelectionError({
      requestedDomain,
      reason: "non-cname-record",
      details: "ACM validation requires a CNAME ResourceRecord",
    });
  const first = normalized[0]!;
  if (
    normalized.some(
      (record) =>
        record.Name !== first.Name ||
        record.Type !== first.Type ||
        record.Value !== first.Value,
    )
  )
    throw new AcmValidationRecordSelectionError({
      requestedDomain,
      reason: "conflicting-record",
      details: "Matching ACM validation options disagree on the DNS record",
    });
  return first;
};

export interface AcmDnsValidationProps {
  readonly certificate: Certificate;
  readonly identifiers: ReadonlyArray<Input<string>>;
  readonly zone: BoundZone;
  readonly idPrefix: string;
}
export interface AcmDnsValidationResult {
  readonly records: ReadonlyArray<DnsRecordHandle>;
  readonly validation: CertificateValidationResource;
}

const validationId = (prefix: string, name: Input<string>, index: number) => {
  if (typeof name !== "string")
    return Effect.succeed(`${prefix}Record-${index + 1}`);
  const normalized = normalizeDnsName(name);
  return sha256(`acm-validation:${normalized}`).pipe(
    Effect.map(
      (hash) =>
        `${prefix}Record-${normalized.replace(/^\*\./, "wildcard-").replace(/[^a-z0-9_-]/g, "-")}-${hash.slice(0, 12)}`,
    ),
  );
};

/** Compose ACM validation records and the waiter while preserving Output graph dependencies. */
export const createAcmDnsValidation = ({
  certificate,
  identifiers,
  zone,
  idPrefix,
}: AcmDnsValidationProps): Effect.Effect<
  AcmDnsValidationResult,
  DnsError,
  DnsConstructionServices
> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const unique = identifiers.filter((identifier) => {
      if (typeof identifier !== "string") return true;
      const key = validationGroup(identifier);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const records = yield* Effect.forEach(
      unique,
      (identifier, index) =>
        Effect.gen(function* () {
          const selected = Output.map(
            Output.all(
              Output.asOutput(identifier),
              certificate.domainValidationOptions,
            ),
            ([requestedDomain, options]) =>
              selectAcmValidationRecord(options, requestedDomain),
          );
          return yield* zone.record({
            id: yield* validationId(idPrefix, identifier, index),
            name: Output.map(selected, (record) => record.Name),
            type: "CNAME",
            values: [Output.map(selected, (record) => record.Value)],
          });
        }),
      { concurrency: "unbounded" },
    );
    const validation = yield* CertificateValidation(`${idPrefix}Validation`, {
      certificateArn: certificate.certificateArn,
      validationRecordFqdns: Output.all(
        ...records.map((record) => record.recordName),
      ).as<string[]>(),
    });
    return { records, validation };
  });

import { Region as AwsRegion } from "@distilled.cloud/aws/Region";
import * as acm from "@distilled.cloud/aws/acm";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Provider from "../../Provider.ts";
import { Resource } from "../../Resource.ts";
import type { Providers } from "../Providers.ts";

export interface CertificateValidationProps {
  /** ACM certificate ARN returned by an external-DNS Certificate resource. */
  certificateArn: string;
  /**
   * FQDNs of the DNS validation records. Values are intentionally inputs so
   * native DNS resources become real graph dependencies. This resource does
   * not inspect or create those records.
   */
  validationRecordFqdns: string[];
}

export interface CertificateValidation extends Resource<
  "AWS.ACM.CertificateValidation",
  CertificateValidationProps,
  {
    certificateArn: string;
    status: acm.CertificateStatus | undefined;
    domainName: string | undefined;
    subjectAlternativeNames: string[];
    domainValidationOptions: acm.DomainValidation[];
    issuedAt: Date | undefined;
    notAfter: Date | undefined;
  },
  never,
  Providers
> {}

export const CertificateValidation = Resource<CertificateValidation>(
  "AWS.ACM.CertificateValidation",
);

export class CertificateValidationFailed extends Data.TaggedError(
  "CertificateValidationFailed",
)<{
  readonly status: acm.CertificateStatus;
  readonly reason?: string;
}> {}

export class CertificateValidationTimedOut extends Data.TaggedError(
  "CertificateValidationTimedOut",
)<{ readonly certificateArn: string }> {}

const ACM_REGION = "us-east-1" as const;

/** Existing certificates encode their ACM region in the ARN. */
const regionOfCertificateArn = (certificateArn: string) =>
  certificateArn.split(":")[3] || ACM_REGION;

const withCertRegion =
  (region: string = ACM_REGION) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(
        AwsRegion,
        Effect.succeed(region as typeof ACM_REGION),
      ),
    );

const describe = (certificateArn: string) =>
  withCertRegion(regionOfCertificateArn(certificateArn))(
    acm.describeCertificate({ CertificateArn: certificateArn }).pipe(
      Effect.map((response) => response.Certificate),
      Effect.catchTag("ResourceNotFoundException", () =>
        Effect.succeed(undefined),
      ),
    ),
  );

const toAttrs = (
  certificateArn: string,
  certificate: acm.CertificateDetail,
) => ({
  certificateArn,
  status: certificate.Status,
  domainName: certificate.DomainName,
  subjectAlternativeNames: certificate.SubjectAlternativeNames ?? [],
  domainValidationOptions: certificate.DomainValidationOptions ?? [],
  issuedAt: certificate.IssuedAt,
  notAfter: certificate.NotAfter,
});

export const CertificateValidationProvider = () =>
  Provider.effect(
    CertificateValidation,
    Effect.succeed({
      stables: ["certificateArn"],
      diff: Effect.fn(function* ({ olds, news }) {
        const next = news as CertificateValidationProps;
        if (olds.certificateArn !== next.certificateArn) {
          return { action: "replace" } as const;
        }
        // The record FQDNs are dependency inputs, not an API setting. A
        // change must nevertheless re-run reconciliation after DNS changes.
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output) return undefined;
        const certificate = yield* describe(output.certificateArn);
        return certificate
          ? toAttrs(output.certificateArn, certificate)
          : undefined;
      }),
      reconcile: Effect.fn(function* ({ news, session }) {
        const certificateArn = (news as CertificateValidationProps)
          .certificateArn as string;
        const pending = yield* Effect.gen(function* () {
          const certificate = yield* describe(certificateArn);
          if (!certificate?.CertificateArn) {
            return yield* Effect.fail(
              new CertificateValidationTimedOut({ certificateArn }),
            );
          }
          if (certificate.Status === "ISSUED") return certificate;
          if (
            certificate.Status === "FAILED" ||
            certificate.Status === "VALIDATION_TIMED_OUT"
          ) {
            return yield* Effect.fail(
              new CertificateValidationFailed({
                status: certificate.Status,
                reason: certificate.FailureReason,
              }),
            );
          }
          return yield* Effect.fail(
            new CertificateValidationTimedOut({ certificateArn }),
          );
        }).pipe(
          Effect.retry({
            while: (error) => error instanceof CertificateValidationTimedOut,
            schedule: Schedule.max([
              Schedule.fixed("10 seconds"),
              Schedule.recurs(60),
            ]),
          }),
        );
        yield* session.note(certificateArn);
        return toAttrs(certificateArn, pending);
      }),
      delete: () => Effect.void,
    }),
  );

import { Certificate, CertificateProvider } from "@/AWS/ACM/Certificate.ts";
import {
  CertificateValidation,
  CertificateValidationFailed,
  CertificateValidationProvider,
} from "@/AWS/ACM/CertificateValidation.ts";
import * as Provider from "@/Provider.ts";
import { Stack } from "@/Stack.ts";
import { Stage } from "@/Stage.ts";
import type { ScopedPlanStatusSession } from "@/Report.ts";
import { describe, expect, test } from "alchemy-test";
import * as acm from "@distilled.cloud/aws/acm";
import { fromCredentials } from "@distilled.cloud/aws/Credentials";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

const arn = "arn:aws:acm:us-east-1:123456789012:certificate/test";
const record = {
  DomainName: "external.example.com",
  ValidationDomain: "example.com",
  ValidationStatus: "PENDING_VALIDATION" as const,
  ResourceRecord: {
    Name: "_token.external.example.com.",
    Type: "CNAME" as const,
    Value: "_value.acm-validations.aws.",
  },
};
const detail = (status: acm.CertificateStatus): acm.CertificateDetail => ({
  CertificateArn: arn,
  DomainName: "external.example.com",
  SubjectAlternativeNames: ["external.example.com"],
  Status: status,
  DomainValidationOptions: [record],
  IssuedAt: status === "ISSUED" ? new Date("2026-01-01") : undefined,
});

const session: ScopedPlanStatusSession = {
  emit: () => Effect.void,
  done: () => Effect.void,
  note: () => Effect.void,
};

const response = (value: unknown) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.post("https://acm.us-east-1.amazonaws.com"),
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/x-amz-json-1.1" },
    }),
  );

const acmHarness = (
  describes: acm.CertificateDetail[],
  certificateArn = arn,
) => {
  let index = 0;
  let calls = 0;
  let route53Calls = 0;
  const acmRegions: string[] = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      calls++;
      if (request.url.includes("route53")) route53Calls++;
      if (request.url.includes("acm.")) {
        acmRegions.push(request.url.split("acm.")[1]!.split(".")[0]!);
      }
      const target = request.headers["x-amz-target"] ?? "";
      if (target.endsWith("ListCertificates"))
        return response({
          CertificateSummaryList: [
            {
              CertificateArn: certificateArn,
              DomainName: detail("PENDING_VALIDATION").DomainName,
            },
          ],
        });
      if (target.endsWith("RequestCertificate"))
        return response({ CertificateArn: arn });
      if (!target.endsWith("DescribeCertificate")) {
        if (target.endsWith("ListTagsForCertificate"))
          return response({ Tags: [] });
        if (target.endsWith("AddTagsToCertificate")) return response({});
        if (target.endsWith("RemoveTagsFromCertificate")) return response({});
        if (target.endsWith("DeleteCertificate")) return response({});
      }
      return response({
        Certificate: describes[Math.min(index++, describes.length - 1)],
      });
    }),
  );
  return {
    calls: () => calls,
    route53Calls: () => route53Calls,
    acmRegions: () => acmRegions,
    layer: Layer.mergeAll(
      Layer.succeed(HttpClient.HttpClient, client),
      fromCredentials(
        { accessKeyId: "test", secretAccessKey: "test" },
        "us-east-1",
      ),
    ),
  };
};

describe(
  "AWS ACM offline",
  { tags: ["unit", "provider:aws", "provider:aws:acm", "local"] },
  () => {
    test("external Certificate rejects hostedZoneId before any AWS request", () =>
      Effect.gen(function* () {
        const harness = acmHarness([]);
        const service = yield* Provider.findProvider(Certificate).pipe(
          Effect.provide(CertificateProvider()),
        );
        const result = yield* service
          .reconcile({
            id: "ExternalCertificate",
            fqn: "ExternalCertificate",
            instanceId: "instance",
            news: {
              domainName: "external.example.com",
              validation: "external",
              hostedZoneId: "Z123",
            },
            olds: undefined,
            output: undefined,
            bindings: [],
            session,
          })
          .pipe(Effect.provide(harness.layer), Effect.result);
        expect(result._tag).toBe("Failure");
        expect(harness.calls()).toBe(0);
      }));

    test("external Certificate returns validation records without Route 53 calls", () =>
      Effect.gen(function* () {
        const harness = acmHarness([detail("PENDING_VALIDATION")]);
        const service = yield* Provider.findProvider(Certificate).pipe(
          Effect.provide(CertificateProvider()),
        );
        const result = yield* service
          .reconcile({
            id: "ExternalCertificate",
            fqn: "ExternalCertificate",
            instanceId: "instance",
            news: {
              domainName: "external.example.com",
              validation: "external",
            },
            olds: undefined,
            output: undefined,
            bindings: [],
            session,
          })
          .pipe(
            Effect.provide(
              Layer.mergeAll(
                harness.layer,
                Layer.succeed(Stack, {
                  name: "test",
                  stage: "test",
                  resources: {},
                  bindings: {},
                  actions: {},
                }),
                Layer.succeed(Stage, "test"),
              ),
            ),
          );
        expect(result.status).toBe("PENDING_VALIDATION");
        expect(result.domainValidationOptions[0]?.ResourceRecord?.Name).toBe(
          record.ResourceRecord.Name,
        );
        expect(harness.route53Calls()).toBe(0);
      }));

    test("CertificateValidation polls pending ACM status until issued", () =>
      Effect.gen(function* () {
        const harness = acmHarness([
          detail("PENDING_VALIDATION"),
          detail("ISSUED"),
        ]);
        const service = yield* Provider.findProvider(
          CertificateValidation,
        ).pipe(Effect.provide(CertificateValidationProvider()));
        const result = yield* service
          .reconcile({
            id: "Validation",
            fqn: "Validation",
            instanceId: "instance",
            news: {
              certificateArn: arn,
              validationRecordFqdns: [record.ResourceRecord.Name],
            },
            olds: undefined,
            output: undefined,
            bindings: [],
            session,
          })
          .pipe(Effect.provide(harness.layer));
        expect(result.status).toBe("ISSUED");
        expect(harness.calls()).toBe(2);
        expect(harness.acmRegions()).toEqual(["us-east-1", "us-east-1"]);
      }));

    test("CertificateValidation describes certificates in the ARN region", () =>
      Effect.gen(function* () {
        const cases = [
          ["eu-west-1", "arn:aws:acm:eu-west-1:123456789012:certificate/eu"],
          ["us-west-2", "arn:aws:acm:us-west-2:123456789012:certificate/west"],
          ["us-east-1", "arn:aws:acm:us-east-1:123456789012:certificate/east"],
        ] as const;

        for (const [region, certificateArn] of cases) {
          const harness = acmHarness([detail("ISSUED")], certificateArn);
          const service = yield* Provider.findProvider(
            CertificateValidation,
          ).pipe(Effect.provide(CertificateValidationProvider()));
          const read = service.read;
          if (read === undefined)
            throw new Error("CertificateValidation read provider is required");
          const result = yield* read({
            id: "Validation",
            fqn: "Validation",
            instanceId: "instance",
            olds: {
              certificateArn,
              validationRecordFqdns: [record.ResourceRecord.Name],
            },
            output: {
              certificateArn,
              status: "ISSUED",
              domainName: undefined,
              subjectAlternativeNames: [],
              domainValidationOptions: [],
              issuedAt: undefined,
              notAfter: undefined,
            },
          }).pipe(Effect.provide(harness.layer));

          expect(result?.certificateArn).toBe(certificateArn);
          expect(harness.acmRegions()).toEqual([region]);

          const reconcileHarness = acmHarness(
            [detail("ISSUED")],
            certificateArn,
          );
          const reconciled = yield* service
            .reconcile({
              id: "Validation",
              fqn: "Validation",
              instanceId: "instance",
              news: {
                certificateArn,
                validationRecordFqdns: [record.ResourceRecord.Name],
              },
              olds: undefined,
              output: undefined,
              bindings: [],
              session,
            })
            .pipe(Effect.provide(reconcileHarness.layer));

          expect(reconciled.certificateArn).toBe(certificateArn);
          expect(reconcileHarness.acmRegions()).toEqual([region]);
        }
      }));

    test("CertificateValidation pending wait is interruptible instead of returning ISSUED", () =>
      Effect.gen(function* () {
        const harness = acmHarness([detail("PENDING_VALIDATION")]);
        const service = yield* Provider.findProvider(
          CertificateValidation,
        ).pipe(Effect.provide(CertificateValidationProvider()));
        const result = yield* service
          .reconcile({
            id: "Validation",
            fqn: "Validation",
            instanceId: "instance",
            news: {
              certificateArn: arn,
              validationRecordFqdns: [record.ResourceRecord.Name],
            },
            olds: undefined,
            output: undefined,
            bindings: [],
            session,
          })
          .pipe(
            Effect.provide(harness.layer),
            Effect.timeoutOption("20 millis"),
          );
        expect(Option.isNone(result)).toBe(true);
      }));

    test("CertificateValidation fails on terminal ACM failure and never returns pending as issued", () =>
      Effect.gen(function* () {
        const harness = acmHarness([detail("FAILED")]);
        const service = yield* Provider.findProvider(
          CertificateValidation,
        ).pipe(Effect.provide(CertificateValidationProvider()));
        const result = yield* service
          .reconcile({
            id: "Validation",
            fqn: "Validation",
            instanceId: "instance",
            news: {
              certificateArn: arn,
              validationRecordFqdns: [record.ResourceRecord.Name],
            },
            olds: undefined,
            output: undefined,
            bindings: [],
            session,
          })
          .pipe(Effect.provide(harness.layer), Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure).toBeInstanceOf(CertificateValidationFailed);
      }));

    test("CertificateValidation delete is passive and performs no ACM mutation", () =>
      Effect.gen(function* () {
        const harness = acmHarness([]);
        const service = yield* Provider.findProvider(
          CertificateValidation,
        ).pipe(Effect.provide(CertificateValidationProvider()));
        yield* service
          .delete({
            id: "Validation",
            fqn: "Validation",
            instanceId: "instance",
            olds: { certificateArn: arn, validationRecordFqdns: [] },
            output: {
              certificateArn: arn,
              status: "PENDING_VALIDATION",
              domainName: undefined,
              subjectAlternativeNames: [],
              domainValidationOptions: [],
              issuedAt: undefined,
              notAfter: undefined,
            },
            bindings: [],
            session,
          })
          .pipe(Effect.provide(harness.layer));
        expect(harness.calls()).toBe(0);
      }));
  },
);

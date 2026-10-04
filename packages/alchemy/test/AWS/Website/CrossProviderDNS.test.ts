import * as AWS from "@/AWS";
import * as Cloudflare from "@/Cloudflare";
import * as DNS from "@/DNS";
import * as Output from "@/Output";
import * as Test from "@/Test/Alchemy";
import { Region as AwsRegion } from "@distilled.cloud/aws/Region";
import * as acm from "@distilled.cloud/aws/acm";
import * as cloudfront from "@distilled.cloud/aws/cloudfront";
import * as cloudflareDns from "@distilled.cloud/cloudflare/dns";
import { expect, describe } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { fileURLToPath } from "node:url";

const baseDomain = process.env.DOMAIN?.replace(/\.$/, "");
const hasCredentials =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.CLOUDFLARE_API_TOKEN &&
  !!process.env.CLOUDFLARE_ACCOUNT_ID &&
  !!baseDomain;

const names = baseDomain
  ? [
      `alchemy-cross-provider-router-test.${baseDomain}`,
      `alchemy-cross-provider-router-site.${baseDomain}`,
      `alchemy-cross-provider-router-ssr.${baseDomain}`,
      `alchemy-cross-provider-router-nodns.${baseDomain}`,
    ]
  : [];
const ownedNames = baseDomain ? [...names, `*.${baseDomain}`] : names;

const fixtureDir = fileURLToPath(
  new URL("./fixtures/static-site", import.meta.url),
);

const providers = Layer.mergeAll(
  AWS.providers(),
  Cloudflare.providers(),
  DNS.adapterLayer(Cloudflare.DNS.cloudflareDnsAdapter),
);

const { test } = Test.make({ providers });

const ownedRecords = (zoneId: string) =>
  cloudflareDns.listRecords.items({ zoneId }).pipe(
    Stream.runCollect,
    Effect.map((records) =>
      Array.from(records).filter((record) =>
        ownedNames.includes(record.name?.replace(/\.$/, "") ?? ""),
      ),
    ),
  );

const withUsEast1 = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(AwsRegion, Effect.succeed("us-east-1")));

const assertNoOwnedDistributionAlias = Effect.gen(function* () {
  const response = yield* cloudfront.listDistributions({});
  const aliases = new Set(
    response.DistributionList?.Items?.flatMap(
      (item) => item.Aliases?.Items ?? [],
    ) ?? [],
  );
  const collision = ownedNames.find((name) => aliases.has(name));
  if (collision) {
    return yield* Effect.fail(
      new Error(`Refusing to reuse existing CloudFront alias ${collision}`),
    );
  }
});

const observeCertificateValidation = Effect.gen(function* () {
  const listed = yield* withUsEast1(acm.listCertificates({}));
  const summary = listed.CertificateSummaryList?.find(
    (item) => item.DomainName === names[0],
  );
  if (!summary?.CertificateArn) {
    yield* Effect.logInfo(`ACM observer: no certificate yet for ${names[0]}`);
    return { done: false };
  }

  const described = yield* withUsEast1(
    acm.describeCertificate({ CertificateArn: summary.CertificateArn }),
  );
  const certificate = described.Certificate;
  const validation = (certificate?.DomainValidationOptions ?? []).map(
    (option) => ({
      domain: option.DomainName,
      status: option.ValidationStatus,
      recordName: option.ResourceRecord?.Name,
      recordType: option.ResourceRecord?.Type,
      recordValue: option.ResourceRecord?.Value,
    }),
  );
  const message = yield* Effect.sync(() =>
    JSON.stringify({
      domain: names[0],
      status: certificate?.Status,
      failureReason: certificate?.FailureReason,
      validation,
    }),
  );
  yield* Effect.logInfo(`ACM observer: ${message}`);
  return {
    done: certificate?.Status === "ISSUED" || certificate?.Status === "FAILED",
  };
}).pipe(
  Effect.catch((error) =>
    Effect.logInfo(`ACM observer error: ${String(error)}`).pipe(
      Effect.as({ done: false }),
    ),
  ),
  Effect.repeat({
    schedule: Schedule.spaced("20 seconds"),
    until: (result) => result.done,
    times: 11,
  }),
  Effect.ignore,
);

// CloudFront create and disable/delete commonly exceed the 120 second test
// budget. This is a manual opt-in long lifecycle test, not a default CI test.
const runLive =
  hasCredentials && process.env.ALCHEMY_RUN_WEBSITE_CROSS_PROVIDER_DNS === "1";

describe.skipIf(!runLive)(
  "AWS.Website Cloudflare DNS discovery",
  {
    tags: [
      "provider:aws",
      "provider:aws:website",
      "provider:aws:cloudfront",
      "provider:cloudflare",
      "provider:cloudflare:dns",
      "live",
    ],
  },
  () => {
    test.provider(
      "creates Router, StaticSite, and SsrSite records in discovered Cloudflare DNS",
      (stack) =>
        Effect.gen(function* () {
          yield* stack.destroy();

          const selection = Cloudflare.DNS.dns();
          const discovered = yield* selection.resolve(names[0]!);
          if (typeof discovered.identity.id !== "string") {
            return yield* Effect.fail(
              new Error("Cloudflare selector returned an unresolved zone id"),
            );
          }
          const before = yield* ownedRecords(discovered.identity.id);
          if (before.length > 0) {
            return yield* Effect.fail(
              new Error(
                `Refusing to reuse existing Cloudflare records for ${before
                  .map((record) => record.name)
                  .join(", ")}`,
              ),
            );
          }
          yield* assertNoOwnedDistributionAlias;
          const certificates = yield* withUsEast1(acm.listCertificates({}));
          if (
            certificates.CertificateSummaryList?.some(
              (certificate) => certificate.DomainName === names[0],
            )
          ) {
            return yield* Effect.fail(
              new Error(
                `Refusing to reuse existing ACM certificate for ${names[0]}`,
              ),
            );
          }

          yield* Effect.forkScoped(observeCertificateValidation);

          let zoneId: string | undefined;
          yield* Effect.gen(function* () {
            const deployed = yield* stack.deploy(
              Effect.gen(function* () {
                const router = yield* AWS.Website.Router("Router", {
                  domain: {
                    name: names[0]!,
                    aliases: [`*.${baseDomain}`],
                    dns: Cloudflare.DNS.dns(),
                  },
                });
                const site = yield* AWS.Website.StaticSite("RouterSite", {
                  path: fixtureDir,
                  forceDestroy: true,
                  domain: {
                    router,
                    name: names[1]!,
                  },
                });
                const ssr = yield* AWS.Website.SsrSite("RouterSsr", {
                  server: { type: "url", url: "https://origin.example.net" },
                  cdn: false,
                  domain: {
                    router,
                    name: names[2]!,
                  },
                });
                yield* AWS.Website.StaticSite("RouterNoDns", {
                  path: fixtureDir,
                  forceDestroy: true,
                  domain: {
                    router,
                    name: names[3]!,
                    dns: false,
                  },
                });
                return { router, site, ssr };
              }),
            );

            const zone = deployed.router.dnsZone;
            expect(zone?.identity.kind).toBe("cloudflare");
            zoneId = zone?.identity.id;
            const created = yield* ownedRecords(zone!.identity.id);
            const createdNames = new Set(
              created.map((record) => record.name?.replace(/\.$/, "")),
            );
            const recordSnapshot = yield* Effect.sync(() =>
              JSON.stringify(
                created.map((record) => ({
                  id: record.id,
                  name: record.name?.replace(/\.$/, ""),
                  type: record.type,
                  content: record.content,
                  proxied: record.proxied,
                  createdOn: record.createdOn,
                  modifiedOn: record.modifiedOn,
                  comment: record.comment,
                  tags: record.tags,
                })),
              ),
            );
            const routerOutputRecords = yield* Effect.forEach(
              deployed.router.records ?? [],
              (record) =>
                "recordName" in record
                  ? Output.evaluate(record.recordName, {})
                  : Effect.succeed(record.name),
            );
            const ssrOutputRecords = yield* Effect.forEach(
              deployed.ssr.records ?? [],
              (record) =>
                "recordName" in record
                  ? Output.evaluate(record.recordName, {})
                  : Effect.succeed(record.name),
            );
            const componentOutputSnapshot = yield* Effect.sync(() =>
              JSON.stringify({
                ROUTER_OUTPUT_RECORDS: routerOutputRecords,
                STATIC_OUTPUT_RECORDS:
                  "unavailable: StaticSite public output has no records field",
                SSR_OUTPUT_RECORDS: ssrOutputRecords,
                NODNS_OUTPUT_RECORDS:
                  "unavailable: StaticSite public output has no records field",
              }),
            );
            yield* Effect.logInfo(
              `Cloudflare component output diagnostics: ${componentOutputSnapshot}`,
            );
            yield* Effect.logInfo(
              `Cloudflare fixture record diagnostics: expected=${JSON.stringify(
                [names[0], names[1], names[2], names[3], `*.${baseDomain}`],
              )} actual=${recordSnapshot} ssrExactCount=${
                created.filter(
                  (record) => record.name?.replace(/\.$/, "") === names[2],
                ).length
              } noDnsExactCount=${
                created.filter(
                  (record) => record.name?.replace(/\.$/, "") === names[3],
                ).length
              }`,
            );
            expect(createdNames).toEqual(
              new Set([names[0], names[1], names[2], `*.${baseDomain}`]),
            );
            expect(created.every((record) => record.type === "CNAME")).toBe(
              true,
            );
            expect(created.every((record) => record.proxied === false)).toBe(
              true,
            );

            const config = yield* cloudfront.getDistributionConfig({
              Id: deployed.router.distribution.distributionId,
            });
            expect(config.DistributionConfig?.Aliases?.Items).toEqual(
              expect.arrayContaining(names.slice(0, 3)),
            );
            expect(
              config.DistributionConfig?.ViewerCertificate?.ACMCertificateArn,
            ).toBe(deployed.router.certificate?.certificateArn);
            expect(deployed.router.certificate?.certificateArn).toBeDefined();
            const certificateRef = deployed.router.certificate!.certificateArn;
            const resolvedCertificate = Effect.isEffect(certificateRef)
              ? yield* certificateRef
              : Output.isOutput(certificateRef)
                ? yield* Output.evaluate(certificateRef, {})
                : certificateRef;
            if (typeof resolvedCertificate !== "string") {
              return yield* Effect.fail(
                new Error("Router certificate ARN did not resolve to a string"),
              );
            }
            const certificate = yield* withUsEast1(
              acm.describeCertificate({
                CertificateArn: resolvedCertificate,
              }),
            );
            expect(certificate.Certificate?.Status).toBe("ISSUED");

            const distributionTarget = deployed.router.distribution.domainName;
            expect(
              created.every((record) => record.content === distributionTarget),
            ).toBe(true);
            expect(
              (yield* ownedRecords(zone!.identity.id)).some(
                (record) => record.name?.replace(/\.$/, "") === names[3],
              ),
            ).toBe(false);
          }).pipe(
            Effect.ensuring(stack.destroy().pipe(Effect.result, Effect.asVoid)),
          );

          if (zoneId) {
            const after = yield* ownedRecords(zoneId);
            expect(after).toHaveLength(0);
          }
        }),
      { timeout: 3_000_000 },
    );
  },
);

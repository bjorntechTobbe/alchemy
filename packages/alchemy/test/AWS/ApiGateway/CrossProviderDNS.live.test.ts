import * as AWS from "@/AWS";
import * as Cloudflare from "@/Cloudflare";
import { cloudflareDnsAdapter } from "@/Cloudflare/DNS/Adapter";
import * as DNS from "@/DNS";
import * as Test from "./Test.ts";
import * as ag from "@distilled.cloud/aws/api-gateway";
import * as acm from "@distilled.cloud/aws/acm";
import * as cloudflareDns from "@distilled.cloud/cloudflare/dns";
import { expect } from "alchemy-test";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Schedule from "effect/Schedule";
import * as Layer from "effect/Layer";

const { test } = Test.make({
  providers: Layer.mergeAll(AWS.providers(), Cloudflare.providers()),
});

const domain = process.env.DOMAIN;
const hasCredentials =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.CLOUDFLARE_API_TOKEN;
const hostname = domain ? `alchemy-dns-rest.${domain}` : undefined;

const boundedPropagationRetry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.retry({
      schedule: Schedule.max([
        Schedule.exponential(Duration.millis(500)).pipe(
          Schedule.modifyDelay(({ duration }) =>
            Effect.succeed(
              Duration.isGreaterThan(duration, Duration.seconds(5))
                ? Duration.seconds(5)
                : duration,
            ),
          ),
        ),
        Schedule.recurs(10),
      ]),
    }),
  );

test.provider.skipIf(!hostname || !hasCredentials)(
  "REST API custom domain uses component-owned Cloudflare DNS",
  (stack) =>
    Effect.gen(function* () {
      yield* stack.destroy();

      const zone = yield* DNS.bind(Cloudflare.DNS.dns(), hostname!);
      const preflightZoneId = zone.zone.identity.id;
      if (typeof preflightZoneId !== "string") {
        return yield* Effect.fail(
          new Error("Cloudflare selector returned an unresolved zone id"),
        );
      }
      const existingRecords = yield* cloudflareDns.listRecords({
        zoneId: preflightZoneId,
      });
      if (existingRecords.result?.some((item) => item.name === hostname)) {
        return yield* Effect.fail(
          new Error(`Refusing to adopt existing Cloudflare record ${hostname}`),
        );
      }
      const existingDomain = yield* ag
        .getDomainName({ domainName: hostname! })
        .pipe(
          Effect.map(() => true),
          Effect.catchTag("NotFoundException", () => Effect.succeed(false)),
        );
      if (existingDomain) {
        return yield* Effect.fail(
          new Error(
            `Refusing to adopt existing API Gateway domain ${hostname}`,
          ),
        );
      }
      const existingCertificates = yield* acm.listCertificates({});
      if (
        existingCertificates.CertificateSummaryList?.some(
          (certificate) => certificate.DomainName === hostname,
        )
      ) {
        return yield* Effect.fail(
          new Error(`Refusing to reuse existing ACM certificate ${hostname}`),
        );
      }

      const out = yield* stack.deploy(
        Effect.gen(function* () {
          const api = yield* AWS.ApiGateway.RestApi("RestApi", {
            endpointConfiguration: { types: ["REGIONAL"] },
          });
          yield* AWS.ApiGateway.Method("RootGet", {
            restApi: api,
            httpMethod: "GET",
            authorizationType: "NONE",
            integration: { type: "MOCK" },
          });
          const deployment = yield* AWS.ApiGateway.Deployment("Deployment", {
            restApi: api,
          });
          const stage = yield* AWS.ApiGateway.Stage("Stage", {
            restApi: api,
            stageName: "test",
            deploymentId: deployment.deploymentId,
          });
          const custom = yield* AWS.ApiGateway.CustomDomain("CustomDomain", {
            domainName: hostname!,
            api,
            stage,
            dns: Cloudflare.DNS.dns(),
          });
          return { api, stage, ...custom };
        }).pipe(Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter))),
      );

      const awsDomain = yield* ag.getDomainName({
        domainName: out.domain.domainName,
      });
      expect(awsDomain.regionalDomainName).toBeDefined();
      expect(awsDomain.regionalCertificateArn).toBeDefined();
      expect(awsDomain.regionalCertificateArn).toBe(
        out.certificate?.certificateArn,
      );

      const certificate = yield* acm.describeCertificate({
        CertificateArn: awsDomain.regionalCertificateArn!,
      });
      expect(certificate.Certificate?.Status).toBe("ISSUED");

      // The component owns zone discovery. The returned zone identity is used
      // for this SDK read; the test does not call findZoneByName itself.
      const zoneId = preflightZoneId;
      const records = yield* cloudflareDns.listRecords({ zoneId });
      const record = records.result?.find(
        (item) => item.name === hostname && item.type === "CNAME",
      );
      expect(record).toBeDefined();
      expect(record?.content).toBe(awsDomain.regionalDomainName);
      expect(record?.proxied).toBe(false);

      const response = yield* boundedPropagationRetry(
        HttpClient.get(`https://${hostname}/`).pipe(
          Effect.flatMap((value) =>
            value.status === 200
              ? Effect.succeed(value)
              : Effect.fail(
                  new Error(`REST custom domain returned ${value.status}`),
                ),
          ),
        ),
      );
      expect(response.status).toBe(200);

      const certificateArn = awsDomain.regionalCertificateArn!;
      yield* stack.destroy();
      const deleted = yield* ag.getDomainName({ domainName: hostname! }).pipe(
        Effect.map(() => false),
        Effect.catchTag("NotFoundException", () => Effect.succeed(true)),
      );
      expect(deleted).toBe(true);
      const mappingDeleted = yield* ag
        .getBasePathMapping({ domainName: hostname!, basePath: "(none)" })
        .pipe(
          Effect.map(() => false),
          Effect.catchTag("NotFoundException", () => Effect.succeed(true)),
        );
      expect(mappingDeleted).toBe(true);
      const certificateDeleted = yield* acm
        .describeCertificate({ CertificateArn: certificateArn })
        .pipe(
          Effect.map(() => false),
          Effect.catchTag("ResourceNotFoundException", () =>
            Effect.succeed(true),
          ),
        );
      expect(certificateDeleted).toBe(true);
      const remaining = yield* cloudflareDns.listRecords({ zoneId });
      expect(remaining.result?.some((item) => item.name === hostname)).toBe(
        false,
      );
    }).pipe(Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter))),
  {
    tags: [
      "provider:aws",
      "provider:aws:apigateway",
      "provider:cloudflare",
      "live",
    ],
    timeout: 120_000,
  },
);

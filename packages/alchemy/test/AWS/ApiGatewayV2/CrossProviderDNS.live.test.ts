import * as AWS from "@/AWS";
import * as Cloudflare from "@/Cloudflare";
import { cloudflareDnsAdapter } from "@/Cloudflare/DNS/Adapter";
import * as DNS from "@/DNS";
import * as Test from "@/Test/Alchemy";
import * as agw2 from "@distilled.cloud/aws/apigatewayv2";
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
const hostname = domain ? `alchemy-dns-http.${domain}` : undefined;

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
  "HTTP API custom domain uses component-owned Cloudflare DNS",
  (stack) =>
    Effect.gen(function* () {
      yield* stack.destroy();

      const zone = yield* DNS.bind(Cloudflare.DNS.dns(), hostname!);
      const zoneId = zone.zone.identity.id;
      if (typeof zoneId !== "string") {
        return yield* Effect.fail(
          new Error("Cloudflare selector returned an unresolved zone id"),
        );
      }
      const existingRecords = yield* cloudflareDns.listRecords({
        zoneId,
      });
      if (existingRecords.result?.some((item) => item.name === hostname)) {
        return yield* Effect.fail(
          new Error(`Refusing to adopt existing Cloudflare record ${hostname}`),
        );
      }
      const existingDomain = yield* agw2
        .getDomainName({ DomainName: hostname! })
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
          // The HTTP proxy target is intentionally stable and public. No
          // Lambda or additional AWS runtime resource is needed.
          const api = yield* AWS.ApiGatewayV2.Api("HttpApi", {
            protocolType: "HTTP",
          });
          const integration = yield* AWS.ApiGatewayV2.Integration(
            "Integration",
            {
              api,
              integrationType: "HTTP_PROXY",
              integrationUri: "https://example.com",
              integrationMethod: "ANY",
              payloadFormatVersion: "1.0",
            },
          );
          yield* AWS.ApiGatewayV2.Route("DefaultRoute", {
            api,
            routeKey: "$default",
            integration,
          });
          const stage = yield* AWS.ApiGatewayV2.Stage("Stage", {
            api,
            stageName: "$default",
            autoDeploy: true,
          });
          const custom = yield* AWS.ApiGatewayV2.CustomDomain("CustomDomain", {
            domainName: hostname!,
            api,
            stage,
            dns: Cloudflare.DNS.dns(),
          });
          return { api, stage, ...custom };
        }).pipe(Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter))),
      );

      const awsDomain = yield* agw2.getDomainName({
        DomainName: out.domain.domainName,
      });
      const config = awsDomain.DomainNameConfigurations?.[0];
      expect(config?.ApiGatewayDomainName).toBeDefined();
      expect(config?.CertificateArn).toBeDefined();
      const certificate = yield* acm.describeCertificate({
        CertificateArn: config!.CertificateArn!,
      });
      expect(certificate.Certificate?.Status).toBe("ISSUED");

      // The zone comes from CustomDomain's selector result, not a test-side
      // findZoneByName lookup.
      const records = yield* cloudflareDns.listRecords({
        zoneId,
      });
      const record = records.result?.find(
        (item) => item.name === hostname && item.type === "CNAME",
      );
      expect(record).toBeDefined();
      expect(record?.content).toBe(config?.ApiGatewayDomainName);
      expect(record?.proxied).toBe(false);

      const response = yield* boundedPropagationRetry(
        HttpClient.get(`https://${hostname}/`).pipe(
          Effect.flatMap((value) =>
            value.status === 200
              ? Effect.succeed(value)
              : Effect.fail(
                  new Error(`HTTP custom domain returned ${value.status}`),
                ),
          ),
        ),
      );
      expect(response.status).toBe(200);
      expect((yield* response.text).length).toBeGreaterThan(0);

      const mappingId = out.mapping.apiMappingId;
      const certificateArn = config!.CertificateArn!;
      yield* stack.destroy();
      const deleted = yield* agw2.getDomainName({ DomainName: hostname! }).pipe(
        Effect.map(() => false),
        Effect.catchTag("NotFoundException", () => Effect.succeed(true)),
      );
      expect(deleted).toBe(true);
      const mappingDeleted = yield* agw2
        .getApiMapping({
          DomainName: hostname!,
          ApiMappingId: mappingId,
        })
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
      const remaining = yield* cloudflareDns.listRecords({
        zoneId,
      });
      expect(remaining.result?.some((item) => item.name === hostname)).toBe(
        false,
      );
    }).pipe(Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter))),
  {
    tags: [
      "provider:aws",
      "provider:aws:apigatewayv2",
      "provider:cloudflare",
      "live",
    ],
    timeout: 120_000,
  },
);

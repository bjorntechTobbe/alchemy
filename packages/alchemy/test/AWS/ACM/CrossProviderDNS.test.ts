import * as AWS from "@/AWS";
import { Certificate } from "@/AWS/ACM/Certificate";
import { CertificateValidation } from "@/AWS/ACM/CertificateValidation";
import { selectAcmValidationRecord } from "@/AWS/ACM/DnsValidation";
import * as Command from "@/Command/Command";
import type { ScopedPlanStatusSession } from "@/Report";
import { cloudflareDnsAdapter } from "@/Cloudflare/DNS/Adapter";
import * as Cloudflare from "@/Cloudflare";
import * as DNS from "@/DNS";
import * as Output from "@/Output";
import * as Test from "@/Test/Alchemy";
import { Region as AwsRegion } from "@distilled.cloud/aws/Region";
import * as acm from "@distilled.cloud/aws/acm";
import * as dns from "@distilled.cloud/cloudflare/dns";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as Clock from "effect/Clock";

const hasCredentials =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.CLOUDFLARE_API_TOKEN &&
  !!process.env.DOMAIN &&
  !!process.env.CLOUDFLARE_ACCOUNT_ID;

const { test } = Test.make({
  providers: Layer.mergeAll(AWS.providers(), Cloudflare.providers()),
});

const baseDomain = process.env.DOMAIN?.replace(/\.$/, "") ?? "";
const hostname = `alchemy-cross-provider-aws-test.${baseDomain}`;

const withUsEast1 = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(AwsRegion, Effect.succeed("us-east-1")));

const listOwnedRecords = (zoneId: string) =>
  dns.listRecords.items({ zoneId }).pipe(
    Stream.runCollect,
    Effect.map((records) =>
      Array.from(records).filter((record) => record.name?.includes(hostname)),
    ),
  );

const describeCertificate = (certificateArn: string) =>
  withUsEast1(acm.describeCertificate({ CertificateArn: certificateArn }));

const canonicalDns = (value: string): string =>
  value.trim().toLowerCase().replace(/\.$/, "");

const commandSession = {
  note: () => Effect.void,
} as unknown as ScopedPlanStatusSession;

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const dig = (name: string, type: string, nameserver: string) =>
  Effect.gen(function* () {
    const executor = yield* Command.CommandExecutor;
    const startedAt = yield* Clock.currentTimeMillis;
    const result = yield* executor
      .run(
        {
          command: `dig +time=3 +tries=1 @${shellQuote(nameserver)} ${type} ${shellQuote(name)}`,
          shell: true,
          timeout: "4 seconds",
        },
        commandSession,
      )
      .pipe(Effect.result);
    const finishedAt = yield* Clock.currentTimeMillis;
    if (Result.isFailure(result)) {
      const error = result.failure;
      return {
        startedAt,
        finishedAt,
        nameserver,
        name,
        type,
        exitCode:
          error.reason._tag === "UnexpectedExit"
            ? error.reason.exitCode
            : undefined,
        status: "command-error" as const,
        classification:
          error.reason._tag === "CommandTimedOut"
            ? ("timeout" as const)
            : (`command-error:${error.reason._tag}` as const),
        dnsStatus: undefined,
        answers: [],
        stdout: "",
        stderr: error.message,
        ready: false,
      };
    }
    const dnsStatus =
      result.success.stdout.match(/status:\s*([A-Z]+)/)?.[1] ?? "NO_HEADER";
    const answers = result.success.stdout
      .split("\n")
      .filter((line) => new RegExp(`\\s${type}\\s`).test(line))
      .map((line) => line.trim().split(/\s+/).at(-1))
      .filter((answer): answer is string => answer !== undefined)
      .map(canonicalDns);
    return {
      startedAt,
      finishedAt,
      nameserver,
      name,
      type,
      exitCode: result.success.exitCode,
      status: "completed" as const,
      classification:
        dnsStatus === "NXDOMAIN"
          ? ("NXDOMAIN" as const)
          : dnsStatus === "NOERROR" && answers.length === 0
            ? ("NOERROR/NODATA" as const)
            : dnsStatus,
      dnsStatus,
      answers,
      stdout: result.success.stdout,
      stderr: result.success.stderr,
      ready: dnsStatus === "NOERROR" && answers.length > 0,
    };
  }).pipe(Effect.provide(Command.CommandExecutorLive()));

const authoritativeCname = (name: string, nameserver: string) =>
  dig(name, "CNAME", nameserver);

const authoritativeNameservers = (zoneName: string) =>
  dig(zoneName, "NS", "1.1.1.1");

const discoverZone = DNS.bind(Cloudflare.DNS.dns(), hostname).pipe(
  Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
);

test.provider.skipIf(!hasCredentials)(
  "issues an ACM certificate through Cloudflare DNS and cleans both providers",
  (stack) =>
    Effect.gen(function* () {
      yield* stack.destroy();

      // Zone selection is owned by the Cloudflare DNS component. The identity
      // is used here only for collision checks and post-deploy verification.
      const discovered = yield* discoverZone;
      const zoneId = discovered.zone.identity.id;
      const zoneName = discovered.zone.identity.name;
      if (typeof zoneId !== "string") {
        return yield* Effect.fail(
          new Error("Cloudflare DNS selector returned a deferred zone id"),
        );
      }
      if (typeof zoneName !== "string") {
        return yield* Effect.fail(
          new Error("Cloudflare DNS selector returned a deferred zone name"),
        );
      }

      const existing = yield* listOwnedRecords(zoneId);
      expect(existing).toHaveLength(0);

      let certificateArn: Output.Output<string> | undefined;
      const program = (includeValidation: boolean) =>
        Effect.gen(function* () {
          const boundZone = yield* DNS.bind(Cloudflare.DNS.dns(), hostname);
          const certificate = yield* Certificate("CrossProviderCertificate", {
            domainName: hostname,
            validation: "external",
          });
          certificateArn = certificate.certificateArn;

          const validationOption = Output.map(
            certificate.domainValidationOptions,
            (options) => selectAcmValidationRecord(options, hostname),
          );
          const record = yield* boundZone.record({
            id: "CrossProviderValidationRecord",
            name: Output.map(validationOption, (option) => option.Name),
            type: "CNAME",
            values: [Output.map(validationOption, (option) => option.Value)],
            ttl: 60,
          });
          const validation = includeValidation
            ? yield* CertificateValidation(
                "CrossProviderCertificateValidation",
                {
                  certificateArn: certificate.certificateArn,
                  validationRecordFqdns: Output.all(record.recordName).as<
                    string[]
                  >(),
                },
              )
            : undefined;
          return { certificate, record, validation };
        });

      const run = Effect.gen(function* () {
        const deployed = yield* stack.deploy(
          program(false).pipe(
            Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          ),
        );
        const records = yield* listOwnedRecords(zoneId);
        expect(records.length).toBeGreaterThan(0);
        const validation = selectAcmValidationRecord(
          deployed.certificate.domainValidationOptions,
          hostname,
        );
        const expectedName = canonicalDns(validation.Name);
        const expectedValue = canonicalDns(validation.Value);
        const cloudflareRecord = records.find(
          (record) => canonicalDns(record.name ?? "") === expectedName,
        );
        expect(cloudflareRecord).toBeDefined();
        expect(cloudflareRecord?.type).toBe("CNAME");
        expect(canonicalDns(String(cloudflareRecord?.content))).toBe(
          expectedValue,
        );
        expect(cloudflareRecord?.proxied).toBe(false);
        expect(cloudflareRecord?.ttl).toBe(60);

        const publication = yield* Effect.gen(function* () {
          const nsProbe = yield* authoritativeNameservers(zoneName);
          const nameservers = nsProbe.answers;
          const cnameProbes = yield* Effect.forEach(
            nameservers,
            (nameserver) => authoritativeCname(expectedName, nameserver),
            { concurrency: "unbounded" },
          );
          const authoritativeValues = cnameProbes.flatMap(
            (probe) => probe.answers,
          );
          const probe = {
            validationRecord: {
              name: expectedName,
              type: validation.Type,
              value: expectedValue,
            },
            cloudflareRecord: {
              name: canonicalDns(cloudflareRecord!.name ?? ""),
              type: cloudflareRecord!.type,
              content: canonicalDns(String(cloudflareRecord!.content)),
              proxied: cloudflareRecord!.proxied,
              ttl: cloudflareRecord!.ttl,
            },
            nameserverProbe: nsProbe,
            cnameProbes,
            authoritativeValues,
            ready: authoritativeValues.includes(expectedValue),
          };
          yield* Effect.logInfo(JSON.stringify(probe));
          return probe;
        }).pipe(
          Effect.repeat({
            schedule: Schedule.fixed("5 seconds"),
            until: (probe) => probe.ready,
            times: 4,
          }),
        );
        expect(publication.ready).toBe(true);

        const issued = yield* describeCertificate(
          deployed.certificate.certificateArn,
        ).pipe(
          Effect.flatMap((response) =>
            response.Certificate?.Status === "ISSUED"
              ? Effect.succeed(response.Certificate)
              : Effect.fail(new Error("ACM certificate is pending validation")),
          ),
          Effect.retry({
            while: (error) =>
              error instanceof Error &&
              error.message === "ACM certificate is pending validation",
            schedule: Schedule.fixed("10 seconds"),
            times: 3,
          }),
        );
        expect(issued.Status).toBe("ISSUED");

        const validated = yield* stack.deploy(
          program(true).pipe(
            Effect.provide(DNS.adapterLayer(cloudflareDnsAdapter)),
          ),
        );
        expect(validated.validation?.status).toBe("ISSUED");
      });

      yield* run.pipe(Effect.ensuring(Effect.ignore(stack.destroy())));

      const afterDestroy = yield* listOwnedRecords(zoneId);
      expect(afterDestroy).toHaveLength(0);
      if (certificateArn) {
        const resolvedCertificateArn = yield* Output.evaluate(
          certificateArn,
          {},
        );
        const certificate = yield* describeCertificate(
          resolvedCertificateArn,
        ).pipe(Effect.result);
        expect(certificate._tag).toBe("Failure");
      }
    }),
  {
    tags: [
      "provider:aws",
      "provider:aws:acm",
      "provider:cloudflare",
      "provider:cloudflare:dns",
      "live",
    ],
    timeout: 120_000,
    retry: 0,
  },
);

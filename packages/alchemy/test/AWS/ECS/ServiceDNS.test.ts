import { Service } from "@/AWS/ECS/Service.ts";
import { AWSEnvironment } from "@/AWS/Environment.ts";
import {
  cloudflareDnsAdapter,
  cloudflareZone,
} from "@/Cloudflare/DNS/Adapter.ts";
import { gcpDnsAdapter, gcpZone } from "@/GCP/DNS/Adapter.ts";
import { hetznerDnsAdapter, hetznerZone } from "@/Hetzner/Adapter.ts";
import { adapterLayer } from "@/DNS";
import * as Output from "@/Output";
import * as Stack from "@/Stack";
import { inMemoryState } from "@/State";
import { Stage } from "@/Stage";
import * as Test from "@/Test/Alchemy";
import { route53DnsAdapter, route53Zone } from "@/AWS/Route53/Adapter.ts";
import { zoneSelector } from "@/DNS/Contract.ts";
import { expect, describe } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const { test } = Test.make({ providers: Layer.empty });

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "ecs-service-dns",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((compiled: Stack.CompiledStack<any>) => compiled.resources),
    ),
  ).pipe(
    Effect.provideService(Stage, "test"),
    Effect.provideService(
      AWSEnvironment,
      Effect.succeed({
        accountId: "123456789012",
        region: "us-west-2",
        credentials: Effect.die("not used in composition") as any,
      }),
    ),
  );

const base = {
  cluster: "arn:aws:ecs:us-west-2:123456789012:cluster/test" as any,
  task: {
    taskDefinitionArn:
      "arn:aws:ecs:us-west-2:123456789012:task-definition/test:1",
    containerName: "web",
    port: 8080,
  },
  vpcId: "vpc-test",
  subnets: ["subnet-a", "subnet-b"],
  securityGroups: ["sg-test"],
};

const dnsRecords = (resources: Record<string, any>) =>
  Object.values(resources).filter(
    (resource: any) =>
      resource.Type === "Cloudflare.DNS.Record" ||
      resource.Type === "AWS.Route53.Record" ||
      resource.Type === "GCP.DNS.ResourceRecordSet" ||
      resource.Type === "Hetzner.RecordSet",
  );

const outputSources = (value: unknown, seen = new Set<unknown>()): string[] => {
  if (value === null || value === undefined || seen.has(value)) return [];
  if (typeof value !== "object" && typeof value !== "function") return [];
  seen.add(value);
  const source = (value as any).src?.FQN;
  return [
    ...(typeof source === "string" ? [source] : []),
    ...Object.values(value as Record<string, unknown>).flatMap((item) =>
      outputSources(item, seen),
    ),
  ];
};

const resourceOf = (resources: Record<string, any>, type: string) => {
  const entry = Object.entries(resources).find(
    ([, resource]) => resource.Type === type,
  );
  expect(entry, `missing ${type}`).toBeDefined();
  return entry![1];
};

const listenerOf = (resources: Record<string, any>) =>
  resourceOf(resources, "AWS.ELBv2.Listener");

describe(
  "AWS.ECS.Service generic DNS composition",
  { tags: ["unit", "local"] },
  () => {
    test(
      "composes hostname targets for Cloudflare, GCP, and Hetzner subdomains",
      Effect.forEach(
        [
          ["route53", route53Zone("Z123", "example.com"), route53DnsAdapter],
          [
            "cloudflare",
            cloudflareZone("cf-zone", "example.com"),
            cloudflareDnsAdapter,
          ],
          ["gcp", gcpZone("gcp-zone", "example.com"), gcpDnsAdapter],
          ["hetzner", hetznerZone(42, "example.com"), hetznerDnsAdapter],
        ] as const,
        ([name, zone, adapter]) =>
          compile(
            Effect.gen(function* () {
              yield* Service(name, {
                ...base,
                loadBalancer: {
                  domain: {
                    name: `${name}.example.com`,
                    aliases: [`www.${name}.example.com`],
                    cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                    dns: zone,
                  },
                },
              });
            }),
          ).pipe(
            Effect.provide(adapterLayer(adapter)),
            Effect.map((resources) => {
              const records = dnsRecords(resources);
              const loadBalancerEntry = Object.entries(resources).find(
                ([, resource]) => resource.Type === "AWS.ELBv2.LoadBalancer",
              );
              expect(loadBalancerEntry).toBeDefined();
              const loadBalancerKey = loadBalancerEntry![0];
              expect(records).toHaveLength(2);
              for (const record of records) {
                expect(Output.isOutput(record.Props.name)).toBe(true);
                expect(record.Props.type).toBe(
                  record.Type === "AWS.Route53.Record" ? "A" : "CNAME",
                );
                const target =
                  record.Type === "AWS.Route53.Record"
                    ? record.Props.aliasTarget
                    : record.Type === "Cloudflare.DNS.Record"
                      ? { value: record.Props.content }
                      : record.Type === "GCP.DNS.ResourceRecordSet"
                        ? { value: record.Props.rrdatas[0] }
                        : { value: record.Props.records[0].value };
                expect(
                  outputSources(target.dnsName ?? target.value).some((source) =>
                    source.endsWith(loadBalancerKey),
                  ),
                ).toBe(true);
                if (record.Type === "AWS.Route53.Record") {
                  expect(
                    outputSources(target.hostedZoneId).some((source) =>
                      source.endsWith("/LoadBalancer"),
                    ),
                  ).toBe(true);
                  expect(record.Props.hostedZoneId).toBe("Z123");
                } else if (record.Type === "Cloudflare.DNS.Record") {
                  expect(record.Props.zoneId).toBe("cf-zone");
                } else if (record.Type === "GCP.DNS.ResourceRecordSet") {
                  expect(record.Props.managedZone).toBe("gcp-zone");
                } else {
                  expect(record.Props.zone.zoneId).toBe(42);
                }
              }
            }),
          ),
        { concurrency: 1 },
      ),
    );

    test(
      "creates external ACM validation before explicit DNS application targets",
      compile(
        Effect.gen(function* () {
          yield* Service("ExternalCertificate", {
            ...base,
            loadBalancer: {
              domain: {
                name: "api.example.com",
                aliases: ["www.example.com"],
                dns: cloudflareZone("cf-zone", "example.com"),
              },
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.map((resources) => {
          const validation =
            resources["ExternalCertificate/CertificateValidation"];
          const certificate = resources["ExternalCertificate/Certificate"];
          const listener = listenerOf(resources);
          const applicationRecords = Object.values(resources).filter(
            (resource: any) => resource.Type === "Cloudflare.DNS.Record",
          );
          expect(validation).toBeDefined();
          expect(certificate.Props.subjectAlternativeNames).toEqual([
            "www.example.com",
          ]);
          expect(Output.isOutput(validation.Props.validationRecordFqdns)).toBe(
            true,
          );
          expect(applicationRecords).toHaveLength(4);

          const validationRecordSources = outputSources(
            validation.Props.validationRecordFqdns,
          ).filter((source) => source.includes("CertificateRecord"));
          expect(validationRecordSources).toHaveLength(2);
          for (const source of validationRecordSources) {
            const record = Object.entries(resources).find(
              ([key]) => source === key || source.endsWith(`/${key}`),
            )?.[1] as any;
            expect(record).toBeDefined();
            expect(record.Type).toBe("Cloudflare.DNS.Record");
            expect(record.Props.type).toBe("CNAME");
          }
          const listenerCertificateSources = outputSources(
            listener.Props.certificateArn,
          );
          expect(listenerCertificateSources).toContain(
            "ExternalCertificate/CertificateValidation",
          );
        }),
      ),
    );

    test(
      "resolves a provider DNS selector once and persists only its zone identity",
      Effect.gen(function* () {
        let resolutions = 0;
        const discovered = zoneSelector("cloudflare", (hostname) =>
          Effect.sync(() => {
            resolutions += 1;
            expect(hostname).toBe("api.example.com");
            return cloudflareZone("cf-discovered", "example.com");
          }),
        );
        const resources = yield* compile(
          Effect.gen(function* () {
            yield* Service("DiscoveredDomain", {
              ...base,
              loadBalancer: {
                domain: {
                  name: "api.example.com",
                  aliases: ["www.example.com"],
                  cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                  dns: discovered,
                },
              },
            });
          }),
        ).pipe(Effect.provide(adapterLayer(cloudflareDnsAdapter)));

        expect(resolutions).toBe(1);
        const records = Object.values(resources).filter(
          (resource: any) => resource.Type === "Cloudflare.DNS.Record",
        );
        expect(records).toHaveLength(2);
        for (const record of records as any[]) {
          expect(record.Props.zoneId).toBe("cf-discovered");
          expect(record.Props.content).toBeDefined();
          expect(outputSources(record.Props.content)).toContain(
            "DiscoveredDomain/LoadBalancer",
          );
        }
        expect(JSON.stringify(resources)).not.toContain("resolve");
      }),
    );

    test(
      "manual DNS mode requires a supplied certificate and creates no DNS resources",
      compile(
        Effect.gen(function* () {
          yield* Service("ManualDomain", {
            ...base,
            loadBalancer: {
              domain: {
                name: "api.example.com",
                cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                dns: false,
              },
            },
          });
        }),
      ).pipe(
        Effect.map((resources) => {
          expect(dnsRecords(resources)).toHaveLength(0);
          expect(resources["ManualDomain/Certificate"]).toBeUndefined();
          expect(
            resources["ManualDomain/CertificateValidation"],
          ).toBeUndefined();
          expect(listenerOf(resources).Props.certificateArn).toBe(
            "arn:aws:acm:us-west-2:123:certificate/existing",
          );
        }),
      ),
    );

    test(
      "rejects hostname targets at the GCP and Hetzner zone apex",
      Effect.forEach(
        [
          gcpZone("gcp-zone", "example.com"),
          hetznerZone(42, "example.com"),
        ] as const,
        (zone) =>
          compile(
            Effect.gen(function* () {
              yield* Service("ApexDomain", {
                ...base,
                loadBalancer: {
                  domain: {
                    name: "example.com",
                    cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                    dns: zone,
                  },
                },
              });
            }),
          ).pipe(
            Effect.provide(adapterLayer(gcpDnsAdapter, hetznerDnsAdapter)),
            Effect.flip,
            Effect.map((error) => expect(String(error)).toContain("apex")),
          ),
        { concurrency: 1 },
      ),
    );

    test(
      "a service without a domain does not compose DNS resources",
      compile(
        Effect.gen(function* () {
          yield* Service("NoDomain", { ...base, loadBalancer: true });
        }),
      ).pipe(
        Effect.map((resources) =>
          expect(dnsRecords(resources)).toHaveLength(0),
        ),
      ),
    );

    test(
      "rejects DNS-disabled domains without a supplied certificate",
      compile(
        Effect.gen(function* () {
          yield* Service("MissingManualCertificate", {
            ...base,
            loadBalancer: {
              domain: { name: "api.example.com", dns: false },
            },
          });
        }),
      ).pipe(
        Effect.flip,
        Effect.map((error) =>
          expect(String(error)).toContain("requires `cert`"),
        ),
      ),
    );

    test(
      "rejects an alias outside a discovered provider zone",
      compile(
        Effect.gen(function* () {
          yield* Service("InvalidDiscoveredAlias", {
            ...base,
            loadBalancer: {
              domain: {
                name: "api.example.com",
                aliases: ["api.other.example"],
                cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                dns: zoneSelector("cloudflare", () =>
                  Effect.succeed(cloudflareZone("cf-zone", "example.com")),
                ),
              },
            },
          });
        }),
      ).pipe(
        Effect.provide(adapterLayer(cloudflareDnsAdapter)),
        Effect.flip,
        Effect.map((error) => expect(String(error)).toContain("outside")),
      ),
    );

    test(
      "reports a missing adapter for a discovered provider zone",
      compile(
        Effect.gen(function* () {
          yield* Service("MissingDiscoveredAdapter", {
            ...base,
            loadBalancer: {
              domain: {
                name: "api.example.com",
                cert: "arn:aws:acm:us-west-2:123:certificate/existing",
                dns: zoneSelector("cloudflare", () =>
                  Effect.succeed(cloudflareZone("cf-zone", "example.com")),
                ),
              },
            },
          });
        }),
      ).pipe(
        Effect.flip,
        Effect.map((error) =>
          expect(String(error)).toContain("No DNS resolver"),
        ),
      ),
    );

    test(
      "rejects shared listeners with a domain",
      Effect.gen(function* () {
        const error = yield* compile(
          Effect.gen(function* () {
            yield* Service("SharedDomain", {
              ...base,
              loadBalancer: {
                listener: { Type: "AWS.ELBv2.Listener" } as any,
                domain: {
                  name: "api.example.com",
                  dns: cloudflareZone("cf", "example.com"),
                },
              },
            });
          }),
        ).pipe(Effect.flip);
        expect(String(error)).toContain("domain");
      }),
    );
  },
);

import { CustomDomain } from "@/AWS/ApiGateway/CustomDomain";
import { Deployment } from "@/AWS/ApiGateway/Deployment";
import { RestApi } from "@/AWS/ApiGateway/RestApi";
import { Stage } from "@/AWS/ApiGateway/Stage";
import { AWSEnvironment } from "@/AWS/Environment";
import { cloudflareDnsAdapter, cloudflareZone } from "@/Cloudflare/DNS/Adapter";
import { adapterLayer } from "@/DNS";
import * as Stack from "@/Stack";
import { inMemoryState } from "@/State";
import { Stage as AlchemyStage } from "@/Stage";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Output from "@/Output";

const compile = <A>(program: Effect.Effect<A, any, any>) =>
  Effect.scoped(
    program.pipe(
      Stack.make({
        name: "apigateway-custom-domain-dns",
        providers: Layer.empty,
        state: inMemoryState(),
      } as any),
      Effect.map((stack: Stack.CompiledStack<A>) => stack.resources),
    ),
  ).pipe(
    Effect.provideService(AlchemyStage, "test"),
    Effect.provideService(
      AWSEnvironment,
      Effect.succeed({
        accountId: "123456789012",
        region: "us-west-2",
        credentials: Effect.die("not used in composition") as never,
      }),
    ),
  );

const { test } = Test.make({ providers: Layer.empty });
test(
  "REST custom domain composes Cloudflare CNAME and mapping dependencies",
  compile(
    Effect.gen(function* () {
      const api = yield* RestApi("Api", {
        endpointConfiguration: { types: ["REGIONAL"] },
      });
      const deployment = yield* Deployment("Deployment", { restApi: api });
      const stage = yield* Stage("Stage", {
        restApi: api,
        stageName: "test",
        deploymentId: deployment.deploymentId,
      });
      yield* CustomDomain("Custom", {
        domainName: "api.example.com",
        api,
        stage,
        dns: cloudflareZone("cf-zone", "example.com"),
      });
    }),
  ).pipe(
    Effect.provide(adapterLayer(cloudflareDnsAdapter)),
    Effect.map((resources) => {
      const records = Object.values(resources).filter(
        (resource: any) => resource.Type === "Cloudflare.DNS.Record",
      );
      expect(records).toHaveLength(2);
      expect(records.some((record: any) => record.Props.type === "CNAME")).toBe(
        true,
      );
      const domain = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS.ApiGateway.DomainName",
      ) as any;
      expect(domain.Props.securityPolicy).toBe("TLS_1_2");
      const validation = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS.ACM.CertificateValidation",
      ) as any;
      expect(Output.isOutput(domain.Props.regionalCertificateArn)).toBe(true);
      expect(
        Object.values(
          Output.upstream(domain.Props.regionalCertificateArn),
        ).some((resource: any) => resource === validation),
      ).toBe(true);
      expect(
        Object.values(resources).some(
          (resource: any) => resource.Type === "AWS.ApiGateway.BasePathMapping",
        ),
      ).toBe(true);
    }),
  ),
);

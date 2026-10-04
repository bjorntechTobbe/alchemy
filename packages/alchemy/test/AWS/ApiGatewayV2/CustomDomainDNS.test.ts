import { Api } from "@/AWS/ApiGatewayV2/Api";
import { CustomDomain } from "@/AWS/ApiGatewayV2/CustomDomain";
import { Stage } from "@/AWS/ApiGatewayV2/Stage";
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
        name: "apigateway-v2-custom-domain-dns",
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
  "v2 custom domain composes HTTP and WebSocket mappings",
  compile(
    Effect.gen(function* () {
      for (const protocolType of ["HTTP", "WEBSOCKET"] as const) {
        const api = yield* Api(`${protocolType}Api`, { protocolType });
        const stage = yield* Stage(`${protocolType}Stage`, {
          api,
          autoDeploy: true,
        });
        yield* CustomDomain(protocolType, {
          domainName: `${protocolType.toLowerCase()}.example.com`,
          api,
          stage,
          dns: cloudflareZone("cf-zone", "example.com"),
        });
      }
    }),
  ).pipe(
    Effect.provide(adapterLayer(cloudflareDnsAdapter)),
    Effect.map((resources) => {
      const records = Object.values(resources).filter(
        (resource: any) => resource.Type === "Cloudflare.DNS.Record",
      );
      expect(records).toHaveLength(4);
      expect(
        records.every((record: any) => record.Props.type === "CNAME"),
      ).toBe(true);
      const domains = Object.values(resources).filter(
        (resource: any) => resource.Type === "AWS.ApiGatewayV2.DomainName",
      ) as any[];
      const validations = Object.values(resources).filter(
        (resource: any) => resource.Type === "AWS.ACM.CertificateValidation",
      ) as any[];
      expect(domains).toHaveLength(2);
      for (const domain of domains) {
        const certificateArn =
          domain.Props.domainNameConfigurations[0].CertificateArn;
        expect(Output.isOutput(certificateArn)).toBe(true);
        expect(
          Object.values(Output.upstream(certificateArn)).some((resource: any) =>
            validations.includes(resource),
          ),
        ).toBe(true);
      }
    }),
  ),
);

import * as Effect from "effect/Effect";
import * as Output from "../../Output.ts";
import { DnsError } from "../../DNS/Contract.ts";
import type {
  DnsConstructionServices,
  DnsRecordHandle,
  ZoneLike,
  ZoneSelector,
} from "../../DNS/Contract.ts";
import { bind as bindDns } from "../../DNS/Contract.ts";
import { createAcmDnsValidation } from "../ACM/DnsValidation.ts";
import { Certificate } from "../ACM/Certificate.ts";
import type { Certificate as CertificateResource } from "../ACM/Certificate.ts";
import { AWSEnvironment } from "../Environment.ts";
import { ApiMapping } from "./ApiMapping.ts";
import type { Api } from "./Api.ts";
import { DomainName } from "./DomainName.ts";
import type { ApiGatewayV2Stage } from "./Stage.ts";

/** A DNS authority accepted by the API Gateway v2 custom-domain component. */
export type ApiGatewayV2Dns<R = DnsConstructionServices> =
  | ZoneLike
  | ZoneSelector<string, R>;

export interface CustomDomainProps<R = DnsConstructionServices> {
  /** The public hostname served by the API Gateway v2 custom domain. */
  domainName: string;
  /** HTTP or WebSocket API to expose through the custom domain. */
  api: Api;
  /** Deployed HTTP or WebSocket stage to map. */
  stage: ApiGatewayV2Stage;
  /** Existing regional ACM certificate. Required when `dns` is `false`. */
  certificateArn?: string;
  /** DNS authority for certificate validation and the application CNAME. */
  dns?: false | ApiGatewayV2Dns<R>;
  /** Optional base path. Omit to map the API at the root. */
  apiMappingKey?: string;
  /** Minimum TLS version served by the custom domain. */
  securityPolicy?: "TLS_1_0" | "TLS_1_2";
}

export interface CustomDomainResult {
  readonly domain: Effect.Success<ReturnType<typeof DomainName>>;
  readonly mapping: Effect.Success<ReturnType<typeof ApiMapping>>;
  readonly certificate?: CertificateResource;
  readonly dnsRecords: ReadonlyArray<DnsRecordHandle>;
}

/**
 * Compose an API Gateway v2 custom domain, API mapping, ACM DNS validation,
 * and the application hostname record.
 *
 * The same component supports HTTP and WebSocket APIs. Use `dns: false` with
 * an existing certificate when DNS is managed outside Alchemy.
 */
export const CustomDomain = <R = DnsConstructionServices>(
  id: string,
  props: CustomDomainProps<R>,
): Effect.Effect<CustomDomainResult, DnsError, DnsConstructionServices | R> =>
  Effect.gen(function* () {
    const needsCertificate = props.certificateArn === undefined;
    if (needsCertificate && (props.dns === undefined || props.dns === false)) {
      return yield* Effect.fail(
        new DnsError({
          reason: "unsupported",
          message:
            "AWS.ApiGatewayV2.CustomDomain requires a DNS authority when certificateArn is omitted.",
        }),
      );
    }
    const zone =
      props.dns !== undefined && props.dns !== false
        ? yield* "resolve" in props.dns
            ? bindDns(props.dns, props.domainName)
            : bindDns(props.dns)
        : undefined;
    const certificate = needsCertificate
      ? yield* Certificate(`${id}Certificate`, {
          domainName: props.domainName,
          validation: "external",
          region: (yield* AWSEnvironment.current).region,
        })
      : undefined;
    const validation =
      certificate && zone
        ? yield* createAcmDnsValidation({
            certificate,
            identifiers: [props.domainName],
            zone,
            idPrefix: `${id}Certificate`,
          })
        : undefined;
    const domain = yield* DomainName(`${id}Domain`, {
      domainName: props.domainName,
      domainNameConfigurations: [
        {
          CertificateArn:
            props.certificateArn ??
            Output.map(
              validation!.validation.certificateArn,
              (certificateArn) => certificateArn ?? "",
            ),
          EndpointType: "REGIONAL",
          SecurityPolicy: props.securityPolicy ?? "TLS_1_2",
        },
      ],
    });
    const mapping = yield* ApiMapping(`${id}Mapping`, {
      api: props.api,
      domainName: domain.domainName,
      stage: props.stage.stageName,
      apiMappingKey: props.apiMappingKey,
    });
    const target = Output.map(
      domain.domainNameConfigurations,
      (configurations) => configurations?.[0]?.ApiGatewayDomainName ?? "",
    );
    const targetHostedZoneId = Output.map(
      domain.domainNameConfigurations,
      (configurations) => configurations?.[0]?.HostedZoneId ?? "",
    );
    const applicationRecord = zone
      ? yield* zone.hostnameTarget({
          id: `${id}HostnameTarget`,
          name: props.domainName,
          target,
          targetMetadata: { aliasHostedZoneId: targetHostedZoneId },
        })
      : undefined;
    return {
      domain,
      mapping,
      certificate,
      dnsRecords: [
        ...(validation?.records ?? []),
        ...(applicationRecord === undefined ? [] : [applicationRecord]),
      ],
    };
  });

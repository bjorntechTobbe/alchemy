import * as acm from "@distilled.cloud/aws/acm";
import { expect, test } from "alchemy-test";
import * as Effect from "effect/Effect";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

const requestBody = (body: HttpBody.HttpBody): string => {
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (body._tag === "Raw") {
    return String(body.body);
  }
  throw new Error(`Unexpected request body: ${body._tag}`);
};

const captureRequest = (input: acm.RequestCertificateRequest) => {
  let encoded: Record<string, unknown> | undefined;
  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      encoded = JSON.parse(requestBody(request.body)) as Record<
        string,
        unknown
      >;
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ CertificateArn: "arn:example" }), {
          status: 200,
          headers: { "content-type": "application/x-amz-json-1.1" },
        }),
      );
    }),
  );

  return acm.requestCertificate(input).pipe(
    Effect.provideService(HttpClient.HttpClient, client),
    Effect.map(() => encoded),
  );
};

test(
  "ACM request omits optional empty SANs",
  () =>
    Effect.gen(function* () {
      const request = yield* captureRequest({
        DomainName: "example.com",
        SubjectAlternativeNames: undefined,
      });

      expect(request).toEqual({ DomainName: "example.com" });
      expect(request).not.toHaveProperty("SubjectAlternativeNames");
    }),
  { tags: ["unit", "provider:aws", "provider:aws:acm"] },
);

test(
  "ACM request preserves non-empty SANs",
  () =>
    Effect.gen(function* () {
      const request = yield* captureRequest({
        DomainName: "example.com",
        SubjectAlternativeNames: ["www.example.com", "api.example.com"],
      });

      expect(request?.SubjectAlternativeNames).toEqual([
        "www.example.com",
        "api.example.com",
      ]);
    }),
  { tags: ["unit", "provider:aws", "provider:aws:acm"] },
);

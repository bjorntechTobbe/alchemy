import * as acm from "@distilled.cloud/aws/acm";
import { expect, it } from "alchemy-test";
import {
  AcmValidationRecordSelectionError,
  selectAcmValidationRecord,
} from "@/AWS/ACM/DnsValidation.ts";

const option = (domain: string, record: Partial<acm.ResourceRecord> = {}) =>
  ({
    DomainName: domain,
    ResourceRecord: {
      Name: "_token.example.com.",
      Type: "CNAME",
      Value: "_value.acm.aws.",
      ...record,
    },
  }) as acm.DomainValidation;

it("normalizes and shares wildcard and base ACM validation records", () => {
  expect(
    selectAcmValidationRecord(
      [option("*.EXAMPLE.com."), option("example.com")],
      "example.com.",
    ),
  ).toEqual({
    Name: "_token.example.com",
    Type: "CNAME",
    Value: "_value.acm.aws",
  });
});

it("rejects missing, malformed, non-CNAME, and conflicting records", () => {
  expect(() => selectAcmValidationRecord([], "example.com")).toThrow(
    AcmValidationRecordSelectionError,
  );
  expect(() =>
    selectAcmValidationRecord(
      [option("example.com", { Type: "TXT" as "CNAME" })],
      "example.com",
    ),
  ).toThrow(AcmValidationRecordSelectionError);
  expect(() =>
    selectAcmValidationRecord(
      [
        option("example.com"),
        option("*.example.com", { Value: "_other.acm.aws" }),
      ],
      "example.com",
    ),
  ).toThrow(AcmValidationRecordSelectionError);
});

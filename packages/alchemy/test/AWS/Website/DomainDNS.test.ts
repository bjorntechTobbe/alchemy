import * as acm from "@distilled.cloud/aws/acm";
import { expect, it } from "alchemy-test";
import {
  AcmValidationRecordSelectionError,
  selectAcmValidationRecord,
} from "@/AWS/Website/DomainDNS.ts";

const option = (
  DomainName: string,
  record: Partial<acm.ResourceRecord> = {},
): acm.DomainValidation => ({
  DomainName,
  ResourceRecord: {
    Name: "_token.example.com",
    Type: "CNAME",
    Value: "_value.acm.aws",
    ...record,
  },
});

const record = (options: acm.DomainValidation[], name = "example.com") =>
  selectAcmValidationRecord(options, name);

it("selects a single CNAME and ignores unrelated SAN options", () => {
  expect(
    record([
      option("other.example.com", { Name: "_other.example.com" }),
      option("example.com"),
    ]),
  ).toEqual({
    Name: "_token.example.com",
    Type: "CNAME",
    Value: "_value.acm.aws",
  });
});

it("accepts equivalent apex and wildcard options in either order", () => {
  const options = [
    option("*.EXAMPLE.com.", {
      Name: "_TOKEN.Example.com.",
      Value: "_VALUE.acm.aws.",
    }),
    option("example.com", {
      Name: "_token.example.com",
      Value: "_value.acm.aws",
    }),
  ];
  expect(record(options, "*.example.com.")).toEqual(
    record([...options].reverse()),
  );
  expect(record(options)).toEqual({
    Name: "_token.example.com",
    Type: "CNAME",
    Value: "_value.acm.aws",
  });
});

it("rejects missing and malformed validation records", () => {
  expect(() => record([{ DomainName: "example.com" }])).toThrow(
    AcmValidationRecordSelectionError,
  );
  expect(() =>
    record([option("example.com", { Name: "", Value: "_value.acm.aws" })]),
  ).toThrow(AcmValidationRecordSelectionError);
  expect(() =>
    record([option("example.com", { Type: "TXT" as "CNAME" })]),
  ).toThrow(AcmValidationRecordSelectionError);
});

it("rejects conflicts in record name, type, and value", () => {
  for (const change of [
    { Name: "_other.example.com" },
    { Type: "TXT" as "CNAME" },
    { Value: "_other.acm.aws" },
  ]) {
    expect(() =>
      record([option("example.com"), option("*.example.com", change)]),
    ).toThrow(AcmValidationRecordSelectionError);
  }
});

it("rejects a missing requested option", () => {
  expect(() => record([option("other.example.com")])).toThrow(
    AcmValidationRecordSelectionError,
  );
});

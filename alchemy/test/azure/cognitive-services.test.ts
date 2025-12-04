import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CognitiveServices } from "../../src/azure/cognitive-services.ts";
import { Secret } from "../../src/secret.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertCognitiveServicesDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure AI", () => {
  describe("CognitiveServices", () => {
    test("create cognitive services account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-multi-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-multi`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-multi-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-multi", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices", // Multi-service
          sku: "S0",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.location).toBe("eastus");
        expect(cognitive.kind).toBe("CognitiveServices");
        expect(cognitive.sku).toBe("S0");
        expect(cognitive.endpoint).toContain("cognitiveservices.azure.com");
        expect(cognitive.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(cognitive.cognitiveServicesId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.CognitiveServices/accounts/${accountName}`,
          ),
        );
        expect(cognitive.type).toBe("azure::CognitiveServices");

        // Check that keys are returned as Secrets
        expect(Secret.unwrap(cognitive.primaryKey)).toBeTruthy();
        expect(Secret.unwrap(cognitive.secondaryKey)).toBeTruthy();
        expect(typeof Secret.unwrap(cognitive.primaryKey)).toBe("string");
        expect(typeof Secret.unwrap(cognitive.secondaryKey)).toBe("string");
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update cognitive services tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-update-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-update`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create
        cognitive = await CognitiveServices("cs-update", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          sku: "S0",
          tags: {
            version: "1.0",
          },
        });

        expect(cognitive.tags).toEqual({
          version: "1.0",
        });

        // Update tags
        cognitive = await CognitiveServices("cs-update", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          sku: "S0",
          tags: {
            version: "2.0",
            updated: "true",
          },
        });

        expect(cognitive.tags).toEqual({
          version: "2.0",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services with network restrictions", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-network-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-network`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-network-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-network", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          networkAcls: {
            defaultAction: "Deny",
            ipRules: ["203.0.113.0/24"],
          },
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.networkAcls?.defaultAction).toBe("Deny");
        expect(cognitive.networkAcls?.ipRules).toEqual(["203.0.113.0/24"]);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

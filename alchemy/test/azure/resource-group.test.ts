import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import { assertResourceGroupDoesNotExist } from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Resources", () => {
  describe("ResourceGroup", () => {
    test("create resource group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-create-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("test-create-rg", {
          name: resourceGroupName,
          location: "eastus",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(rg.name).toBe(resourceGroupName);
        expect(rg.location).toBe("eastus");
        expect(rg.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(rg.resourceGroupId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}`,
          ),
        );
        expect(rg.provisioningState).toBe("Succeeded");
        expect(rg.type).toBe("azure::ResourceGroup");
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update resource group tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-update-rg`;

      let rg: ResourceGroup;
      try {
        // Create resource group
        rg = await ResourceGroup("test-update-rg", {
          name: resourceGroupName,
          location: "eastus",
          tags: {
            environment: "test",
          },
        });

        expect(rg.tags).toEqual({
          environment: "test",
        });

        // Update tags
        rg = await ResourceGroup("test-update-rg", {
          name: resourceGroupName,
          location: "eastus",
          tags: {
            environment: "test",
            updated: "true",
          },
        });

        expect(rg.tags).toEqual({
          environment: "test",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("resource group with default name", async (scope) => {
      let rg: ResourceGroup | undefined;
      try {
        rg = await ResourceGroup("default-name-rg", {
          location: "eastus",
        });

        expect(rg.name).toBeTruthy();
        expect(rg.name).toContain(BRANCH_PREFIX);
        expect(rg.location).toBe("eastus");
      } finally {
        await destroy(scope);
        if (rg) {
          await assertResourceGroupDoesNotExist(rg.name);
        }
      }
    });
  });
});

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

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
          location: "westus2",
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
          location: "westus2",
          tags: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(rg.tags).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing resource group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-adopt-rg`;

      let rg: ResourceGroup;
      try {
        // First, create a resource group
        rg = await ResourceGroup("test-adopt-rg-initial", {
          name: resourceGroupName,
          location: "centralus",
          tags: {
            created: "manually",
          },
        });

        expect(rg.name).toBe(resourceGroupName);

        // Destroy the scope but keep the resource group (set delete: false)
        await ResourceGroup("test-adopt-rg-initial", {
          name: resourceGroupName,
          location: "centralus",
          delete: false,
        });
        await destroy(scope);

        // Verify resource group still exists
        const clients = await createAzureClients();
        const existing = await clients.resources.resourceGroups.get(
          resourceGroupName,
        );
        expect(existing.name).toBe(resourceGroupName);

        // Create new scope and adopt the existing resource group
        const adoptScope = await alchemy("adopt-test", {
          prefix: BRANCH_PREFIX,
        });

        const adoptedRg = await ResourceGroup("test-adopt-rg-adopted", {
          name: resourceGroupName,
          location: "centralus",
          adopt: true,
          tags: {
            created: "manually",
            adopted: "true",
          },
        });

        expect(adoptedRg.name).toBe(resourceGroupName);
        expect(adoptedRg.tags?.adopted).toBe("true");

        // Cleanup: delete the adopted resource group
        await destroy(adoptScope);
      } finally {
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("resource group with default name", async (scope) => {
      let rg: ResourceGroup;
      try {
        // Create resource group without specifying name
        // Should use createPhysicalName pattern: ${app}-${stage}-${id}
        rg = await ResourceGroup("default-name-rg", {
          location: "eastus2",
        });

        // Name should be auto-generated
        expect(rg.name).toBeTruthy();
        expect(rg.name).toContain(BRANCH_PREFIX);
        expect(rg.location).toBe("eastus2");
      } finally {
        await destroy(scope);
        if (rg) {
          await assertResourceGroupDoesNotExist(rg.name);
        }
      }
    });

    test("resource group name validation", async (scope) => {
      try {
        // Test invalid name (too long - over 90 characters)
        await expect(
          ResourceGroup("invalid-name-rg", {
            name: "a".repeat(91),
            location: "eastus",
          }),
        ).rejects.toThrow(/invalid.*1-90 characters/i);

        // Test invalid characters
        await expect(
          ResourceGroup("invalid-chars-rg", {
            name: "invalid@name!",
            location: "eastus",
          }),
        ).rejects.toThrow(/invalid.*alphanumeric/i);
      } finally {
        await destroy(scope);
      }
    });

    test("resource group without adopt fails on conflict", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-conflict-rg`;

      let rg: ResourceGroup;
      try {
        // Create first resource group
        rg = await ResourceGroup("test-conflict-rg-1", {
          name: resourceGroupName,
          location: "southcentralus",
        });

        expect(rg.name).toBe(resourceGroupName);

        // Try to create another with same name without adopt flag
        await expect(
          ResourceGroup("test-conflict-rg-2", {
            name: resourceGroupName,
            location: "southcentralus",
          }),
        ).rejects.toThrow(/already exists.*adopt: true/i);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves resource group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-preserve-rg`;

      try {
        // Create resource group with delete: false
        await ResourceGroup("test-preserve-rg", {
          name: resourceGroupName,
          location: "northcentralus",
          delete: false,
        });

        await destroy(scope);

        // Verify resource group still exists after scope destruction
        const clients = await createAzureClients();
        const existing = await clients.resources.resourceGroups.get(
          resourceGroupName,
        );
        expect(existing.name).toBe(resourceGroupName);

        // Cleanup: manually delete the preserved resource group
        const poller = await clients.resources.resourceGroups.beginDelete(
          resourceGroupName,
        );
        await poller.pollUntilDone();
      } finally {
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

/**
 * Assert that a resource group does not exist
 * Throws an error if the resource group still exists
 */
async function assertResourceGroupDoesNotExist(
  resourceGroupName: string,
): Promise<void> {
  const clients = await createAzureClients();

  try {
    const result = await clients.resources.resourceGroups.get(
      resourceGroupName,
    );

    // If we get here, the resource group exists when it shouldn't
    throw new Error(
      `Resource group "${resourceGroupName}" still exists after deletion: ${result.id}`,
    );
  } catch (error: any) {
    // We expect a 404 error, which means the resource group doesn't exist
    if (error?.statusCode === 404 || error?.code === "ResourceGroupNotFound") {
      // This is expected - resource group doesn't exist
      return;
    }

    // Any other error is unexpected
    throw new Error(
      `Unexpected error checking if resource group "${resourceGroupName}" exists: ${error?.message || error}`,
      { cause: error },
    );
  }
}

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Storage", () => {
  describe("StorageAccount", () => {
    test("create storage account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-create-rg`;
      const storageAccountName = `${BRANCH_PREFIX}sacreate`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("sa-create", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          accessTier: "Hot",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(storage.name).toBe(storageAccountName);
        expect(storage.location).toBe("eastus");
        expect(storage.resourceGroup).toBe(resourceGroupName);
        expect(storage.sku).toBe("Standard_LRS");
        expect(storage.accessTier).toBe("Hot");
        expect(storage.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(storage.storageAccountId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Storage/storageAccounts/${storageAccountName}`,
          ),
        );
        expect(storage.primaryBlobEndpoint).toBe(
          `https://${storageAccountName}.blob.core.windows.net/`,
        );
        expect(storage.primaryConnectionString).toBeDefined();
        expect(storage.primaryAccessKey).toBeDefined();
        expect(storage.secondaryAccessKey).toBeDefined();
        expect(storage.provisioningState).toBe("Succeeded");
        expect(storage.type).toBe("azure::StorageAccount");
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update storage account tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-update-rg`;
      const storageAccountName = `${BRANCH_PREFIX}saupdate`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-update-rg", {
          name: resourceGroupName,
          location: "westus2",
        });

        // Create storage account
        storage = await StorageAccount("sa-update", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          tags: {
            environment: "test",
          },
        });

        expect(storage.tags).toEqual({
          environment: "test",
        });

        // Update tags
        storage = await StorageAccount("sa-update", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          tags: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(storage.tags).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account with Resource Group object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-rgobj-rg`;
      const storageAccountName = `${BRANCH_PREFIX}sargobj`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-rgobj-rg", {
          name: resourceGroupName,
          location: "centralus",
        });

        storage = await StorageAccount("sa-rgobj", {
          name: storageAccountName,
          resourceGroup: rg, // Use object reference
          sku: "Standard_ZRS",
        });

        expect(storage.name).toBe(storageAccountName);
        expect(storage.location).toBe("centralus"); // Inherited from RG
        expect(storage.resourceGroup).toBe(resourceGroupName);
        expect(storage.sku).toBe("Standard_ZRS");
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account with Resource Group string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-rgstr-rg`;
      const storageAccountName = `${BRANCH_PREFIX}sargstr`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-rgstr-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        storage = await StorageAccount("sa-rgstr", {
          name: storageAccountName,
          resourceGroup: resourceGroupName, // Use string reference
          location: "eastus2", // Must specify location when using string
          sku: "Standard_LRS",
        });

        expect(storage.name).toBe(storageAccountName);
        expect(storage.location).toBe("eastus2");
        expect(storage.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing storage account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-adopt-rg`;
      const storageAccountName = `${BRANCH_PREFIX}saadopt`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-adopt-rg", {
          name: resourceGroupName,
          location: "westeurope",
        });

        // First, create a storage account
        storage = await StorageAccount("sa-adopt-initial", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          tags: {
            created: "manually",
          },
        });

        // Now adopt it with a different ID
        storage = await StorageAccount("sa-adopt-adopted", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          adopt: true,
          tags: {
            created: "manually",
            adopted: "true",
          },
        });

        expect(storage.name).toBe(storageAccountName);
        expect(storage.tags?.adopted).toBe("true");
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-validation-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("sa-validation-rg", {
          name: resourceGroupName,
          location: "northeurope",
        });

        // Test invalid name (too short)
        await expect(
          StorageAccount("sa-validation-short", {
            name: "ab",
            resourceGroup: rg,
            sku: "Standard_LRS",
          }),
        ).rejects.toThrow(/must be 3-24 characters/i);

        // Test invalid name (uppercase)
        await expect(
          StorageAccount("sa-validation-upper", {
            name: "InvalidName123",
            resourceGroup: rg,
            sku: "Standard_LRS",
          }),
        ).rejects.toThrow(/lowercase letters and numbers/i);

        // Test invalid name (special characters)
        await expect(
          StorageAccount("sa-validation-special", {
            name: "invalid-name",
            resourceGroup: rg,
            sku: "Standard_LRS",
          }),
        ).rejects.toThrow(/lowercase letters and numbers/i);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-defname-rg`;

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-defname-rg", {
          name: resourceGroupName,
          location: "uksouth",
        });

        storage = await StorageAccount("sa-defname", {
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Default name should be generated from scope
        expect(storage.name).toBeDefined();
        expect(storage.name.length).toBeGreaterThanOrEqual(3);
        expect(storage.name.length).toBeLessThanOrEqual(24);
        expect(storage.name).toMatch(/^[a-z0-9]+$/);
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storage.name,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account with geo-redundant SKU", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-grs-rg`;
      const storageAccountName = `${BRANCH_PREFIX}sagrs`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-grs-rg", {
          name: resourceGroupName,
          location: "southcentralus",
        });

        storage = await StorageAccount("sa-grs", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_GRS", // Geo-redundant storage
          accessTier: "Cool",
        });

        expect(storage.name).toBe(storageAccountName);
        expect(storage.sku).toBe("Standard_GRS");
        expect(storage.accessTier).toBe("Cool");
        expect(storage.secondaryConnectionString).toBeDefined();
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves storage account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-preserve-rg`;
      const storageAccountName = `${BRANCH_PREFIX}saprsv`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-preserve-rg", {
          name: resourceGroupName,
          location: "francecentral",
          delete: false, // Preserve resource group
        });

        storage = await StorageAccount("sa-preserve", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          delete: false, // Preserve storage account
        });

        expect(storage.name).toBe(storageAccountName);
      } finally {
        await destroy(scope);

        // Verify storage account still exists
        const clients = await createAzureClients();
        const result = await clients.storage.storageAccounts.getProperties(
          resourceGroupName,
          storageAccountName,
        );
        expect(result.name).toBe(storageAccountName);

        // Clean up manually
        await clients.storage.storageAccounts.delete(
          resourceGroupName,
          storageAccountName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });
});

/**
 * Helper function to verify a storage account doesn't exist
 */
async function assertStorageAccountDoesNotExist(
  resourceGroupName: string,
  storageAccountName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.storage.storageAccounts.getProperties(
      resourceGroupName,
      storageAccountName,
    );
    throw new Error(
      `Storage account ${storageAccountName} still exists in resource group ${resourceGroupName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      // Expected - storage account doesn't exist
      return;
    }
    throw error;
  }
}

/**
 * Helper function to verify a resource group doesn't exist
 */
async function assertResourceGroupDoesNotExist(resourceGroupName: string) {
  const clients = await createAzureClients();
  try {
    await clients.resources.resourceGroups.get(resourceGroupName);
    throw new Error(`Resource group ${resourceGroupName} still exists`);
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceGroupNotFound") {
      // Expected - resource group doesn't exist
      return;
    }
    throw error;
  }
}

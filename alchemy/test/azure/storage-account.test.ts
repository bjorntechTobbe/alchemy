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
          location: "eastus",
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

    test("storage account with ZRS replication", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-zrs-rg`;
      const storageAccountName = `${BRANCH_PREFIX}sazrs`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-zrs-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("sa-zrs", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_ZRS",
          accessTier: "Cool",
        });

        expect(storage.sku).toBe("Standard_ZRS");
        expect(storage.accessTier).toBe("Cool");
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("storage account with GRS replication", async (scope) => {
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
          location: "eastus",
        });

        storage = await StorageAccount("sa-grs", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_GRS",
        });

        expect(storage.sku).toBe("Standard_GRS");
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

    test("storage account with access tier", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sa-tier-rg`;
      const storageAccountName = `${BRANCH_PREFIX}satier`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("sa-tier-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("sa-tier", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          accessTier: "Cool",
        });

        expect(storage.accessTier).toBe("Cool");
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
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

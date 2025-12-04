import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { BlobContainer } from "../../src/azure/blob-container.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Storage", () => {
  describe("BlobContainer", () => {
    test("create blob container", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-create-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bccreate`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-create-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("bc-create-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        container = await BlobContainer("bc-create-container", {
          name: containerName,
          storageAccount: storage,
          publicAccess: "None",
          metadata: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(container.name).toBe(containerName);
        expect(container.storageAccount).toBe(storageAccountName);
        expect(container.resourceGroup).toBe(resourceGroupName);
        expect(container.publicAccess).toBe("None");
        expect(container.metadata).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(container.url).toBe(
          `https://${storageAccountName}.blob.core.windows.net/${containerName}`,
        );
        expect(container.type).toBe("azure::BlobContainer");
      } finally {
        await destroy(scope);
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update blob container metadata", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-update-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcupdate`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-update-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("bc-update-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create container
        container = await BlobContainer("bc-update-container", {
          name: containerName,
          storageAccount: storage,
          metadata: {
            environment: "test",
          },
        });

        expect(container.metadata).toEqual({
          environment: "test",
        });

        // Update metadata
        container = await BlobContainer("bc-update-container", {
          name: containerName,
          storageAccount: storage,
          metadata: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(container.metadata).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("blob container with public access", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-public-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcpublic`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-public-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-public-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("bc-public-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        container = await BlobContainer("bc-public-container", {
          name: containerName,
          storageAccount: storage,
          publicAccess: "Blob",
        });

        expect(container.publicAccess).toBe("Blob");
      } finally {
        await destroy(scope);
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("blob container with container-level access", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-container-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bccontainer`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-container-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-container-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("bc-container-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        container = await BlobContainer("bc-container-container", {
          name: containerName,
          storageAccount: storage,
          publicAccess: "Container",
        });

        expect(container.publicAccess).toBe("Container");
      } finally {
        await destroy(scope);
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
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
 * Helper function to verify a blob container doesn't exist
 */
async function assertBlobContainerDoesNotExist(
  resourceGroupName: string,
  storageAccountName: string,
  containerName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.storage.blobContainers.get(
      resourceGroupName,
      storageAccountName,
      containerName,
    );
    throw new Error(
      `Blob container ${containerName} still exists in storage account ${storageAccountName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ContainerNotFound") {
      // Expected - container doesn't exist
      return;
    }
    throw error;
  }
}

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

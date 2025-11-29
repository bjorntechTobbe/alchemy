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
          location: "westus2",
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

    test("blob container with StorageAccount object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-saobj-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcsaobj`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-saobj-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-saobj-rg", {
          name: resourceGroupName,
          location: "centralus",
        });

        storage = await StorageAccount("bc-saobj-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_ZRS",
        });

        container = await BlobContainer("bc-saobj-container", {
          name: containerName,
          storageAccount: storage, // Use object reference
          publicAccess: "Blob",
        });

        expect(container.name).toBe(containerName);
        expect(container.storageAccount).toBe(storageAccountName);
        expect(container.resourceGroup).toBe(resourceGroupName);
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

    test("blob container with StorageAccount string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-sastr-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcsastr`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-sastr-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-sastr-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        storage = await StorageAccount("bc-sastr-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        container = await BlobContainer("bc-sastr-container", {
          name: containerName,
          storageAccount: storageAccountName, // Use string reference
          resourceGroup: resourceGroupName, // Must specify resource group
          publicAccess: "Container",
        });

        expect(container.name).toBe(containerName);
        expect(container.storageAccount).toBe(storageAccountName);
        expect(container.resourceGroup).toBe(resourceGroupName);
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

    test("adopt existing blob container", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-adopt-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcadopt`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-adopt-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-adopt-rg", {
          name: resourceGroupName,
          location: "westeurope",
        });

        storage = await StorageAccount("bc-adopt-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // First, create a blob container
        container = await BlobContainer("bc-adopt-initial", {
          name: containerName,
          storageAccount: storage,
          metadata: {
            created: "manually",
          },
        });

        // Now adopt it with a different ID
        container = await BlobContainer("bc-adopt-adopted", {
          name: containerName,
          storageAccount: storage,
          adopt: true,
          metadata: {
            created: "manually",
            adopted: "true",
          },
        });

        expect(container.name).toBe(containerName);
        expect(container.metadata?.adopted).toBe("true");
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

    test("blob container name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-validation-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcvalid`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("bc-validation-rg", {
          name: resourceGroupName,
          location: "northeurope",
        });

        storage = await StorageAccount("bc-validation-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Test invalid name (too short)
        await expect(
          BlobContainer("bc-validation-short", {
            name: "ab",
            storageAccount: storage,
          }),
        ).rejects.toThrow(/must be 3-63 characters/i);

        // Test invalid name (uppercase)
        await expect(
          BlobContainer("bc-validation-upper", {
            name: "InvalidName",
            storageAccount: storage,
          }),
        ).rejects.toThrow(/lowercase/i);

        // Test invalid name (starts with hyphen)
        await expect(
          BlobContainer("bc-validation-hyphen", {
            name: "-invalid",
            storageAccount: storage,
          }),
        ).rejects.toThrow(/cannot start or end with a hyphen/i);

        // Test invalid name (consecutive hyphens)
        await expect(
          BlobContainer("bc-validation-consecutive", {
            name: "invalid--name",
            storageAccount: storage,
          }),
        ).rejects.toThrow(/consecutive hyphens/i);
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("blob container with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-defname-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcdefname`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer | undefined;
      try {
        rg = await ResourceGroup("bc-defname-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("bc-defname-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create container with default name
        container = await BlobContainer("bc-defname-container", {
          storageAccount: storage,
        });

        // Default name should be generated from scope
        expect(container.name).toBeDefined();
        expect(container.name.length).toBeGreaterThanOrEqual(3);
        expect(container.name.length).toBeLessThanOrEqual(63);
        expect(container.name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      } finally {
        await destroy(scope);
        if (container) {
          await assertBlobContainerDoesNotExist(
            resourceGroupName,
            storageAccountName,
            container.name,
          );
        }
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("multiple containers in same storage account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-multi-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcmulti`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const container1Name = `${BRANCH_PREFIX}-bc-multi-container1`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");
      const container2Name = `${BRANCH_PREFIX}-bc-multi-container2`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container1: BlobContainer;
      let container2: BlobContainer;
      try {
        rg = await ResourceGroup("bc-multi-rg", {
          name: resourceGroupName,
          location: "francecentral",
        });

        storage = await StorageAccount("bc-multi-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create multiple containers
        container1 = await BlobContainer("bc-multi-container1", {
          name: container1Name,
          storageAccount: storage,
          publicAccess: "None",
          metadata: { purpose: "private-data" },
        });

        container2 = await BlobContainer("bc-multi-container2", {
          name: container2Name,
          storageAccount: storage,
          publicAccess: "Blob",
          metadata: { purpose: "public-assets" },
        });

        expect(container1.storageAccount).toBe(storageAccountName);
        expect(container2.storageAccount).toBe(storageAccountName);
        expect(container1.publicAccess).toBe("None");
        expect(container2.publicAccess).toBe("Blob");
      } finally {
        await destroy(scope);
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          container1Name,
        );
        await assertBlobContainerDoesNotExist(
          resourceGroupName,
          storageAccountName,
          container2Name,
        );
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves blob container", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-bc-preserve-rg`;
      const storageAccountName = `${BRANCH_PREFIX}bcprsv`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const containerName = `${BRANCH_PREFIX}-bc-preserve-container`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let container: BlobContainer;
      try {
        rg = await ResourceGroup("bc-preserve-rg", {
          name: resourceGroupName,
          location: "southafricanorth",
          delete: false,
        });

        storage = await StorageAccount("bc-preserve-sa", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
          delete: false,
        });

        container = await BlobContainer("bc-preserve-container", {
          name: containerName,
          storageAccount: storage,
          delete: false, // Preserve container
        });

        expect(container.name).toBe(containerName);
      } finally {
        await destroy(scope);

        // Verify container still exists
        const clients = await createAzureClients();
        const result = await clients.storage.blobContainers.get(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
        expect(result.name).toBe(containerName);

        // Clean up manually
        await clients.storage.blobContainers.delete(
          resourceGroupName,
          storageAccountName,
          containerName,
        );
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

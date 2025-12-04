import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { BlobContainer } from "../../src/azure/blob-container.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertBlobContainerDoesNotExist,
  assertStorageAccountDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

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
  });
});

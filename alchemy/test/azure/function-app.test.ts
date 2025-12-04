import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { FunctionApp } from "../../src/azure/function-app.ts";
import { UserAssignedIdentity } from "../../src/azure/user-assigned-identity.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertFunctionAppDoesNotExist,
  assertStorageAccountDoesNotExist,
  assertUserAssignedIdentityDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Compute", () => {
  describe("FunctionApp", () => {
    test("create function app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-create-rg`;
      const storageAccountName = `${BRANCH_PREFIX}fastorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        functionApp = await FunctionApp("fa-create", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          runtimeVersion: "20",
          functionsVersion: "~4",
          sku: "Y1",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(functionApp.name).toBe(functionAppName);
        expect(functionApp.location).toBe("eastus");
        expect(functionApp.resourceGroup).toBe(resourceGroupName);
        expect(functionApp.storageAccount).toBe(storageAccountName);
        expect(functionApp.runtime).toBe("node");
        expect(functionApp.runtimeVersion).toBe("20");
        expect(functionApp.functionsVersion).toBe("~4");
        expect(functionApp.sku).toBe("Y1");
        expect(functionApp.httpsOnly).toBe(true);
        expect(functionApp.alwaysOn).toBe(false);
        expect(functionApp.defaultHostname).toBe(
          `${functionAppName}.azurewebsites.net`,
        );
        expect(functionApp.url).toBe(
          `https://${functionAppName}.azurewebsites.net`,
        );
        expect(functionApp.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(functionApp.type).toBe("azure::FunctionApp");
      } finally {
        await destroy(scope);
        await assertFunctionAppDoesNotExist(resourceGroupName, functionAppName);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update function app tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-update-rg`;
      const storageAccountName = `${BRANCH_PREFIX}faupstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-up-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create function app
        functionApp = await FunctionApp("fa-update", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          tags: {
            environment: "test",
          },
        });

        expect(functionApp.tags).toEqual({
          environment: "test",
        });

        // Update tags
        functionApp = await FunctionApp("fa-update", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          tags: {
            environment: "test",
            version: "v2",
          },
        });

        expect(functionApp.tags).toEqual({
          environment: "test",
          version: "v2",
        });
      } finally {
        await destroy(scope);
        await assertFunctionAppDoesNotExist(resourceGroupName, functionAppName);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("function app with managed identity", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-identity-rg`;
      const storageAccountName = `${BRANCH_PREFIX}faidstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-identity`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      const identityName = `${BRANCH_PREFIX}-fa-identity`;

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let identity: UserAssignedIdentity;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-identity-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-id-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        identity = await UserAssignedIdentity("fa-identity", {
          name: identityName,
          resourceGroup: rg,
        });

        functionApp = await FunctionApp("fa-with-identity", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          identity: identity,
        });

        expect(functionApp.identity).toBeDefined();
        expect(functionApp.identity?.name).toBe(identityName);
        expect(functionApp.identity?.principalId).toBeDefined();
        expect(functionApp.identity?.clientId).toBeDefined();
      } finally {
        await destroy(scope);
        await assertFunctionAppDoesNotExist(resourceGroupName, functionAppName);
        await assertUserAssignedIdentityDoesNotExist(
          resourceGroupName,
          identityName,
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

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { FunctionApp } from "../../src/azure/function-app.ts";
import { UserAssignedIdentity } from "../../src/azure/user-assigned-identity.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

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

    test("function app with app settings", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-settings-rg`;
      const storageAccountName = `${BRANCH_PREFIX}fasetstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-settings`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-settings-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-set-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        functionApp = await FunctionApp("fa-with-settings", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          appSettings: {
            NODE_ENV: "production",
            API_KEY: alchemy.secret("test-api-key-12345"),
            CUSTOM_SETTING: "value",
          },
        });

        expect(functionApp.appSettings).toBeDefined();
        expect(functionApp.appSettings?.NODE_ENV).toBe("production");
        expect(functionApp.appSettings?.CUSTOM_SETTING).toBe("value");
        // Secret values should be wrapped
        expect(functionApp.appSettings?.API_KEY).toBeDefined();
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

    test("function app with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-obj-rg`;
      const storageAccountName = `${BRANCH_PREFIX}faobjstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-obj`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-obj-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-obj-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Pass ResourceGroup object
        functionApp = await FunctionApp("fa-obj", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "python",
          runtimeVersion: "3.11",
        });

        expect(functionApp.resourceGroup).toBe(resourceGroupName);
        expect(functionApp.location).toBe("eastus");
        expect(functionApp.runtime).toBe("python");
        expect(functionApp.runtimeVersion).toBe("3.11");
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

    test("function app with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-str-rg`;
      const storageAccountName = `${BRANCH_PREFIX}fastrstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-str`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-str-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-str-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Pass ResourceGroup as string
        functionApp = await FunctionApp("fa-str", {
          name: functionAppName,
          resourceGroup: resourceGroupName,
          location: "eastus",
          storageAccount: storage,
          runtime: "node",
        });

        expect(functionApp.resourceGroup).toBe(resourceGroupName);
        expect(functionApp.location).toBe("eastus");
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

    test("adopt existing function app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-adopt-rg`;
      const storageAccountName = `${BRANCH_PREFIX}faadoptstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-adopt`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-adopt-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create function app
        functionApp = await FunctionApp("fa-adopt-first", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          tags: {
            version: "v1",
          },
        });

        expect(functionApp.tags).toEqual({
          version: "v1",
        });

        // Try to create again without adopt flag - should fail
        await expect(async () => {
          await FunctionApp("fa-adopt-conflict", {
            name: functionAppName,
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(/already exists/i);

        // Adopt existing function app
        functionApp = await FunctionApp("fa-adopt-second", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          adopt: true,
          tags: {
            version: "v2",
            adopted: "true",
          },
        });

        expect(functionApp.name).toBe(functionAppName);
        expect(functionApp.tags).toEqual({
          version: "v2",
          adopted: "true",
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

    test("function app name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-validate-rg`;
      const storageAccountName = `${BRANCH_PREFIX}favalstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      try {
        rg = await ResourceGroup("fa-validate-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-val-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Test too short name (< 2 chars)
        await expect(async () => {
          await FunctionApp("fa-too-short", {
            name: "a",
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(/must be between 2 and 60 characters/i);

        // Test too long name (> 60 chars)
        await expect(async () => {
          await FunctionApp("fa-too-long", {
            name: "a".repeat(61),
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(/must be between 2 and 60 characters/i);

        // Test invalid characters (uppercase)
        await expect(async () => {
          await FunctionApp("fa-uppercase", {
            name: "MyFunctionApp",
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(
          /must contain only lowercase letters, numbers, and hyphens/i,
        );

        // Test starting with hyphen
        await expect(async () => {
          await FunctionApp("fa-start-hyphen", {
            name: "-invalid-name",
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(/cannot start or end with a hyphen/i);

        // Test ending with hyphen
        await expect(async () => {
          await FunctionApp("fa-end-hyphen", {
            name: "invalid-name-",
            resourceGroup: rg,
            storageAccount: storage,
            runtime: "node",
          });
        }).rejects.toThrow(/cannot start or end with a hyphen/i);
      } finally {
        await destroy(scope);
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("function app with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-default-rg`;
      const storageAccountName = `${BRANCH_PREFIX}fadefstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp | undefined;
      try {
        rg = await ResourceGroup("fa-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-def-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        // Create function app with default name (should use app-stage-id pattern)
        functionApp = await FunctionApp("fa-default-name", {
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
        });

        expect(functionApp.name).toBeTruthy();
        expect(functionApp.name).toMatch(/^[a-z0-9-]+$/);
        expect(functionApp.defaultHostname).toBe(
          `${functionApp.name}.azurewebsites.net`,
        );
      } finally {
        await destroy(scope);
        if (functionApp) {
          await assertFunctionAppDoesNotExist(
            resourceGroupName,
            functionApp.name,
          );
        }
        await assertStorageAccountDoesNotExist(
          resourceGroupName,
          storageAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves function app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-fa-preserve-rg`;
      const storageAccountName = `${BRANCH_PREFIX}fapresstorage`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 24);
      const functionAppName = `${BRANCH_PREFIX}-fa-preserve`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let storage: StorageAccount;
      let functionApp: FunctionApp;
      try {
        rg = await ResourceGroup("fa-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        storage = await StorageAccount("fa-pres-storage", {
          name: storageAccountName,
          resourceGroup: rg,
          sku: "Standard_LRS",
        });

        functionApp = await FunctionApp("fa-preserve", {
          name: functionAppName,
          resourceGroup: rg,
          storageAccount: storage,
          runtime: "node",
          delete: false,
        });

        expect(functionApp.name).toBe(functionAppName);
      } finally {
        await destroy(scope);

        // Function app should still exist after destroy
        await assertFunctionAppExists(resourceGroupName, functionAppName);

        // Manual cleanup
        const clients = await createAzureClients();
        await clients.appService.webApps.delete(
          resourceGroupName,
          functionAppName,
        );

        await assertFunctionAppDoesNotExist(resourceGroupName, functionAppName);
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
 * Assert that a function app does not exist
 */
async function assertFunctionAppDoesNotExist(
  resourceGroupName: string,
  functionAppName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.appService.webApps.get(resourceGroupName, functionAppName);
    throw new Error(
      `Function app ${functionAppName} should not exist but was found`,
    );
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a function app exists
 */
async function assertFunctionAppExists(
  resourceGroupName: string,
  functionAppName: string,
) {
  const clients = await createAzureClients();
  const functionApp = await clients.appService.webApps.get(
    resourceGroupName,
    functionAppName,
  );
  expect(functionApp).toBeDefined();
  expect(functionApp.name).toBe(functionAppName);
}

/**
 * Assert that a storage account does not exist
 */
async function assertStorageAccountDoesNotExist(
  resourceGroupName: string,
  accountName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.storage.storageAccounts.getProperties(
      resourceGroupName,
      accountName,
    );
    throw new Error(
      `Storage account ${accountName} should not exist but was found`,
    );
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a user-assigned identity does not exist
 */
async function assertUserAssignedIdentityDoesNotExist(
  resourceGroupName: string,
  identityName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.msi.userAssignedIdentities.get(
      resourceGroupName,
      identityName,
    );
    throw new Error(
      `User-assigned identity ${identityName} should not exist but was found`,
    );
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a resource group does not exist
 */
async function assertResourceGroupDoesNotExist(resourceGroupName: string) {
  const clients = await createAzureClients();
  const exists =
    await clients.resources.resourceGroups.checkExistence(resourceGroupName);
  expect(exists.body).toBe(false);
}

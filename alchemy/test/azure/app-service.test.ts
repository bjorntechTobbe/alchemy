import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { AppService } from "../../src/azure/app-service.ts";
import { UserAssignedIdentity } from "../../src/azure/user-assigned-identity.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Compute", () => {
  describe("AppService", () => {
    test("create app service", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-as-create-rg`;
      const appServiceName = `${BRANCH_PREFIX}-as-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let appService: AppService;
      try {
        rg = await ResourceGroup("as-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        appService = await AppService("as-create", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "node",
          runtimeVersion: "20",
          os: "linux",
          sku: "B1",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(appService.name).toBe(appServiceName);
        expect(appService.location).toBe("eastus");
        expect(appService.resourceGroup).toBe(resourceGroupName);
        expect(appService.runtime).toBe("node");
        expect(appService.runtimeVersion).toBe("20");
        expect(appService.os).toBe("linux");
        expect(appService.sku).toBe("B1");
        expect(appService.httpsOnly).toBe(true);
        expect(appService.alwaysOn).toBe(true);
        expect(appService.defaultHostname).toBe(
          `${appServiceName}.azurewebsites.net`,
        );
        expect(appService.url).toBe(
          `https://${appServiceName}.azurewebsites.net`,
        );
        expect(appService.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(appService.type).toBe("azure::AppService");
      } finally {
        await destroy(scope);
        await assertAppServiceDoesNotExist(resourceGroupName, appServiceName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update app service tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-as-update-rg`;
      const appServiceName = `${BRANCH_PREFIX}-as-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let appService: AppService;
      try {
        rg = await ResourceGroup("as-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create app service
        appService = await AppService("as-update", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "node",
          sku: "B1",
          tags: {
            environment: "test",
          },
        });

        expect(appService.tags).toEqual({
          environment: "test",
        });

        // Update tags
        appService = await AppService("as-update", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "node",
          sku: "B1",
          tags: {
            environment: "test",
            version: "v2",
          },
        });

        expect(appService.tags).toEqual({
          environment: "test",
          version: "v2",
        });
      } finally {
        await destroy(scope);
        await assertAppServiceDoesNotExist(resourceGroupName, appServiceName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("app service with managed identity", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-as-identity-rg`;
      const appServiceName = `${BRANCH_PREFIX}-as-identity`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      const identityName = `${BRANCH_PREFIX}-as-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;
      let appService: AppService;
      try {
        rg = await ResourceGroup("as-identity-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        identity = await UserAssignedIdentity("as-identity", {
          name: identityName,
          resourceGroup: rg,
        });

        appService = await AppService("as-with-identity", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "node",
          sku: "B1",
          identity: identity,
        });

        expect(appService.identity).toBeDefined();
        expect(appService.identity?.name).toBe(identityName);
        expect(appService.identity?.principalId).toBeDefined();
        expect(appService.identity?.clientId).toBeDefined();
      } finally {
        await destroy(scope);
        await assertAppServiceDoesNotExist(resourceGroupName, appServiceName);
        await assertUserAssignedIdentityDoesNotExist(
          resourceGroupName,
          identityName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("app service with app settings", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-as-settings-rg`;
      const appServiceName = `${BRANCH_PREFIX}-as-settings`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let appService: AppService;
      try {
        rg = await ResourceGroup("as-settings-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        appService = await AppService("as-with-settings", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "node",
          sku: "B1",
          appSettings: {
            NODE_ENV: "production",
            API_KEY: alchemy.secret("test-api-key-12345"),
            CUSTOM_SETTING: "value",
          },
        });

        expect(appService.appSettings).toBeDefined();
        expect(appService.appSettings?.NODE_ENV).toBe("production");
        expect(appService.appSettings?.CUSTOM_SETTING).toBe("value");
        // Secret values should be wrapped
        expect(appService.appSettings?.API_KEY).toBeDefined();
      } finally {
        await destroy(scope);
        await assertAppServiceDoesNotExist(resourceGroupName, appServiceName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("python app service", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-as-python-rg`;
      const appServiceName = `${BRANCH_PREFIX}-as-python`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let appService: AppService;
      try {
        rg = await ResourceGroup("as-python-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        appService = await AppService("as-python", {
          name: appServiceName,
          resourceGroup: rg,
          runtime: "python",
          runtimeVersion: "3.11",
          os: "linux",
          sku: "B1",
        });

        expect(appService.runtime).toBe("python");
        expect(appService.runtimeVersion).toBe("3.11");
        expect(appService.os).toBe("linux");
      } finally {
        await destroy(scope);
        await assertAppServiceDoesNotExist(resourceGroupName, appServiceName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

/**
 * Assert that an app service does not exist
 */
async function assertAppServiceDoesNotExist(
  resourceGroupName: string,
  appServiceName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.appService.webApps.get(resourceGroupName, appServiceName);
    throw new Error(
      `App service ${appServiceName} should not exist but was found`,
    );
  } catch (error: any) {
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
  } catch (error: any) {
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

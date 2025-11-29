import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StaticWebApp } from "../../src/azure/static-web-app.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Compute", () => {
  describe("StaticWebApp", () => {
    test("create static web app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-create-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-create-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        staticWebApp = await StaticWebApp("swa-create", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(staticWebApp.name).toBe(staticWebAppName);
        expect(staticWebApp.location).toBe("eastus2");
        expect(staticWebApp.resourceGroup).toBe(resourceGroupName);
        expect(staticWebApp.sku).toBe("Free");
        expect(staticWebApp.defaultHostname).toContain("azurestaticapps.net");
        expect(staticWebApp.url).toContain("https://");
        expect(staticWebApp.apiKey).toBeDefined();
        expect(staticWebApp.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(staticWebApp.type).toBe("azure::StaticWebApp");
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update static web app tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-update-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-update-rg", {
          name: resourceGroupName,
          location: "westus2",
        });

        // Create static web app
        staticWebApp = await StaticWebApp("swa-update", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          tags: {
            environment: "test",
          },
        });

        expect(staticWebApp.tags).toEqual({
          environment: "test",
        });

        // Update tags
        staticWebApp = await StaticWebApp("swa-update", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          tags: {
            environment: "test",
            version: "v2",
          },
        });

        expect(staticWebApp.tags).toEqual({
          environment: "test",
          version: "v2",
        });
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("static web app with app settings", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-settings-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-settings`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-settings-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        staticWebApp = await StaticWebApp("swa-with-settings", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          appSettings: {
            API_URL: "https://api.example.com",
            ENVIRONMENT: "production",
            SECRET_KEY: alchemy.secret("test-secret-12345"),
          },
        });

        expect(staticWebApp.appSettings).toBeDefined();
        expect(staticWebApp.appSettings?.API_URL).toBe(
          "https://api.example.com",
        );
        expect(staticWebApp.appSettings?.ENVIRONMENT).toBe("production");
        expect(staticWebApp.appSettings?.SECRET_KEY).toBeDefined();
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("static web app with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-obj-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-obj`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-obj-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Pass ResourceGroup object
        staticWebApp = await StaticWebApp("swa-obj", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
        });

        expect(staticWebApp.resourceGroup).toBe(resourceGroupName);
        expect(staticWebApp.location).toBe("eastus2");
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("static web app with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-str-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-str`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-str-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Pass ResourceGroup as string
        staticWebApp = await StaticWebApp("swa-str", {
          name: staticWebAppName,
          resourceGroup: resourceGroupName,
          location: "eastus2",
          sku: "Free",
        });

        expect(staticWebApp.resourceGroup).toBe(resourceGroupName);
        expect(staticWebApp.location).toBe("eastus2");
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing static web app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-adopt-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-adopt`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-adopt-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Create static web app
        staticWebApp = await StaticWebApp("swa-adopt-first", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          tags: {
            version: "v1",
          },
        });

        expect(staticWebApp.tags).toEqual({
          version: "v1",
        });

        // Try to create again without adopt flag - should fail
        await expect(async () => {
          await StaticWebApp("swa-adopt-conflict", {
            name: staticWebAppName,
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(/already exists/i);

        // Adopt existing static web app
        staticWebApp = await StaticWebApp("swa-adopt-second", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          adopt: true,
          tags: {
            version: "v2",
            adopted: "true",
          },
        });

        expect(staticWebApp.name).toBe(staticWebAppName);
        expect(staticWebApp.tags).toEqual({
          version: "v2",
          adopted: "true",
        });
      } finally {
        await destroy(scope);
        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("static web app name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-validate-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("swa-validate-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Test too short name (< 2 chars)
        await expect(async () => {
          await StaticWebApp("swa-too-short", {
            name: "a",
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(/must be between 2 and 60 characters/i);

        // Test too long name (> 60 chars)
        await expect(async () => {
          await StaticWebApp("swa-too-long", {
            name: "a".repeat(61),
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(/must be between 2 and 60 characters/i);

        // Test invalid characters (uppercase)
        await expect(async () => {
          await StaticWebApp("swa-uppercase", {
            name: "MyStaticWebApp",
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(
          /must contain only lowercase letters, numbers, and hyphens/i,
        );

        // Test starting with hyphen
        await expect(async () => {
          await StaticWebApp("swa-start-hyphen", {
            name: "-invalid-name",
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(/cannot start or end with a hyphen/i);

        // Test ending with hyphen
        await expect(async () => {
          await StaticWebApp("swa-end-hyphen", {
            name: "invalid-name-",
            resourceGroup: rg,
            sku: "Free",
          });
        }).rejects.toThrow(/cannot start or end with a hyphen/i);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("static web app with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-default-rg`;

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp | undefined;
      try {
        rg = await ResourceGroup("swa-default-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Create static web app with default name
        staticWebApp = await StaticWebApp("swa-default-name", {
          resourceGroup: rg,
          sku: "Free",
        });

        expect(staticWebApp.name).toBeTruthy();
        expect(staticWebApp.name).toMatch(/^[a-z0-9-]+$/);
        expect(staticWebApp.defaultHostname).toContain("azurestaticapps.net");
      } finally {
        await destroy(scope);
        if (staticWebApp) {
          await assertStaticWebAppDoesNotExist(
            resourceGroupName,
            staticWebApp.name,
          );
        }
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves static web app", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-swa-preserve-rg`;
      const staticWebAppName = `${BRANCH_PREFIX}-swa-preserve`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let staticWebApp: StaticWebApp;
      try {
        rg = await ResourceGroup("swa-preserve-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        staticWebApp = await StaticWebApp("swa-preserve", {
          name: staticWebAppName,
          resourceGroup: rg,
          sku: "Free",
          delete: false,
        });

        expect(staticWebApp.name).toBe(staticWebAppName);
      } finally {
        await destroy(scope);

        // Static web app should still exist after destroy
        await assertStaticWebAppExists(resourceGroupName, staticWebAppName);

        // Manual cleanup
        const clients = await createAzureClients();
        await clients.appService.staticSites.beginDeleteStaticSiteAndWait(
          resourceGroupName,
          staticWebAppName,
        );

        await assertStaticWebAppDoesNotExist(
          resourceGroupName,
          staticWebAppName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

/**
 * Assert that a static web app does not exist
 */
async function assertStaticWebAppDoesNotExist(
  resourceGroupName: string,
  staticWebAppName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.appService.staticSites.getStaticSite(
      resourceGroupName,
      staticWebAppName,
    );
    throw new Error(
      `Static web app ${staticWebAppName} should not exist but was found`,
    );
  } catch (error: any) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a static web app exists
 */
async function assertStaticWebAppExists(
  resourceGroupName: string,
  staticWebAppName: string,
) {
  const clients = await createAzureClients();
  const staticWebApp = await clients.appService.staticSites.getStaticSite(
    resourceGroupName,
    staticWebAppName,
  );
  expect(staticWebApp).toBeDefined();
  expect(staticWebApp.name).toBe(staticWebAppName);
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

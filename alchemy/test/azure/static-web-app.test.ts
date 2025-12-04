import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StaticWebApp } from "../../src/azure/static-web-app.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertStaticWebAppDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

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
          location: "eastus2", // Static Web Apps not available in eastus
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
          location: "eastus2", // Static Web Apps not available in eastus
        });

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
          location: "eastus2", // Static Web Apps not available in eastus
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
  });
});

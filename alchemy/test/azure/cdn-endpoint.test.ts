import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CDNProfile } from "../../src/azure/cdn-profile.ts";
import { CDNEndpoint } from "../../src/azure/cdn-endpoint.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure CDN", () => {
  describe("CDNEndpoint", () => {
    test("create CDN endpoint with single origin", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-basic-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-basic-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-basic`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-basic-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-basic-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-basic", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "example-origin",
              hostName: "example.com",
            },
          ],
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(endpoint.name).toBe(endpointName);
        expect(endpoint.location).toBe("eastus");
        expect(endpoint.hostName).toBe(`${endpointName}.azureedge.net`);
        expect(endpoint.profile).toBe(profileName);
        expect(endpoint.origins).toHaveLength(1);
        expect(endpoint.origins[0].name).toBe("example-origin");
        expect(endpoint.origins[0].hostName).toBe("example.com");
        expect(endpoint.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(endpoint.cdnEndpointId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Cdn/profiles/${profileName}/endpoints/${endpointName}`,
          ),
        );
        expect(endpoint.type).toBe("azure::CDNEndpoint");
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create CDN endpoint with compression enabled", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-compress-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-compress-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-compress`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-compress-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-compress-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-compress", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "web-origin",
              hostName: "webapp.example.com",
            },
          ],
          isCompressionEnabled: true,
          contentTypesToCompress: [
            "text/html",
            "text/css",
            "application/json",
            "application/javascript",
          ],
        });

        expect(endpoint.name).toBe(endpointName);
        expect(endpoint.isCompressionEnabled).toBe(true);
        expect(endpoint.contentTypesToCompress).toContain("text/html");
        expect(endpoint.contentTypesToCompress).toContain("application/json");
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create CDN endpoint with query string caching", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-query-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-query-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-query`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-query-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-query-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-query", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "api-origin",
              hostName: "api.example.com",
            },
          ],
          queryStringCachingBehavior: "UseQueryString", // Cache by query params
          optimizationType: "DynamicSiteAcceleration",
        });

        expect(endpoint.name).toBe(endpointName);
        expect(endpoint.queryStringCachingBehavior).toBe("UseQueryString");
        expect(endpoint.optimizationType).toBe("DynamicSiteAcceleration");
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create CDN endpoint with multiple origins", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-multi-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-multi-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-multi`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-multi-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-multi-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-multi", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "primary-origin",
              hostName: "primary.example.com",
              priority: 1, // Higher priority (lower number)
              weight: 2000,
            },
            {
              name: "backup-origin",
              hostName: "backup.example.com",
              priority: 2, // Lower priority
              weight: 1000,
            },
          ],
        });

        expect(endpoint.origins).toHaveLength(2);
        expect(endpoint.origins[0].name).toBe("primary-origin");
        expect(endpoint.origins[0].priority).toBe(1);
        expect(endpoint.origins[1].name).toBe("backup-origin");
        expect(endpoint.origins[1].priority).toBe(2);
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create HTTPS-only CDN endpoint", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-https-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-https-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-https`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-https-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-https-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-https", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "secure-origin",
              hostName: "secure.example.com",
            },
          ],
          isHttpAllowed: false, // Disable HTTP
          isHttpsAllowed: true,
        });

        expect(endpoint.isHttpAllowed).toBe(false);
        expect(endpoint.isHttpsAllowed).toBe(true);
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update CDN endpoint tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-update-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-update-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-update`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-update-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        // Create
        endpoint = await CDNEndpoint("cdnep-update", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "origin",
              hostName: "example.com",
            },
          ],
          tags: {
            version: "1.0",
          },
        });

        expect(endpoint.tags).toEqual({
          version: "1.0",
        });

        // Update tags
        endpoint = await CDNEndpoint("cdnep-update", {
          name: endpointName,
          profile: profile,
          origins: [
            {
              name: "origin",
              hostName: "example.com",
            },
          ],
          tags: {
            version: "2.0",
            updated: "true",
          },
        });

        expect(endpoint.tags).toEqual({
          version: "2.0",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN endpoint with profile string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-profstr-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-profstr-prof`;
      const endpointName = `${BRANCH_PREFIX}-cdnep-profstr`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint;
      try {
        rg = await ResourceGroup("cdnep-profstr-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-profstr-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-profstr", {
          name: endpointName,
          profile: profileName, // String reference
          resourceGroup: resourceGroupName,
          location: "eastus",
          origins: [
            {
              name: "origin",
              hostName: "example.com",
            },
          ],
        });

        expect(endpoint.profile).toBe(profileName);
        expect(endpoint.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertCDNEndpointDoesNotExist(
          resourceGroupName,
          profileName,
          endpointName,
        );
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN endpoint name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-invalid-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-invalid-prof`;

      let profile: CDNProfile;
      try {
        const rg = await ResourceGroup("cdnep-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-invalid-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        // Name too short (empty)
        await expect(
          CDNEndpoint("cdnep-short", {
            name: "",
            profile: profile,
            origins: [{ name: "origin", hostName: "example.com" }],
          }),
        ).rejects.toThrow(/must be 1-50 characters/);

        // Name too long
        await expect(
          CDNEndpoint("cdnep-long", {
            name: "a".repeat(51),
            profile: profile,
            origins: [{ name: "origin", hostName: "example.com" }],
          }),
        ).rejects.toThrow(/must be 1-50 characters/);

        // Invalid characters (uppercase)
        await expect(
          CDNEndpoint("cdnep-uppercase", {
            name: "InvalidName",
            profile: profile,
            origins: [{ name: "origin", hostName: "example.com" }],
          }),
        ).rejects.toThrow(/lowercase alphanumeric and hyphens/);

        // Invalid characters (special chars)
        await expect(
          CDNEndpoint("cdnep-special", {
            name: "invalid_name!",
            profile: profile,
            origins: [{ name: "origin", hostName: "example.com" }],
          }),
        ).rejects.toThrow(/lowercase alphanumeric and hyphens/);
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN endpoint with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdnep-defname-rg`;
      const profileName = `${BRANCH_PREFIX}-cdnep-defname-prof`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let endpoint: CDNEndpoint | undefined;
      try {
        rg = await ResourceGroup("cdnep-defname-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdnep-defname-prof", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_Microsoft",
        });

        endpoint = await CDNEndpoint("cdnep-defname", {
          profile: profile,
          origins: [
            {
              name: "origin",
              hostName: "example.com",
            },
          ],
          // name not specified - will use ${app}-${stage}-${id}
        });

        expect(endpoint.name).toMatch(/^test-[a-z0-9-]+-cdnep-defname$/);
        expect(endpoint.cdnEndpointId).toBeTruthy();
        expect(endpoint.hostName).toContain(".azureedge.net");
      } finally {
        await destroy(scope);
        if (endpoint) {
          await assertCDNEndpointDoesNotExist(
            resourceGroupName,
            profileName,
            endpoint.name,
          );
        }
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

async function assertCDNEndpointDoesNotExist(
  resourceGroup: string,
  profileName: string,
  endpointName: string,
) {
  const { cdn } = await createAzureClients();

  try {
    await cdn.endpoints.get(resourceGroup, profileName, endpointName);
    throw new Error(
      `CDN endpoint ${endpointName} still exists after deletion`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

async function assertCDNProfileDoesNotExist(
  resourceGroup: string,
  profileName: string,
) {
  const { cdn } = await createAzureClients();

  try {
    await cdn.profiles.get(resourceGroup, profileName);
    throw new Error(
      `CDN profile ${profileName} still exists after deletion`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

async function assertResourceGroupDoesNotExist(resourceGroup: string) {
  const { resources } = await createAzureClients();

  try {
    await resources.resourceGroups.get(resourceGroup);
    throw new Error(
      `Resource group ${resourceGroup} still exists after deletion`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

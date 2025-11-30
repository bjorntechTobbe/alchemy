import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CDNProfile } from "../../src/azure/cdn-profile.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure CDN", () => {
  describe("CDNProfile", () => {
    // NOTE: Azure has deprecated classic CDN SKUs (Standard_Microsoft, Standard_Akamai, etc.)
    // and no longer supports new profile creation. All tests use Azure Front Door SKUs.
    // Azure Front Door requires location: "global" instead of regional locations.

    test("create CDN profile with Azure Front Door Standard", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-std-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-std`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        rg = await ResourceGroup("cdn-std-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdn-std", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(profile.name).toBe(profileName);
        expect(profile.location).toBe("global");
        expect(profile.sku).toBe("Standard_AzureFrontDoor");
        expect(profile.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(profile.cdnProfileId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Cdn/profiles/${profileName}`,
          ),
        );
        expect(profile.type).toBe("azure::CDNProfile");
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create CDN profile with Azure Front Door Standard", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-afd-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-afd`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        rg = await ResourceGroup("cdn-afd-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdn-afd", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor", // Modern recommended SKU
        });

        expect(profile.name).toBe(profileName);
        expect(profile.sku).toBe("Standard_AzureFrontDoor");
        expect(profile.resourceState).toBeTruthy();
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update CDN profile tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-update-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-update`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        rg = await ResourceGroup("cdn-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create
        profile = await CDNProfile("cdn-update", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          tags: {
            version: "1.0",
          },
        });

        expect(profile.tags).toEqual({
          version: "1.0",
        });

        // Update tags
        profile = await CDNProfile("cdn-update", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          tags: {
            version: "2.0",
            updated: "true",
          },
        });

        expect(profile.tags).toEqual({
          version: "2.0",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN profile with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-rgobj-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-rgobj`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        rg = await ResourceGroup("cdn-rgobj-rg", {
          name: resourceGroupName,
          location: "westus",
        });

        profile = await CDNProfile("cdn-rgobj", {
          name: profileName,
          resourceGroup: rg, // Object reference
          sku: "Standard_AzureFrontDoor",
        });

        expect(profile.location).toBe("global"); // Inherited from RG
        expect(profile.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN profile with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-rgstr-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-rgstr`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        rg = await ResourceGroup("cdn-rgstr-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdn-rgstr", {
          name: profileName,
          resourceGroup: resourceGroupName, // String reference
          location: "global", // Must specify location explicitly
          sku: "Standard_AzureFrontDoor",
        });

        expect(profile.location).toBe("global");
        expect(profile.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing CDN profile", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-adopt-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-adopt`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      try {
        // Create resource group and profile via Azure SDK directly
        const { resources, cdn } = await createAzureClients();

        await resources.resourceGroups.createOrUpdate(resourceGroupName, {
          location: "eastus",
        });

        const existing = await cdn.profiles.beginCreateAndWait(
          resourceGroupName,
          profileName,
          {
            location: "eastus",
            sku: {
              name: "Standard_AzureFrontDoor",
            },
          },
        );

        const existingId = existing.id!;

        // Now adopt it with Alchemy
        rg = await ResourceGroup("cdn-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
          adopt: true,
        });

        profile = await CDNProfile("cdn-adopt", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          adopt: true, // Adopt the existing profile
        });

        expect(profile.cdnProfileId).toBe(existingId);
        expect(profile.name).toBe(profileName);
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN profile name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-invalid-rg`;

      try {
        const rg = await ResourceGroup("cdn-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Name too short (empty)
        await expect(
          CDNProfile("cdn-short", {
            name: "",
            resourceGroup: rg,
            sku: "Standard_AzureFrontDoor",
          }),
        ).rejects.toThrow(/must be 1-260 characters/);

        // Name too long
        await expect(
          CDNProfile("cdn-long", {
            name: "a".repeat(261),
            resourceGroup: rg,
            sku: "Standard_AzureFrontDoor",
          }),
        ).rejects.toThrow(/must be 1-260 characters/);

        // Invalid characters
        await expect(
          CDNProfile("cdn-invalid-chars", {
            name: "invalid_name!",
            resourceGroup: rg,
            sku: "Standard_AzureFrontDoor",
          }),
        ).rejects.toThrow(/alphanumeric characters and hyphens/);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("CDN profile with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-defname-rg`;

      let rg: ResourceGroup;
      let profile: CDNProfile | undefined;
      try {
        rg = await ResourceGroup("cdn-defname-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdn-defname", {
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          // name not specified - will use ${app}-${stage}-${id}
        });

        expect(profile.name).toMatch(/^test-[a-z0-9-]+-cdn-defname$/);
        expect(profile.cdnProfileId).toBeTruthy();
      } finally {
        await destroy(scope);
        if (profile) {
          await assertCDNProfileDoesNotExist(resourceGroupName, profile.name);
        }
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves CDN profile", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-preserve-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-preserve`;

      let rg: ResourceGroup;
      let profile: CDNProfile;
      let profileId: string;
      try {
        rg = await ResourceGroup("cdn-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        profile = await CDNProfile("cdn-preserve", {
          name: profileName,
          resourceGroup: rg,
          sku: "Standard_AzureFrontDoor",
          delete: false, // Don't delete on destroy
        });

        expect(profile.cdnProfileId).toBeTruthy();
        profileId = profile.cdnProfileId;

        // Destroy scope
        await destroy(scope);

        // Profile should still exist
        const { cdn } = await createAzureClients();
        const existing = await cdn.profiles.get(resourceGroupName, profileName);
        expect(existing.id).toBe(profileId);

        // Clean up manually
        await cdn.profiles.beginDeleteAndWait(resourceGroupName, profileName);
      } finally {
        // Clean up resource group
        const { resources } = await createAzureClients();
        try {
          await resources.resourceGroups.beginDeleteAndWait(resourceGroupName);
        } catch (error) {
          if (error.statusCode !== 404) {
            throw error;
          }
        }
      }
    });

    test("reject existing CDN profile without adopt flag", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cdn-reject-rg`;
      const profileName = `${BRANCH_PREFIX}-cdn-reject`;

      let rg: ResourceGroup;
      try {
        // Create resource group and profile via Azure SDK directly
        const { resources, cdn } = await createAzureClients();

        await resources.resourceGroups.createOrUpdate(resourceGroupName, {
          location: "eastus",
        });

        await cdn.profiles.beginCreateAndWait(resourceGroupName, profileName, {
          location: "eastus",
          sku: {
            name: "Standard_AzureFrontDoor",
          },
        });

        // Now try to create with Alchemy without adopt flag
        rg = await ResourceGroup("cdn-reject-rg", {
          name: resourceGroupName,
          location: "eastus",
          adopt: true,
        });

        await expect(
          CDNProfile("cdn-reject", {
            name: profileName,
            resourceGroup: rg,
            sku: "Standard_AzureFrontDoor",
            adopt: false, // Explicitly don't adopt
          }),
        ).rejects.toThrow(/already exists/);
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

async function assertCDNProfileDoesNotExist(
  resourceGroup: string,
  profileName: string,
) {
  const { cdn } = await createAzureClients();

  try {
    await cdn.profiles.get(resourceGroup, profileName);
    throw new Error(`CDN profile ${profileName} still exists after deletion`);
  } catch (error) {
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
  } catch (error) {
    expect(error.statusCode).toBe(404);
  }
}

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CDNProfile } from "../../src/azure/cdn-profile.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertCDNProfileDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip CDN tests by default - they are extremely slow (30-60+ minutes)
// To run manually: bun vitest alchemy/test/azure/cdn-profile.test.ts --run
describe.skip("Azure CDN", () => {
  describe("CDNProfile", () => {
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
          location: "global",
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
            `/subscriptions/[a-f0-9-]+/resourcegroups/${resourceGroupName}/providers/Microsoft\\.Cdn/profiles/${profileName}`,
            "i",
          ),
        );
        expect(profile.type).toBe("azure::CDNProfile");
      } finally {
        await destroy(scope);
        await assertCDNProfileDoesNotExist(resourceGroupName, profileName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    }, 3600000); // 60 minutes for profile creation + cleanup (deletion is very slow)
  });
});

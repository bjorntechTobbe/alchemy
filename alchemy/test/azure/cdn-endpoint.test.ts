import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CDNProfile } from "../../src/azure/cdn-profile.ts";
import { CDNEndpoint } from "../../src/azure/cdn-endpoint.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertCDNEndpointDoesNotExist,
  assertCDNProfileDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip CDN tests by default - they are extremely slow (45-60+ minutes)
// To run manually: bun vitest alchemy/test/azure/cdn-endpoint.test.ts --run
describe.skip("Azure CDN", () => {
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
          location: "global",
          sku: "Standard_AzureFrontDoor",
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
        expect(endpoint.location).toBe("global");
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
            `/subscriptions/[a-f0-9-]+/resourcegroups/${resourceGroupName}/providers/Microsoft\\.Cdn/profiles/${profileName}/endpoints/${endpointName}`,
            "i",
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
    }, 3600000); // 60 minutes for profile + endpoint creation + cleanup (deletion is very slow)
  });
});

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
          isHttpAllowed: false,
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
  });
});

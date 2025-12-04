import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { PublicIPAddress } from "../../src/azure/public-ip-address.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertPublicIPAddressDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Networking", () => {
  describe("PublicIPAddress", () => {
    test("create public IP address", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-create-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-create`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-create", {
          name: pipName,
          resourceGroup: rg,
          sku: "Standard",
          allocationMethod: "Static",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(pip.name).toBe(pipName);
        expect(pip.location).toBe("eastus");
        expect(pip.sku).toBe("Standard");
        expect(pip.allocationMethod).toBe("Static");
        expect(pip.ipAddress).toBeTruthy(); // IP is allocated for Static
        expect(pip.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(pip.publicIpAddressId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Network/publicIPAddresses/${pipName}`,
          ),
        );
        expect(pip.type).toBe("azure::PublicIPAddress");
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address with DNS label", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-dns-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-dns`;
      const dnsLabel = `${BRANCH_PREFIX}-dns`.toLowerCase().replace(/_/g, "-");

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-dns-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-dns", {
          name: pipName,
          resourceGroup: rg,
          domainNameLabel: dnsLabel,
        });

        expect(pip.domainNameLabel).toBe(dnsLabel);
        expect(pip.fqdn).toBe(`${dnsLabel}.eastus.cloudapp.azure.com`);
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update public IP address tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-update-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-update`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-update", {
          name: pipName,
          resourceGroup: rg,
          tags: {
            environment: "test",
          },
        });

        expect(pip.tags).toEqual({ environment: "test" });

        // Update tags
        pip = await PublicIPAddress("pip-update", {
          name: pipName,
          resourceGroup: rg,
          tags: {
            environment: "test",
            updated: "true",
          },
        });

        expect(pip.tags).toEqual({
          environment: "test",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

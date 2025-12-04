import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { VirtualNetwork } from "../../src/azure/virtual-network.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Networking", () => {
  describe("VirtualNetwork", () => {
    test("create virtual network", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-create-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-create`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-create", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.0.0.0/16"],
          subnets: [
            { name: "default", addressPrefix: "10.0.0.0/24" },
            { name: "web", addressPrefix: "10.0.1.0/24" },
          ],
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(vnet.name).toBe(vnetName);
        expect(vnet.location).toBe("eastus");
        expect(vnet.addressSpace).toEqual(["10.0.0.0/16"]);
        expect(vnet.subnets).toHaveLength(2);
        expect(vnet.subnets[0].name).toBe("default");
        expect(vnet.subnets[0].addressPrefix).toBe("10.0.0.0/24");
        expect(vnet.subnets[1].name).toBe("web");
        expect(vnet.subnets[1].addressPrefix).toBe("10.0.1.0/24");
        expect(vnet.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(vnet.virtualNetworkId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Network/virtualNetworks/${vnetName}`,
          ),
        );
        expect(vnet.type).toBe("azure::VirtualNetwork");
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update virtual network tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-update-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-update`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-update", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.1.0.0/16"],
          tags: {
            environment: "test",
          },
        });

        expect(vnet.tags).toEqual({ environment: "test" });

        // Update tags
        vnet = await VirtualNetwork("vnet-update", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.1.0.0/16"],
          tags: {
            environment: "test",
            updated: "true",
          },
        });

        expect(vnet.tags).toEqual({
          environment: "test",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-objref-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-objref`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-objref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-objref", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["192.168.0.0/16"],
        });

        expect(vnet.name).toBe(vnetName);
        expect(vnet.location).toBe("eastus");
        expect(vnet.addressSpace).toEqual(["192.168.0.0/16"]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-strref-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-strref`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-strref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-strref", {
          name: vnetName,
          resourceGroup: resourceGroupName,
          location: "eastus",
          addressSpace: ["172.16.0.0/16"],
        });

        expect(vnet.name).toBe(vnetName);
        expect(vnet.location).toBe("eastus");
        expect(vnet.addressSpace).toEqual(["172.16.0.0/16"]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing virtual network", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-adopt-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-adopt`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create initial virtual network
        vnet = await VirtualNetwork("vnet-adopt-first", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.2.0.0/16"],
        });

        const firstVnetId = vnet.virtualNetworkId;

        // Try to adopt without flag (should fail)
        try {
          await VirtualNetwork("vnet-adopt-second", {
            name: vnetName,
            resourceGroup: rg,
            addressSpace: ["10.2.0.0/16"],
          });
          throw new Error("Expected adoption to fail without adopt flag");
        } catch (error) {
          expect(error.message).toContain("already exists");
          expect(error.message).toContain("adopt: true");
        }

        // Adopt existing virtual network
        vnet = await VirtualNetwork("vnet-adopt-second", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.2.0.0/16"],
          adopt: true,
        });

        expect(vnet.virtualNetworkId).toBe(firstVnetId);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-invalid-rg`;

      try {
        const rg = await ResourceGroup("vnet-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test invalid name (starts with hyphen)
        try {
          await VirtualNetwork("vnet-invalid", {
            name: "-invalid-name",
            resourceGroup: rg,
          });
          throw new Error("Expected name validation to fail");
        } catch (error) {
          expect(error.message).toContain("invalid");
        }

        // Test invalid name (ends with hyphen)
        try {
          await VirtualNetwork("vnet-invalid2", {
            name: "invalid-name-",
            resourceGroup: rg,
          });
          throw new Error("Expected name validation to fail");
        } catch (error) {
          expect(error.message).toContain("invalid");
        }
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-default-rg`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-default", {
          resourceGroup: rg,
          addressSpace: ["10.3.0.0/16"],
        });

        expect(vnet.name).toBeTruthy();
        expect(vnet.name).toContain(BRANCH_PREFIX);
        expect(vnet.addressSpace).toEqual(["10.3.0.0/16"]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnet!.name);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with custom DNS", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-dns-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-dns`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-dns-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-dns", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.4.0.0/16"],
          dnsServers: ["10.4.0.4", "10.4.0.5"],
        });

        expect(vnet.dnsServers).toEqual(["10.4.0.4", "10.4.0.5"]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves virtual network", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-preserve-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-preserve`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
          delete: false,
        });

        vnet = await VirtualNetwork("vnet-preserve", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.5.0.0/16"],
          delete: false,
        });

        expect(vnet.name).toBe(vnetName);
      } finally {
        // Destroy scope but virtual network should be preserved
        await destroy(scope);

        // Verify virtual network still exists
        const clients = await createAzureClients();
        const preserved = await clients.network.virtualNetworks.get(
          resourceGroupName,
          vnetName,
        );
        expect(preserved.name).toBe(vnetName);

        // Manual cleanup
        await clients.network.virtualNetworks.beginDeleteAndWait(
          resourceGroupName,
          vnetName,
        );
        await clients.resources.resourceGroups.beginDelete(
          resourceGroupName,
        );
      }
    });
  });
});

async function assertVirtualNetworkDoesNotExist(
  resourceGroup: string,
  vnetName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.virtualNetworks.get(resourceGroup, vnetName);
    throw new Error(`Virtual network ${vnetName} still exists after deletion`);
  } catch (error) {
    // 404 is expected - virtual network was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

async function assertResourceGroupDoesNotExist(resourceGroupName: string) {
  const clients = await createAzureClients();
  try {
    await clients.resources.resourceGroups.get(resourceGroupName);
    throw new Error(
      `Resource group ${resourceGroupName} still exists after deletion`,
    );
  } catch (error) {
    // 404 is expected - resource group was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

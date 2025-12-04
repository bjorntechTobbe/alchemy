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

    test("virtual network with multiple subnets", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-subnets-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-subnets`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-subnets-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-subnets", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.2.0.0/16"],
          subnets: [
            { name: "subnet1", addressPrefix: "10.2.1.0/24" },
            { name: "subnet2", addressPrefix: "10.2.2.0/24" },
            { name: "subnet3", addressPrefix: "10.2.3.0/24" },
          ],
        });

        expect(vnet.subnets).toHaveLength(3);
        expect(vnet.subnets[0].name).toBe("subnet1");
        expect(vnet.subnets[1].name).toBe("subnet2");
        expect(vnet.subnets[2].name).toBe("subnet3");
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with multiple address spaces", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-multi-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-multi`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-multi-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-multi", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.3.0.0/16", "10.4.0.0/16"],
        });

        expect(vnet.addressSpace).toEqual(["10.3.0.0/16", "10.4.0.0/16"]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("virtual network with subnet delegation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vnet-deleg-rg`;
      const vnetName = `${BRANCH_PREFIX}-vnet-deleg`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      try {
        rg = await ResourceGroup("vnet-deleg-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("vnet-deleg", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.5.0.0/16"],
          subnets: [
            {
              name: "container-subnet",
              addressPrefix: "10.5.1.0/24",
              delegations: [
                {
                  name: "container-delegation",
                  serviceName: "Microsoft.ContainerInstance/containerGroups",
                },
              ],
            },
          ],
        });

        expect(vnet.subnets).toHaveLength(1);
        expect(vnet.subnets[0].delegations).toEqual([
          {
            name: "container-delegation",
            serviceName: "Microsoft.ContainerInstance/containerGroups",
          },
        ]);
      } finally {
        await destroy(scope);
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
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
    throw new Error(
      `Virtual network ${vnetName} still exists after deletion`,
    );
  } catch (error: any) {
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
  } catch (error: any) {
    // 404 is expected - resource group was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

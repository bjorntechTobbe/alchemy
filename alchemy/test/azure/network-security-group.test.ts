import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { NetworkSecurityGroup } from "../../src/azure/network-security-group.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Networking", () => {
  describe("NetworkSecurityGroup", () => {
    test("create network security group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-create-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-create`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-create", {
          name: nsgName,
          resourceGroup: rg,
          securityRules: [
            {
              name: "allow-http",
              priority: 100,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "80",
            },
            {
              name: "allow-https",
              priority: 110,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "443",
            },
          ],
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(nsg.name).toBe(nsgName);
        expect(nsg.location).toBe("eastus");
        expect(nsg.securityRules).toHaveLength(2);
        expect(nsg.securityRules[0].name).toBe("allow-http");
        expect(nsg.securityRules[0].priority).toBe(100);
        expect(nsg.securityRules[0].direction).toBe("Inbound");
        expect(nsg.securityRules[0].access).toBe("Allow");
        expect(nsg.securityRules[0].protocol).toBe("Tcp");
        expect(nsg.securityRules[0].destinationPortRange).toBe("80");
        expect(nsg.securityRules[1].name).toBe("allow-https");
        expect(nsg.securityRules[1].destinationPortRange).toBe("443");
        expect(nsg.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(nsg.networkSecurityGroupId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Network/networkSecurityGroups/${nsgName}`,
          ),
        );
        expect(nsg.type).toBe("azure::NetworkSecurityGroup");
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update network security group rules", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-update-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-update`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-update", {
          name: nsgName,
          resourceGroup: rg,
          securityRules: [
            {
              name: "allow-ssh",
              priority: 100,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "22",
            },
          ],
        });

        expect(nsg.securityRules).toHaveLength(1);
        expect(nsg.securityRules[0].name).toBe("allow-ssh");

        // Update rules - add another rule
        nsg = await NetworkSecurityGroup("nsg-update", {
          name: nsgName,
          resourceGroup: rg,
          securityRules: [
            {
              name: "allow-ssh",
              priority: 100,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "22",
            },
            {
              name: "allow-rdp",
              priority: 110,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "3389",
            },
          ],
        });

        expect(nsg.securityRules).toHaveLength(2);
        expect(nsg.securityRules[1].name).toBe("allow-rdp");
        expect(nsg.securityRules[1].destinationPortRange).toBe("3389");
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("network security group with security rules", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-rules-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-rules`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-rules-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-rules", {
          name: nsgName,
          resourceGroup: rg,
          securityRules: [
            {
              name: "deny-all-inbound",
              priority: 4096,
              direction: "Inbound",
              access: "Deny",
              protocol: "*",
              sourceAddressPrefix: "*",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "*",
            },
          ],
        });

        expect(nsg.securityRules).toHaveLength(1);
        expect(nsg.securityRules[0].access).toBe("Deny");
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

async function assertNetworkSecurityGroupDoesNotExist(
  resourceGroup: string,
  nsgName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.networkSecurityGroups.get(resourceGroup, nsgName);
    throw new Error(
      `Network security group ${nsgName} still exists after deletion`,
    );
  } catch (error: any) {
    // 404 is expected - network security group was deleted
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

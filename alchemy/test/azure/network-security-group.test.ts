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

    test("network security group with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-objref-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-objref`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-objref-rg", {
          name: resourceGroupName,
          location: "westus",
        });

        nsg = await NetworkSecurityGroup("nsg-objref", {
          name: nsgName,
          resourceGroup: rg,
        });

        expect(nsg.name).toBe(nsgName);
        expect(nsg.location).toBe("westus");
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("network security group with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-strref-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-strref`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-strref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-strref", {
          name: nsgName,
          resourceGroup: resourceGroupName,
          location: "eastus",
        });

        expect(nsg.name).toBe(nsgName);
        expect(nsg.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing network security group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-adopt-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-adopt`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create initial network security group
        nsg = await NetworkSecurityGroup("nsg-adopt-first", {
          name: nsgName,
          resourceGroup: rg,
        });

        const firstNsgId = nsg.networkSecurityGroupId;

        // Try to adopt without flag (should fail)
        try {
          await NetworkSecurityGroup("nsg-adopt-second", {
            name: nsgName,
            resourceGroup: rg,
          });
          throw new Error("Expected adoption to fail without adopt flag");
        } catch (error) {
          expect(error.message).toContain("already exists");
          expect(error.message).toContain("adopt: true");
        }

        // Adopt existing network security group
        nsg = await NetworkSecurityGroup("nsg-adopt-second", {
          name: nsgName,
          resourceGroup: rg,
          adopt: true,
        });

        expect(nsg.networkSecurityGroupId).toBe(firstNsgId);
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsgName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("network security group name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-invalid-rg`;

      try {
        await ResourceGroup("nsg-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        const rg = resourceGroupName;

        // Test invalid name (starts with hyphen)
        try {
          await NetworkSecurityGroup("nsg-invalid", {
            name: "-invalid-name",
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

    test("network security group with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-default-rg`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-default", {
          resourceGroup: rg,
        });

        expect(nsg.name).toBeTruthy();
        expect(nsg.name).toContain(BRANCH_PREFIX);
      } finally {
        await destroy(scope);
        await assertNetworkSecurityGroupDoesNotExist(
          resourceGroupName,
          nsg!.name,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves network security group", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-nsg-preserve-rg`;
      const nsgName = `${BRANCH_PREFIX}-nsg-preserve`;

      let rg: ResourceGroup;
      let nsg: NetworkSecurityGroup;
      try {
        rg = await ResourceGroup("nsg-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        nsg = await NetworkSecurityGroup("nsg-preserve", {
          name: nsgName,
          resourceGroup: rg,
          delete: false,
        });

        expect(nsg.name).toBe(nsgName);
      } finally {
        // Destroy scope but network security group should be preserved
        await destroy(scope);

        // Verify network security group still exists
        const clients = await createAzureClients();
        const preserved = await clients.network.networkSecurityGroups.get(
          resourceGroupName,
          nsgName,
        );
        expect(preserved.name).toBe(nsgName);

        // Manual cleanup
        await clients.network.networkSecurityGroups.beginDeleteAndWait(
          resourceGroupName,
          nsgName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
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
  } catch (error) {
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
  } catch (error) {
    // 404 is expected - resource group was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { PublicIPAddress } from "../../src/azure/public-ip-address.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

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

    test("public IP address with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-objref-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-objref`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-objref-rg", {
          name: resourceGroupName,
          location: "westus",
        });

        pip = await PublicIPAddress("pip-objref", {
          name: pipName,
          resourceGroup: rg,
        });

        expect(pip.name).toBe(pipName);
        expect(pip.location).toBe("westus");
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-strref-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-strref`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-strref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-strref", {
          name: pipName,
          resourceGroup: resourceGroupName,
          location: "eastus",
        });

        expect(pip.name).toBe(pipName);
        expect(pip.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("zone-redundant public IP address", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-zones-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-zones`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-zones-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-zones", {
          name: pipName,
          resourceGroup: rg,
          sku: "Standard",
          zones: ["1", "2", "3"],
        });

        expect(pip.zones).toEqual(["1", "2", "3"]);
        expect(pip.sku).toBe("Standard");
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing public IP address", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-adopt-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-adopt`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create initial public IP address
        pip = await PublicIPAddress("pip-adopt-first", {
          name: pipName,
          resourceGroup: rg,
        });

        const firstPipId = pip.publicIpAddressId;

        // Try to adopt without flag (should fail)
        try {
          await PublicIPAddress("pip-adopt-second", {
            name: pipName,
            resourceGroup: rg,
          });
          throw new Error("Expected adoption to fail without adopt flag");
        } catch (error: any) {
          expect(error.message).toContain("already exists");
          expect(error.message).toContain("adopt: true");
        }

        // Adopt existing public IP address
        pip = await PublicIPAddress("pip-adopt-second", {
          name: pipName,
          resourceGroup: rg,
          adopt: true,
        });

        expect(pip.publicIpAddressId).toBe(firstPipId);
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-invalid-rg`;

      try {
        await ResourceGroup("pip-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test invalid name (starts with hyphen)
        try {
          await PublicIPAddress("pip-invalid", {
            name: "-invalid-name",
            resourceGroup: resourceGroupName,
            location: "eastus",
          });
          throw new Error("Expected name validation to fail");
        } catch (error: any) {
          expect(error.message).toContain("invalid");
        }
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address domain name label validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-dns-invalid-rg`;

      try {
        const rg = await ResourceGroup("pip-dns-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test invalid domain label (starts with number)
        try {
          await PublicIPAddress("pip-dns-invalid", {
            resourceGroup: rg,
            domainNameLabel: "123invalid",
          });
          throw new Error("Expected DNS label validation to fail");
        } catch (error: any) {
          expect(error.message).toContain("invalid");
        }

        // Test invalid domain label (uppercase)
        try {
          await PublicIPAddress("pip-dns-invalid2", {
            resourceGroup: rg,
            domainNameLabel: "InvalidLabel",
          });
          throw new Error("Expected DNS label validation to fail");
        } catch (error: any) {
          expect(error.message).toContain("invalid");
        }
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-default-rg`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-default", {
          resourceGroup: rg,
        });

        expect(pip.name).toBeTruthy();
        expect(pip.name).toContain(BRANCH_PREFIX);
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pip!.name);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("public IP address with custom idle timeout", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-timeout-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-timeout`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-timeout-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-timeout", {
          name: pipName,
          resourceGroup: rg,
          idleTimeoutInMinutes: 30,
        });

        expect(pip.idleTimeoutInMinutes).toBe(30);
      } finally {
        await destroy(scope);
        await assertPublicIPAddressDoesNotExist(resourceGroupName, pipName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves public IP address", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-pip-preserve-rg`;
      const pipName = `${BRANCH_PREFIX}-pip-preserve`;

      let rg: ResourceGroup;
      let pip: PublicIPAddress;
      try {
        rg = await ResourceGroup("pip-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        pip = await PublicIPAddress("pip-preserve", {
          name: pipName,
          resourceGroup: rg,
          delete: false,
        });

        expect(pip.name).toBe(pipName);
      } finally {
        // Destroy scope but public IP address should be preserved
        await destroy(scope);

        // Verify public IP address still exists
        const clients = await createAzureClients();
        const preserved = await clients.network.publicIPAddresses.get(
          resourceGroupName,
          pipName,
        );
        expect(preserved.name).toBe(pipName);

        // Manual cleanup
        await clients.network.publicIPAddresses.beginDeleteAndWait(
          resourceGroupName,
          pipName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });
});

async function assertPublicIPAddressDoesNotExist(
  resourceGroup: string,
  pipName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.publicIPAddresses.get(resourceGroup, pipName);
    throw new Error(`Public IP address ${pipName} still exists after deletion`);
  } catch (error: any) {
    // 404 is expected - public IP address was deleted
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

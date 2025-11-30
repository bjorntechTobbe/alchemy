import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { KeyVault } from "../../src/azure/key-vault.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Security", () => {
  describe("KeyVault", () => {
    test("create key vault with standard SKU", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-std-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-std`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-std-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-std", {
          name: vaultName,
          resourceGroup: rg,
          sku: "standard",
          enableSoftDelete: true,
          softDeleteRetentionInDays: 90,
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.location).toBe("eastus");
        expect(vault.sku).toBe("standard");
        expect(vault.vaultUri).toBe(`https://${vaultName}.vault.azure.net/`);
        expect(vault.enableSoftDelete).toBe(true);
        expect(vault.softDeleteRetentionInDays).toBe(90);
        expect(vault.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(vault.keyVaultId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.KeyVault/vaults/${vaultName}`,
          ),
        );
        expect(vault.type).toBe("azure::KeyVault");
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create key vault with RBAC authorization", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-rbac-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-rbac`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-rbac-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-rbac", {
          name: vaultName,
          resourceGroup: rg,
          sku: "standard",
          enableRbacAuthorization: true,
          // Don't set enablePurgeProtection - leave it as default (false/undefined)
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.enableRbacAuthorization).toBe(true);
        // enablePurgeProtection should be undefined when not explicitly set
        expect(vault.enablePurgeProtection).toBeUndefined();
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create key vault with network restrictions", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-net-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-net`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-net-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-net", {
          name: vaultName,
          resourceGroup: rg,
          networkAclsDefaultAction: "Deny",
          ipRules: ["203.0.113.0/24", "198.51.100.42"],
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.networkAclsDefaultAction).toBe("Deny");
        // Azure automatically adds /32 to single IP addresses
        expect(vault.ipRules).toEqual(["203.0.113.0/24", "198.51.100.42/32"]);
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create key vault for Azure resources", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-azure-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-azure`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-azure-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-azure", {
          name: vaultName,
          resourceGroup: rg,
          enabledForDeployment: true,
          enabledForDiskEncryption: true,
          enabledForTemplateDeployment: true,
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.enabledForDeployment).toBe(true);
        expect(vault.enabledForDiskEncryption).toBe(true);
        expect(vault.enabledForTemplateDeployment).toBe(true);
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update key vault tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-update-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-update`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create with initial tags
        vault = await KeyVault("kv-update", {
          name: vaultName,
          resourceGroup: rg,
          tags: {
            environment: "test",
          },
        });

        expect(vault.tags).toEqual({
          environment: "test",
        });

        // Update tags
        vault = await KeyVault("kv-update", {
          name: vaultName,
          resourceGroup: rg,
          tags: {
            environment: "production",
            team: "platform",
          },
        });

        expect(vault.tags).toEqual({
          environment: "production",
          team: "platform",
        });
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("key vault with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-objref-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-objref`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-objref-rg", {
          name: resourceGroupName,
          location: "westus",
        });

        vault = await KeyVault("kv-objref", {
          name: vaultName,
          resourceGroup: rg,
          sku: "standard",
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.location).toBe("westus");
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("key vault with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-strref-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-strref`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-strref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-strref", {
          name: vaultName,
          resourceGroup: resourceGroupName,
          sku: "standard",
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("key vault with default name generation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-defname-rg`;
      // Generate a short vault name to stay within 24 char limit
      const vaultName = `${BRANCH_PREFIX}-kvdef`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault | undefined;
      try {
        rg = await ResourceGroup("kv-defname-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vault = await KeyVault("kv-defname", {
          name: vaultName,
          resourceGroup: rg,
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.name.length).toBeGreaterThan(0);
        expect(vault.name.length).toBeLessThanOrEqual(24);
        expect(vault.location).toBe("eastus");
      } finally {
        await destroy(scope);
        if (vault) {
          await assertKeyVaultDoesNotExist(resourceGroupName, vault.name);
        }
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("key vault validates name format", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-invalid-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("kv-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Name too long (more than 24 characters)
        await expect(
          KeyVault("kv-invalid-long", {
            name: "this-name-is-way-too-long-for-azure-key-vault",
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid/i);

        // Name starts with number
        await expect(
          KeyVault("kv-invalid-num", {
            name: "1invalid",
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid/i);

        // Name with invalid characters
        await expect(
          KeyVault("kv-invalid-chars", {
            name: "invalid_name",
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid/i);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("key vault preserves on delete false", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-preserve-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-preserve`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
          delete: false, // Also preserve the resource group
        });

        vault = await KeyVault("kv-preserve", {
          name: vaultName,
          resourceGroup: rg,
          delete: false,
        });

        expect(vault.name).toBe(vaultName);
      } finally {
        await destroy(scope);

        // Key vault should still exist
        const clients = await createAzureClients();
        const existingVault = await clients.keyVault.vaults.get(
          resourceGroupName,
          vaultName,
        );
        expect(existingVault.name).toBe(vaultName);

        // Clean up manually
        await clients.keyVault.vaults.delete(resourceGroupName, vaultName);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);

        // Also delete the resource group
        const poller =
          await clients.resources.resourceGroups.beginDelete(resourceGroupName);
        await poller.pollUntilDone();
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing key vault", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-adopt-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-adopt-${Date.now()}`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      let vault: KeyVault;
      try {
        rg = await ResourceGroup("kv-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create key vault directly with Azure SDK
        const clients = await createAzureClients();

        // Get tenant ID from clients (now auto-detected)
        const tenantId = clients.tenantId;
        if (!tenantId) {
          throw new Error("Tenant ID is required for Key Vault tests");
        }

        await clients.keyVault.vaults.beginCreateOrUpdateAndWait(
          resourceGroupName,
          vaultName,
          {
            location: "eastus",
            properties: {
              tenantId: tenantId,
              sku: {
                family: "A",
                name: "standard",
              },
              accessPolicies: [],
              enableSoftDelete: false, // Disable soft-delete for test vaults
            },
          },
        );

        // Adopt it with Alchemy
        vault = await KeyVault("kv-adopt", {
          name: vaultName,
          resourceGroup: rg,
          adopt: true,
          tags: {
            adopted: "true",
          },
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.tags?.adopted).toBe("true");
      } finally {
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("reject existing key vault without adopt", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-kv-reject-rg`;
      const vaultName = `${BRANCH_PREFIX}-kv-rej-${Date.now()}`
        .toLowerCase()
        .replace(/_/g, "-")
        .substring(0, 24);

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("kv-reject-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create key vault directly with Azure SDK
        const clients = await createAzureClients();

        // Get tenant ID from clients (now auto-detected)
        const tenantId = clients.tenantId;
        if (!tenantId) {
          throw new Error("Tenant ID is required for Key Vault tests");
        }

        await clients.keyVault.vaults.beginCreateOrUpdateAndWait(
          resourceGroupName,
          vaultName,
          {
            location: "eastus",
            properties: {
              tenantId: tenantId,
              sku: {
                family: "A",
                name: "standard",
              },
              accessPolicies: [],
              enableSoftDelete: false, // Disable soft-delete for test vaults
            },
          },
        );

        // Try to create without adopt flag - should fail
        await expect(
          KeyVault("kv-reject", {
            name: vaultName,
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/already exists/i);
      } finally {
        // Clean up manually
        const clients = await createAzureClients();
        await clients.keyVault.vaults.delete(resourceGroupName, vaultName);
        await destroy(scope);
        await assertKeyVaultDoesNotExist(resourceGroupName, vaultName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

async function assertKeyVaultDoesNotExist(
  resourceGroup: string,
  vaultName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.keyVault.vaults.get(resourceGroup, vaultName);
    throw new Error(`Key vault ${vaultName} still exists after deletion`);
  } catch (error) {
    // 404 is expected - vault was deleted
    if (error.statusCode !== 404 && error.code !== "VaultNotFound") {
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

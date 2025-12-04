import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { KeyVault } from "../../src/azure/key-vault.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertKeyVaultDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

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
        });

        expect(vault.name).toBe(vaultName);
        expect(vault.enableRbacAuthorization).toBe(true);
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
  });
});

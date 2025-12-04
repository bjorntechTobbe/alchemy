import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CosmosDBAccount } from "../../src/azure/cosmosdb-account.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Databases", () => {
  describe("CosmosDBAccount", () => {
    test("create cosmos db account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-create-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-create", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          kind: "GlobalDocumentDB",
          consistencyLevel: "Session",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(cosmosDB.name).toBe(cosmosDBAccountName);
        expect(cosmosDB.location).toBe("eastus");
        expect(cosmosDB.resourceGroup).toBe(resourceGroupName);
        expect(cosmosDB.kind).toBe("GlobalDocumentDB");
        expect(cosmosDB.consistencyLevel).toBe("Session");
        expect(cosmosDB.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(cosmosDB.cosmosDBAccountId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.DocumentDB/databaseAccounts/${cosmosDBAccountName}`,
          ),
        );
        expect(cosmosDB.documentEndpoint).toBe(
          `https://${cosmosDBAccountName}.documents.azure.com:443/`,
        );
        expect(cosmosDB.connectionString).toBeDefined();
        expect(cosmosDB.primaryKey).toBeDefined();
        expect(cosmosDB.secondaryKey).toBeDefined();
        expect(cosmosDB.type).toBe("cosmosdb-account");
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update cosmos db account tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-update-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create Cosmos DB account
        cosmosDB = await CosmosDBAccount("cosmos-update", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          tags: {
            environment: "test",
          },
        });

        expect(cosmosDB.tags).toEqual({
          environment: "test",
        });

        // Update tags
        cosmosDB = await CosmosDBAccount("cosmos-update", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          tags: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(cosmosDB.tags).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account with Resource Group object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-rgobj-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-rgobj`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-rgobj-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-rgobj", {
          name: cosmosDBAccountName,
          resourceGroup: rg, // Use object reference
          kind: "GlobalDocumentDB",
        });

        expect(cosmosDB.name).toBe(cosmosDBAccountName);
        expect(cosmosDB.resourceGroup).toBe(resourceGroupName);
        expect(cosmosDB.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account with Resource Group string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-rgstr-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-rgstr`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-rgstr-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-rgstr", {
          name: cosmosDBAccountName,
          resourceGroup: resourceGroupName, // Use string reference
          location: "eastus",
        });

        expect(cosmosDB.name).toBe(cosmosDBAccountName);
        expect(cosmosDB.resourceGroup).toBe(resourceGroupName);
        expect(cosmosDB.location).toBe("northeurope");
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing cosmos db account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-adopt-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-adopt`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-adopt-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Create first time
        cosmosDB = await CosmosDBAccount("cosmos-adopt", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          tags: {
            environment: "test",
          },
        });

        const originalId = cosmosDB.cosmosDBAccountId;

        // Try to create again with adopt flag
        cosmosDB = await CosmosDBAccount("cosmos-adopt-2", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          adopt: true,
          tags: {
            environment: "test",
            adopted: "true",
          },
        });

        // Should be the same account
        expect(cosmosDB.cosmosDBAccountId).toBe(originalId);
        expect(cosmosDB.tags).toEqual({
          environment: "test",
          adopted: "true",
        });
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-validate-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("cosmos-validate-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test name too short
        await expect(async () => {
          await CosmosDBAccount("cosmos-short", {
            name: "ab",
            resourceGroup: rg,
          });
        }).rejects.toThrow("must be 3-44 characters long");

        // Test name too long
        await expect(async () => {
          await CosmosDBAccount("cosmos-long", {
            name: "a".repeat(45),
            resourceGroup: rg,
          });
        }).rejects.toThrow("must be 3-44 characters long");

        // Test invalid characters
        await expect(async () => {
          await CosmosDBAccount("cosmos-invalid", {
            name: "invalid_name",
            resourceGroup: rg,
          });
        }).rejects.toThrow(
          "must contain only lowercase letters, numbers, and hyphens",
        );
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-default-rg`;

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount | undefined;
      try {
        rg = await ResourceGroup("cosmos-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-default", {
          resourceGroup: rg,
        });

        // Should have auto-generated name
        expect(cosmosDB.name).toBeTruthy();
        expect(cosmosDB.name.length).toBeGreaterThan(0);
        expect(cosmosDB.name.length).toBeLessThanOrEqual(44);
      } finally {
        await destroy(scope);
        if (cosmosDB) {
          await assertCosmosDBAccountDoesNotExist(
            resourceGroupName,
            cosmosDB.name,
          );
        }
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account with MongoDB API", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-mongo-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-mongo`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-mongo-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-mongo", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          kind: "MongoDB",
        });

        expect(cosmosDB.kind).toBe("MongoDB");
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cosmos db account serverless mode", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-serverless-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-serverless`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-serverless-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cosmosDB = await CosmosDBAccount("cosmos-serverless", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          serverless: true,
        });

        expect(cosmosDB.serverless).toBe(true);
      } finally {
        await destroy(scope);
        await assertCosmosDBAccountDoesNotExist(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves cosmos db account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cosmos-preserve-rg`;
      const cosmosDBAccountName = `${BRANCH_PREFIX}-cosmos-preserve`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 44);

      let rg: ResourceGroup;
      let cosmosDB: CosmosDBAccount;
      try {
        rg = await ResourceGroup("cosmos-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
          delete: false,
        });

        cosmosDB = await CosmosDBAccount("cosmos-preserve", {
          name: cosmosDBAccountName,
          resourceGroup: rg,
          delete: false,
        });

        expect(cosmosDB.name).toBe(cosmosDBAccountName);
      } finally {
        // This should not delete the Cosmos DB account
        await destroy(scope);

        // Verify account still exists
        const clients = await createAzureClients();
        const account = await clients.cosmosDB.databaseAccounts.get(
          resourceGroupName,
          cosmosDBAccountName,
        );
        expect(account.name).toBe(cosmosDBAccountName);

        // Clean up manually
        await clients.cosmosDB.databaseAccounts.beginDeleteAndWait(
          resourceGroupName,
          cosmosDBAccountName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });
});

/**
 * Helper function to verify a Cosmos DB account doesn't exist
 */
async function assertCosmosDBAccountDoesNotExist(
  resourceGroupName: string,
  cosmosDBAccountName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.cosmosDB.databaseAccounts.get(
      resourceGroupName,
      cosmosDBAccountName,
    );
    throw new Error(
      `Cosmos DB account ${cosmosDBAccountName} still exists in resource group ${resourceGroupName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "NotFound") {
      // Expected - account doesn't exist
      return;
    }
    throw error;
  }
}

/**
 * Helper function to verify a resource group doesn't exist
 */
async function assertResourceGroupDoesNotExist(resourceGroupName: string) {
  const clients = await createAzureClients();
  try {
    await clients.resources.resourceGroups.get(resourceGroupName);
    throw new Error(`Resource group ${resourceGroupName} still exists`);
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceGroupNotFound") {
      // Expected - resource group doesn't exist
      return;
    }
    throw error;
  }
}

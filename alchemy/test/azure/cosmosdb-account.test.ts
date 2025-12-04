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

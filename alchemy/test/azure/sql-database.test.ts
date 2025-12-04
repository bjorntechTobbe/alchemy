import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { SqlServer } from "../../src/azure/sql-server.ts";
import { SqlDatabase } from "../../src/azure/sql-database.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure SQL", () => {
  describe("SqlServer", () => {
    test("create sql server", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-create-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-server-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-server-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-server-create", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(sqlServer.name).toBe(sqlServerName);
        expect(sqlServer.location).toBe("eastus");
        expect(sqlServer.resourceGroup).toBe(resourceGroupName);
        expect(sqlServer.administratorLogin).toBe("sqladmin");
        expect(sqlServer.version).toBe("12.0");
        expect(sqlServer.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(sqlServer.sqlServerId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Sql/servers/${sqlServerName}`,
          ),
        );
        expect(sqlServer.fullyQualifiedDomainName).toBe(
          `${sqlServerName}.database.windows.net`,
        );
        expect(sqlServer.administratorPassword).toBeDefined();
        expect(sqlServer.type).toBe("sql-server");
      } finally {
        await destroy(scope);
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update sql server tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-update-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-server-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-server-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create SQL server
        sqlServer = await SqlServer("sql-server-update", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          tags: {
            environment: "test",
          },
        });

        expect(sqlServer.tags).toEqual({
          environment: "test",
        });

        // Update tags
        sqlServer = await SqlServer("sql-server-update", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          tags: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(sqlServer.tags).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("sql server with Resource Group object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-rgobj-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-server-rgobj`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-server-rgobj-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-server-rgobj", {
          name: sqlServerName,
          resourceGroup: rg, // Use object reference
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        expect(sqlServer.name).toBe(sqlServerName);
        expect(sqlServer.resourceGroup).toBe(resourceGroupName);
        expect(sqlServer.location).toBe("centralus");
      } finally {
        await destroy(scope);
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("sql server name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-validate-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("sql-server-validate-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test forbidden administrator login
        await expect(async () => {
          await SqlServer("sql-server-forbidden", {
            name: "test-sql-server",
            resourceGroup: rg,
            administratorLogin: "admin",
            administratorPassword: alchemy.secret("TestPassword123!"),
          });
        }).rejects.toThrow("is not allowed");
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves sql server", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-preserve-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-server-preserve`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-server-preserve-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        sqlServer = await SqlServer("sql-server-preserve", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          delete: false,
        });

        expect(sqlServer.name).toBe(sqlServerName);
      } finally {
        // This should not delete the SQL server
        await destroy(scope);

        // Verify server still exists
        const clients = await createAzureClients();
        const server = await clients.sql.servers.get(
          resourceGroupName,
          sqlServerName,
        );
        expect(server.name).toBe(sqlServerName);

        // Clean up manually
        await clients.sql.servers.beginDeleteAndWait(
          resourceGroupName,
          sqlServerName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });

  describe("SqlDatabase", () => {
    test("create sql database", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-create-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-create-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      const databaseName = `${BRANCH_PREFIX}-sql-db-create`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      let database: SqlDatabase;
      try {
        rg = await ResourceGroup("sql-db-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-db-create-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        database = await SqlDatabase("sql-db-create", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServer,
          sku: "Basic",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(database.name).toBe(databaseName);
        expect(database.location).toBe("eastus");
        expect(database.resourceGroup).toBe(resourceGroupName);
        expect(database.sqlServer).toBe(sqlServerName);
        expect(database.sku).toBe("Basic");
        expect(database.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(database.databaseId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.Sql/servers/${sqlServerName}/databases/${databaseName}`,
          ),
        );
        expect(database.connectionString).toBeDefined();
        expect(database.type).toBe("sql-database");
      } finally {
        await destroy(scope);
        await assertSqlDatabaseDoesNotExist(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update sql database tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-update-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-update-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      const databaseName = `${BRANCH_PREFIX}-sql-db-update`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      let database: SqlDatabase;
      try {
        rg = await ResourceGroup("sql-db-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-db-update-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        // Create database
        database = await SqlDatabase("sql-db-update", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServer,
          tags: {
            environment: "test",
          },
        });

        expect(database.tags).toEqual({
          environment: "test",
        });

        // Update tags
        database = await SqlDatabase("sql-db-update", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServer,
          tags: {
            environment: "test",
            updated: "true",
            version: "2",
          },
        });

        expect(database.tags).toEqual({
          environment: "test",
          updated: "true",
          version: "2",
        });
      } finally {
        await destroy(scope);
        await assertSqlDatabaseDoesNotExist(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("sql database with SqlServer string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-srvstr-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-srvstr-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      const databaseName = `${BRANCH_PREFIX}-sql-db-srvstr`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      let database: SqlDatabase;
      try {
        rg = await ResourceGroup("sql-db-srvstr-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-db-srvstr-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        database = await SqlDatabase("sql-db-srvstr", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServerName, // Use string reference
          location: "eastus",
        });

        expect(database.name).toBe(databaseName);
        expect(database.sqlServer).toBe(sqlServerName);
        expect(database.location).toBe("centralus");
      } finally {
        await destroy(scope);
        await assertSqlDatabaseDoesNotExist(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("sql database with premium tier", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-premium-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-premium-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      const databaseName = `${BRANCH_PREFIX}-sql-db-premium`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      let database: SqlDatabase;
      try {
        rg = await ResourceGroup("sql-db-premium-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-db-premium-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        database = await SqlDatabase("sql-db-premium", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServer,
          sku: "P1",
          readScale: "Enabled",
        });

        expect(database.sku).toBe("P1");
        expect(database.readScale).toBe("Enabled");
      } finally {
        await destroy(scope);
        await assertSqlDatabaseDoesNotExist(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("sql database name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-validate-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-validate-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-db-validate-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-db-validate-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
        });

        // Test forbidden database name
        await expect(async () => {
          await SqlDatabase("sql-db-forbidden", {
            name: "master",
            resourceGroup: rg,
            sqlServer: sqlServer,
          });
        }).rejects.toThrow("is reserved");
      } finally {
        await destroy(scope);
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves sql database", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-db-preserve-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-db-preserve-srv`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      const databaseName = `${BRANCH_PREFIX}-sql-db-preserve`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      let database: SqlDatabase;
      try {
        rg = await ResourceGroup("sql-db-preserve-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        sqlServer = await SqlServer("sql-db-preserve-srv", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          delete: false,
        });

        database = await SqlDatabase("sql-db-preserve", {
          name: databaseName,
          resourceGroup: rg,
          sqlServer: sqlServer,
          delete: false,
        });

        expect(database.name).toBe(databaseName);
      } finally {
        // This should not delete the database or server
        await destroy(scope);

        // Verify database and server still exist
        const clients = await createAzureClients();
        const db = await clients.sql.databases.get(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        expect(db.name).toBe(databaseName);

        const server = await clients.sql.servers.get(
          resourceGroupName,
          sqlServerName,
        );
        expect(server.name).toBe(sqlServerName);

        // Clean up manually
        await clients.sql.databases.beginDeleteAndWait(
          resourceGroupName,
          sqlServerName,
          databaseName,
        );
        await clients.sql.servers.beginDeleteAndWait(
          resourceGroupName,
          sqlServerName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });
});

/**
 * Helper function to verify a SQL server doesn't exist
 */
async function assertSqlServerDoesNotExist(
  resourceGroupName: string,
  sqlServerName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.sql.servers.get(resourceGroupName, sqlServerName);
    throw new Error(
      `SQL server ${sqlServerName} still exists in resource group ${resourceGroupName}`,
    );
  } catch (error) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      // Expected - server doesn't exist
      return;
    }
    throw error;
  }
}

/**
 * Helper function to verify a SQL database doesn't exist
 */
async function assertSqlDatabaseDoesNotExist(
  resourceGroupName: string,
  sqlServerName: string,
  databaseName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.sql.databases.get(
      resourceGroupName,
      sqlServerName,
      databaseName,
    );
    throw new Error(
      `SQL database ${databaseName} still exists in server ${sqlServerName}`,
    );
  } catch (error) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      // Expected - database doesn't exist
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
  } catch (error) {
    if (error.statusCode === 404 || error.code === "ResourceGroupNotFound") {
      // Expected - resource group doesn't exist
      return;
    }
    throw error;
  }
}

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { SqlServer } from "../../src/azure/sql-server.ts";
import { SqlDatabase } from "../../src/azure/sql-database.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertSqlServerDoesNotExist,
  assertSqlDatabaseDoesNotExist,
  assertResourceGroupDoesNotExist,
} from "./test-helpers.ts";

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

    test("sql server with firewall rules", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-sql-server-fw-rg`;
      const sqlServerName = `${BRANCH_PREFIX}-sql-server-fw`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);

      let rg: ResourceGroup;
      let sqlServer: SqlServer;
      try {
        rg = await ResourceGroup("sql-server-fw-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        sqlServer = await SqlServer("sql-server-fw", {
          name: sqlServerName,
          resourceGroup: rg,
          administratorLogin: "sqladmin",
          administratorPassword: alchemy.secret("TestPassword123!"),
          publicNetworkAccess: "Enabled",
        });

        expect(sqlServer.publicNetworkAccess).toBe("Enabled");
      } finally {
        await destroy(scope);
        await assertSqlServerDoesNotExist(resourceGroupName, sqlServerName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
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
  });
});

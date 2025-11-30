import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { SqlServer } from "./sql-server.ts";
import type { Database } from "@azure/arm-sql";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface SqlDatabaseProps extends AzureClientProps {
  /**
   * Name of the SQL database
   * Must be 1-128 characters
   * Cannot be special system database names
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this database in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * The SQL server to create this database in
   * Can be a SqlServer object or the name of an existing SQL server
   */
  sqlServer: string | SqlServer;

  /**
   * Azure region for this database
   * @default Inherited from SQL server if not specified
   */
  location?: string;

  /**
   * The SKU (service tier) for the database
   * Format: {tier}_{compute}
   * @default "Basic"
   */
  sku?:
    | "Basic" // Basic tier (5 DTUs, 2GB max)
    | "S0" // Standard S0 (10 DTUs)
    | "S1" // Standard S1 (20 DTUs)
    | "S2" // Standard S2 (50 DTUs)
    | "S3" // Standard S3 (100 DTUs)
    | "P1" // Premium P1 (125 DTUs)
    | "P2" // Premium P2 (250 DTUs)
    | "P4" // Premium P4 (500 DTUs)
    | "P6" // Premium P6 (1000 DTUs)
    | "GP_Gen5_2" // General Purpose Gen5 2 vCores
    | "GP_Gen5_4" // General Purpose Gen5 4 vCores
    | "GP_Gen5_8" // General Purpose Gen5 8 vCores
    | "BC_Gen5_2" // Business Critical Gen5 2 vCores
    | "BC_Gen5_4" // Business Critical Gen5 4 vCores
    | "HS_Gen5_2"; // Hyperscale Gen5 2 vCores

  /**
   * Maximum size of the database in bytes
   * @example 1073741824 // 1GB
   * @example 10737418240 // 10GB
   */
  maxSizeBytes?: number;

  /**
   * Collation of the database
   * @default "SQL_Latin1_General_CP1_CI_AS"
   */
  collation?: string;

  /**
   * Enable zone redundancy for the database
   * @default false
   */
  zoneRedundant?: boolean;

  /**
   * Enable read scale-out (read-only replicas)
   * Only available on Premium and Business Critical tiers
   * @default false
   */
  readScale?: "Enabled" | "Disabled";

  /**
   * Tags to apply to the database
   * @example { environment: "production", purpose: "app-data" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing database
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the database when removed from Alchemy
   * WARNING: Deleting a database deletes ALL data in it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal database ID for lifecycle management
   * @internal
   */
  databaseId?: string;
}

export type SqlDatabase = Omit<
  SqlDatabaseProps,
  "delete" | "adopt" | "sqlServer"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The database name (required in output)
   */
  name: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * The SQL server name (required in output)
   */
  sqlServer: string;

  /**
   * Azure region (required in output)
   */
  location: string;

  /**
   * The database ID
   */
  databaseId: string;

  /**
   * The SKU (service tier) for the database
   */
  sku:
    | "Basic"
    | "S0"
    | "S1"
    | "S2"
    | "S3"
    | "P1"
    | "P2"
    | "P4"
    | "P6"
    | "GP_Gen5_2"
    | "GP_Gen5_4"
    | "GP_Gen5_8"
    | "BC_Gen5_2"
    | "BC_Gen5_4"
    | "HS_Gen5_2"
    | string;

  /**
   * Connection string for the database
   * Format: Server=tcp:{server}.database.windows.net,1433;Database={database};
   */
  connectionString: Secret;

  /**
   * Resource type identifier for bindings
   * @internal
   */
  type: "sql-database";
};

/**
 * SQL Database - Managed SQL database
 *
 * Azure SQL Database is a fully managed relational database service.
 * It provides high availability, automated backups, and elastic scaling.
 *
 * Equivalent to AWS RDS for SQL Server or self-hosted SQL Server databases.
 *
 * @example
 * ## Basic SQL Database
 *
 * Create a basic SQL database:
 *
 * ```typescript
 * import { ResourceGroup, SqlServer, SqlDatabase } from "alchemy/azure";
 *
 * const rg = await ResourceGroup("my-rg", {
 *   location: "eastus"
 * });
 *
 * const sqlServer = await SqlServer("my-sql-server", {
 *   resourceGroup: rg,
 *   administratorLogin: "sqladmin",
 *   administratorPassword: alchemy.secret.env.SQL_PASSWORD,
 * });
 *
 * const database = await SqlDatabase("my-database", {
 *   resourceGroup: rg,
 *   sqlServer: sqlServer,
 * });
 *
 * console.log("Connection String:", database.connectionString);
 * ```
 *
 * @example
 * ## Premium SQL Database
 *
 * Create a premium SQL database with zone redundancy:
 *
 * ```typescript
 * const database = await SqlDatabase("premium-db", {
 *   resourceGroup: rg,
 *   sqlServer: sqlServer,
 *   sku: "P1",
 *   zoneRedundant: true,
 *   readScale: "Enabled",
 * });
 * ```
 *
 * @example
 * ## Serverless SQL Database
 *
 * Create a serverless SQL database (General Purpose):
 *
 * ```typescript
 * const database = await SqlDatabase("serverless-db", {
 *   resourceGroup: rg,
 *   sqlServer: sqlServer,
 *   sku: "GP_Gen5_2",
 *   maxSizeBytes: 10737418240, // 10GB
 * });
 * ```
 *
 * @example
 * ## Large Database
 *
 * Create a large database with custom collation:
 *
 * ```typescript
 * const database = await SqlDatabase("large-db", {
 *   resourceGroup: rg,
 *   sqlServer: sqlServer,
 *   sku: "S3",
 *   maxSizeBytes: 107374182400, // 100GB
 *   collation: "SQL_Latin1_General_CP1_CI_AS",
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Database
 *
 * Adopt an existing SQL database:
 *
 * ```typescript
 * const database = await SqlDatabase("existing-db", {
 *   name: "my-existing-database",
 *   resourceGroup: "my-existing-rg",
 *   sqlServer: "my-existing-sql-server",
 *   adopt: true,
 * });
 * ```
 */
export const SqlDatabase = Resource(
  "azure::SqlDatabase",
  async function (
    this: Context<SqlDatabase>,
    id: string,
    props: SqlDatabaseProps,
  ): Promise<SqlDatabase> {
    const databaseId = props.databaseId || this.output?.databaseId;
    const adopt = props.adopt ?? this.scope.adopt;

    // Generate name with constraints
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (name.length < 1 || name.length > 128) {
      throw new Error(`Database name "${name}" must be 1-128 characters long`);
    }

    const forbiddenNames = ["master", "tempdb", "model", "msdb"];
    if (forbiddenNames.includes(name.toLowerCase())) {
      throw new Error(
        `Database name "${name}" is reserved. Forbidden names: ${forbiddenNames.join(", ")}`,
      );
    }

    const sqlServerName =
      typeof props.sqlServer === "string"
        ? props.sqlServer
        : props.sqlServer.name;

    if (this.scope.local) {
      const resourceGroupName =
        typeof props.resourceGroup === "string"
          ? props.resourceGroup
          : props.resourceGroup.name;

      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        sqlServer: sqlServerName,
        location: props.location || "local",
        databaseId: databaseId || `local-sql-database-${id}`,
        sku: props.sku || "Basic",
        connectionString: Secret.wrap(
          `Server=tcp:${sqlServerName}.database.windows.net,1433;Database=${name};`,
        ),
        maxSizeBytes: props.maxSizeBytes,
        collation: props.collation,
        zoneRedundant: props.zoneRedundant,
        readScale: props.readScale,
        tags: props.tags,
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "sql-database",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (!databaseId) {
        console.warn(`No databaseId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        const resourceGroupName =
          typeof props.resourceGroup === "string"
            ? props.resourceGroup
            : props.resourceGroup.name;

        try {
          await clients.sql.databases.beginDeleteAndWait(
            resourceGroupName,
            sqlServerName,
            name,
          );
        } catch (error) {
          if (!isNotFoundError(error)) {
            console.error(`Error deleting database ${name}:`, error);
            throw error;
          }
          // 404 means already deleted, which is fine
        }
      }
      return this.destroy();
    }

    // Get resource group name and location
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    let location = props.location;
    if (!location && typeof props.sqlServer !== "string") {
      location = props.sqlServer.location;
    }
    if (!location && typeof props.resourceGroup !== "string") {
      location = props.resourceGroup.location;
    }
    if (!location) {
      throw new Error(
        "Location is required. Provide it via props, SQL server, or resource group.",
      );
    }

    const databaseParams: Record<string, unknown> = {
      location,
      sku: {
        name: props.sku || "Basic",
        tier: props.sku ? getSkuTier(props.sku) : "Basic",
      },
      collation: props.collation || "SQL_Latin1_General_CP1_CI_AS",
      maxSizeBytes: props.maxSizeBytes,
      zoneRedundant: props.zoneRedundant ?? false,
      readScale: props.readScale || "Disabled",
      tags: props.tags,
    };

    let result: Database;

    if (databaseId) {
      result = await clients.sql.databases.beginCreateOrUpdateAndWait(
        resourceGroupName,
        sqlServerName,
        name,
        databaseParams,
      );
    } else {
      try {
        result = await clients.sql.databases.beginCreateOrUpdateAndWait(
          resourceGroupName,
          sqlServerName,
          name,
          databaseParams,
        );
      } catch (error) {
        if (
          error.code === "DatabaseAlreadyExists" ||
          error.code === "ConflictingDatabaseOperation"
        ) {
          if (!adopt) {
            throw new Error(
              `Database "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Fetch existing database
          result = await clients.sql.databases.get(
            resourceGroupName,
            sqlServerName,
            name,
          );

          // Update it with new configuration
          result = await clients.sql.databases.beginCreateOrUpdateAndWait(
            resourceGroupName,
            sqlServerName,
            name,
            databaseParams,
          );
        } else {
          throw error;
        }
      }
    }

    const connectionString = `Server=tcp:${sqlServerName}.database.windows.net,1433;Database=${name};`;

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      sqlServer: sqlServerName,
      location: result.location!,
      databaseId: result.id!,
      sku: (result.sku?.name as any) || props.sku || "Basic",
      connectionString: Secret.wrap(connectionString),
      maxSizeBytes: props.maxSizeBytes,
      collation: props.collation,
      zoneRedundant: props.zoneRedundant,
      readScale: props.readScale,
      tags: props.tags,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "sql-database",
    };
  },
);

/**
 * Helper function to get the tier from a SKU name
 */
function getSkuTier(sku: string): string {
  if (sku === "Basic") return "Basic";
  if (sku.startsWith("S")) return "Standard";
  if (sku.startsWith("P") && !sku.includes("_")) return "Premium";
  if (sku.startsWith("GP_")) return "GeneralPurpose";
  if (sku.startsWith("BC_")) return "BusinessCritical";
  if (sku.startsWith("HS_")) return "Hyperscale";
  return "GeneralPurpose";
}

/**
 * Type guard to check if a resource is a SqlDatabase
 */
export function isSqlDatabase(resource: unknown): resource is SqlDatabase {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::SqlDatabase"
  );
}

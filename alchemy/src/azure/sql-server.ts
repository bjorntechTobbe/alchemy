import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { Server } from "@azure/arm-sql";

export interface SqlServerProps extends AzureClientProps {
  /**
   * Name of the SQL server
   * Must be 1-63 characters, lowercase letters, numbers, and hyphens only
   * Must be globally unique across all of Azure (creates {name}.database.windows.net)
   * @default ${app}-${stage}-${id} (lowercase, alphanumeric + hyphens)
   */
  name?: string;

  /**
   * The resource group to create this SQL server in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this SQL server
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Administrator login username
   * Must be 1-128 characters
   * Cannot be 'admin', 'administrator', 'sa', 'root', 'dbmanager', 'loginmanager', etc.
   */
  administratorLogin: string;

  /**
   * Administrator login password
   * Must be 8-128 characters
   * Must contain characters from three of the following categories: uppercase, lowercase, digits, non-alphanumeric
   * Use alchemy.secret() to securely store this value
   */
  administratorPassword: string | Secret;

  /**
   * SQL Server version
   * @default "12.0" (SQL Server 2014)
   */
  version?: "2.0" | "12.0";

  /**
   * Minimum TLS version required
   * @default "1.2"
   */
  minimalTlsVersion?: "1.0" | "1.1" | "1.2";

  /**
   * Enable Azure AD authentication only (disable SQL authentication)
   * @default false
   */
  azureADOnlyAuthentication?: boolean;

  /**
   * Public network access setting
   * @default "Enabled"
   */
  publicNetworkAccess?: "Enabled" | "Disabled";

  /**
   * Tags to apply to the SQL server
   * @example { environment: "production", purpose: "app-database" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing SQL server
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the SQL server when removed from Alchemy
   * WARNING: Deleting a SQL server deletes ALL databases in it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal SQL server ID for lifecycle management
   * @internal
   */
  sqlServerId?: string;
}

export type SqlServer = Omit<
  SqlServerProps,
  "delete" | "adopt" | "administratorPassword"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The SQL server name (required in output)
   */
  name: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * Azure region (required in output)
   */
  location: string;

  /**
   * The SQL server ID
   */
  sqlServerId: string;

  /**
   * The fully qualified domain name of the SQL server
   * Format: {name}.database.windows.net
   */
  fullyQualifiedDomainName: string;

  /**
   * Administrator login password (wrapped in Secret)
   */
  administratorPassword: Secret;

  /**
   * SQL Server version
   */
  version: "2.0" | "12.0";

  /**
   * Resource type identifier for bindings
   * @internal
   */
  type: "sql-server";
};

/**
 * SQL Server - Managed SQL Server database server
 *
 * Azure SQL Server is a logical server for Azure SQL databases.
 * It provides a centralized point for administration, authentication,
 * and firewall rules for multiple SQL databases.
 *
 * Equivalent to AWS RDS for SQL Server or self-hosted SQL Server.
 *
 * @example
 * ## Basic SQL Server
 *
 * Create a basic SQL server:
 *
 * ```typescript
 * import { ResourceGroup, SqlServer } from "alchemy/azure";
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
 * console.log("Server:", sqlServer.fullyQualifiedDomainName);
 * ```
 *
 * @example
 * ## SQL Server with Firewall Rules
 *
 * Create a SQL server with public access disabled:
 *
 * ```typescript
 * const sqlServer = await SqlServer("secure-sql", {
 *   resourceGroup: rg,
 *   administratorLogin: "sqladmin",
 *   administratorPassword: alchemy.secret.env.SQL_PASSWORD,
 *   publicNetworkAccess: "Disabled",
 * });
 * ```
 *
 * @example
 * ## SQL Server with Azure AD Authentication
 *
 * Create a SQL server with Azure AD only authentication:
 *
 * ```typescript
 * const sqlServer = await SqlServer("aad-sql", {
 *   resourceGroup: rg,
 *   administratorLogin: "sqladmin",
 *   administratorPassword: alchemy.secret.env.SQL_PASSWORD,
 *   azureADOnlyAuthentication: true,
 * });
 * ```
 *
 * @example
 * ## Adopt Existing SQL Server
 *
 * Adopt an existing SQL server:
 *
 * ```typescript
 * const sqlServer = await SqlServer("existing-sql", {
 *   name: "my-existing-sql-server",
 *   resourceGroup: "my-existing-rg",
 *   administratorLogin: "sqladmin",
 *   administratorPassword: alchemy.secret.env.SQL_PASSWORD,
 *   adopt: true,
 * });
 * ```
 */
export const SqlServer = Resource(
  "azure::SqlServer",
  async function (
    this: Context<SqlServer>,
    id: string,
    props: SqlServerProps,
  ): Promise<SqlServer> {
    const sqlServerId = props.sqlServerId || this.output?.sqlServerId;
    const adopt = props.adopt ?? this.scope.adopt;

    // Generate name with constraints: 1-63 chars, lowercase, alphanumeric + hyphens
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 63);

    // Validate name
    if (name.length < 1 || name.length > 63) {
      throw new Error(`SQL server name "${name}" must be 1-63 characters long`);
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `SQL server name "${name}" must contain only lowercase letters, numbers, and hyphens`,
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `SQL server name "${name}" cannot start or end with a hyphen`,
      );
    }

    // Validate administrator login
    const forbiddenLogins = [
      "admin",
      "administrator",
      "sa",
      "root",
      "dbmanager",
      "loginmanager",
      "dbo",
      "guest",
      "public",
    ];
    if (forbiddenLogins.includes(props.administratorLogin.toLowerCase())) {
      throw new Error(
        `Administrator login "${props.administratorLogin}" is not allowed. ` +
          `Forbidden logins: ${forbiddenLogins.join(", ")}`,
      );
    }

    // Local development mode
    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup:
          typeof props.resourceGroup === "string"
            ? props.resourceGroup
            : props.resourceGroup.name,
        location: props.location || "local",
        sqlServerId: sqlServerId || `local-sql-server-${id}`,
        fullyQualifiedDomainName: `${name}.database.windows.net`,
        administratorLogin: props.administratorLogin,
        administratorPassword:
          typeof props.administratorPassword === "string"
            ? Secret.wrap(props.administratorPassword)
            : props.administratorPassword,
        version: props.version || "12.0",
        minimalTlsVersion: props.minimalTlsVersion,
        azureADOnlyAuthentication: props.azureADOnlyAuthentication,
        publicNetworkAccess: props.publicNetworkAccess,
        tags: props.tags,
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "sql-server",
      };
    }

    const clients = await createAzureClients(props);

    // Handle deletion
    if (this.phase === "delete") {
      if (!sqlServerId) {
        console.warn(`No sqlServerId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        const resourceGroupName =
          typeof props.resourceGroup === "string"
            ? props.resourceGroup
            : props.resourceGroup.name;

        try {
          await clients.sql.servers.beginDeleteAndWait(resourceGroupName, name);
        } catch (error: any) {
          if (error.statusCode !== 404) {
            console.error(`Error deleting SQL server ${name}:`, error);
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
    if (!location && typeof props.resourceGroup !== "string") {
      location = props.resourceGroup.location;
    }
    if (!location) {
      throw new Error(
        "Location is required. Provide it via props or resource group.",
      );
    }

    // Prepare server creation parameters
    const serverParams = {
      location,
      administratorLogin: props.administratorLogin,
      administratorLoginPassword: Secret.unwrap(props.administratorPassword),
      version: props.version || "12.0",
      minimalTlsVersion: props.minimalTlsVersion || "1.2",
      publicNetworkAccess: props.publicNetworkAccess || "Enabled",
      administrators: props.azureADOnlyAuthentication
        ? {
            azureADOnlyAuthentication: true,
          }
        : undefined,
      tags: props.tags,
    };

    let result: Server;

    if (sqlServerId) {
      // Update existing server
      result = await clients.sql.servers.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        serverParams,
      );
    } else {
      // Create new server
      try {
        result = await clients.sql.servers.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          serverParams,
        );
      } catch (error: any) {
        if (
          error.code === "ServerAlreadyExists" ||
          error.code === "ConflictingServerOperation"
        ) {
          if (!adopt) {
            throw new Error(
              `SQL server "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Fetch existing server
          result = await clients.sql.servers.get(resourceGroupName, name);

          // Update it with new configuration (but skip password on update)
          const updateParams = { ...serverParams };
          delete (updateParams as any).administratorLoginPassword;
          result = await clients.sql.servers.beginCreateOrUpdateAndWait(
            resourceGroupName,
            name,
            updateParams,
          );
        } else {
          throw error;
        }
      }
    }

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      location: result.location!,
      sqlServerId: result.id!,
      fullyQualifiedDomainName: result.fullyQualifiedDomainName || "",
      administratorLogin: props.administratorLogin,
      administratorPassword:
        typeof props.administratorPassword === "string"
          ? Secret.wrap(props.administratorPassword)
          : props.administratorPassword,
      version: (result.version as any) || "12.0",
      minimalTlsVersion: props.minimalTlsVersion,
      azureADOnlyAuthentication: props.azureADOnlyAuthentication,
      publicNetworkAccess: props.publicNetworkAccess,
      tags: props.tags,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "sql-server",
    };
  },
);

/**
 * Type guard to check if a resource is a SqlServer
 */
export function isSqlServer(resource: any): resource is SqlServer {
  return resource?.[ResourceKind] === "azure::SqlServer";
}

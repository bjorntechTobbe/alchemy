import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { DatabaseAccountGetResults } from "@azure/arm-cosmosdb";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface CosmosDBAccountProps extends AzureClientProps {
  /**
   * Name of the Cosmos DB account
   * Must be 3-44 characters, lowercase letters, numbers, and hyphens only
   * Must be globally unique across all of Azure
   * @default ${app}-${stage}-${id} (lowercase, alphanumeric + hyphens)
   */
  name?: string;

  /**
   * The resource group to create this Cosmos DB account in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this Cosmos DB account
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The API to use for Cosmos DB
   * @default "Sql" (Core SQL API - recommended for most use cases)
   */
  kind?: "GlobalDocumentDB" | "MongoDB" | "Cassandra" | "Gremlin" | "Table";

  /**
   * The default consistency level for the Cosmos DB account
   * @default "Session"
   */
  consistencyLevel?:
    | "Eventual" // Lowest consistency, highest performance
    | "ConsistentPrefix" // Reads never see out-of-order writes
    | "Session" // Consistent within a single session (default)
    | "BoundedStaleness" // Reads lag behind writes by bounded time/operations
    | "Strong"; // Highest consistency, lowest performance

  /**
   * Enable automatic failover for multi-region accounts
   * @default true
   */
  enableAutomaticFailover?: boolean;

  /**
   * Enable multiple write locations (multi-master)
   * @default false
   */
  enableMultipleWriteLocations?: boolean;

  /**
   * Additional regions to replicate data to
   * @example ["westus", "eastus", "northeurope"]
   */
  locations?: string[];

  /**
   * Enable free tier (400 RU/s and 5GB storage free)
   * Can only be enabled on one Cosmos DB account per subscription
   * @default false
   */
  enableFreeTier?: boolean;

  /**
   * Enable serverless mode (pay per request, no provisioned throughput)
   * Cannot be used with enableAutomaticFailover or locations
   * @default false
   */
  serverless?: boolean;

  /**
   * Public network access setting
   * @default "Enabled"
   */
  publicNetworkAccess?: "Enabled" | "Disabled";

  /**
   * Minimum TLS version required
   * @default "Tls12"
   */
  minimalTlsVersion?: "Tls" | "Tls11" | "Tls12";

  /**
   * Enable analytical storage (Azure Synapse Link)
   * @default false
   */
  enableAnalyticalStorage?: boolean;

  /**
   * Tags to apply to the Cosmos DB account
   * @example { environment: "production", purpose: "app-data" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing Cosmos DB account
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the Cosmos DB account when removed from Alchemy
   * WARNING: Deleting a Cosmos DB account deletes ALL databases and data inside it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal Cosmos DB account ID for lifecycle management
   * @internal
   */
  cosmosDBAccountId?: string;
}

export type CosmosDBAccount = Omit<CosmosDBAccountProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The Cosmos DB account name (required in output)
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
   * The API kind for the account
   */
  kind: "GlobalDocumentDB" | "MongoDB" | "Cassandra" | "Gremlin" | "Table";

  /**
   * The Cosmos DB account ID
   */
  cosmosDBAccountId: string;

  /**
   * The primary connection string for the Cosmos DB account
   * Use this to connect to Cosmos DB from your application
   */
  connectionString: Secret;

  /**
   * The primary key for the Cosmos DB account
   */
  primaryKey: Secret;

  /**
   * The secondary key for the Cosmos DB account
   */
  secondaryKey: Secret;

  /**
   * The document endpoint URL for the Cosmos DB account
   */
  documentEndpoint: string;

  /**
   * Resource type identifier for bindings
   * @internal
   */
  type: "cosmosdb-account";
};

/**
 * Cosmos DB Account - Multi-model NoSQL database service
 *
 * Azure Cosmos DB is a globally distributed, multi-model database service.
 * It provides turnkey global distribution, elastic scaling, and multiple APIs
 * including SQL (Core), MongoDB, Cassandra, Gremlin, and Table.
 *
 * Equivalent to AWS DynamoDB or Cloudflare D1 (but more feature-rich).
 *
 * @example
 * ## Basic Cosmos DB Account
 *
 * Create a basic Cosmos DB account with SQL API:
 *
 * ```typescript
 * import { ResourceGroup, CosmosDBAccount } from "alchemy/azure";
 *
 * const rg = await ResourceGroup("my-rg", {
 *   location: "eastus"
 * });
 *
 * const cosmosDB = await CosmosDBAccount("my-cosmos", {
 *   resourceGroup: rg,
 * });
 *
 * console.log("Endpoint:", cosmosDB.documentEndpoint);
 * console.log("Connection String:", cosmosDB.connectionString);
 * ```
 *
 * @example
 * ## MongoDB API
 *
 * Create a Cosmos DB account with MongoDB API:
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("mongo-db", {
 *   resourceGroup: rg,
 *   kind: "MongoDB",
 * });
 * ```
 *
 * @example
 * ## Global Distribution
 *
 * Create a globally distributed Cosmos DB account:
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("global-db", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   locations: ["westus", "northeurope"],
 *   enableAutomaticFailover: true,
 *   enableMultipleWriteLocations: true,
 *   consistencyLevel: "Session",
 * });
 * ```
 *
 * @example
 * ## Serverless Mode
 *
 * Create a serverless Cosmos DB account (pay per request):
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("serverless-db", {
 *   resourceGroup: rg,
 *   serverless: true,
 * });
 * ```
 *
 * @example
 * ## Free Tier
 *
 * Enable free tier (400 RU/s and 5GB storage free):
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("free-db", {
 *   resourceGroup: rg,
 *   enableFreeTier: true,
 * });
 * ```
 *
 * @example
 * ## Strong Consistency
 *
 * Create a Cosmos DB account with strong consistency:
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("strong-db", {
 *   resourceGroup: rg,
 *   consistencyLevel: "Strong",
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Account
 *
 * Adopt an existing Cosmos DB account:
 *
 * ```typescript
 * const cosmosDB = await CosmosDBAccount("existing-db", {
 *   name: "my-existing-cosmosdb",
 *   resourceGroup: "my-existing-rg",
 *   adopt: true,
 * });
 * ```
 */
export const CosmosDBAccount = Resource(
  "azure::CosmosDBAccount",
  async function (
    this: Context<CosmosDBAccount>,
    id: string,
    props: CosmosDBAccountProps,
  ): Promise<CosmosDBAccount> {
    const cosmosDBAccountId =
      props.cosmosDBAccountId || this.output?.cosmosDBAccountId;
    const adopt = props.adopt ?? this.scope.adopt;

    // Generate name with constraints: 3-44 chars, lowercase, alphanumeric + hyphens
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 44);

    if (name.length < 3 || name.length > 44) {
      throw new Error(
        `Cosmos DB account name "${name}" must be 3-44 characters long`,
      );
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `Cosmos DB account name "${name}" must contain only lowercase letters, numbers, and hyphens`,
      );
    }

    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup:
          typeof props.resourceGroup === "string"
            ? props.resourceGroup
            : props.resourceGroup.name,
        location: props.location || "local",
        kind: props.kind || "GlobalDocumentDB",
        cosmosDBAccountId: cosmosDBAccountId || `local-cosmosdb-${id}`,
        connectionString: Secret.wrap("local-connection-string"),
        primaryKey: Secret.wrap("local-primary-key"),
        secondaryKey: Secret.wrap("local-secondary-key"),
        documentEndpoint: `https://${name}.documents.azure.com`,
        consistencyLevel: props.consistencyLevel,
        enableAutomaticFailover: props.enableAutomaticFailover,
        enableMultipleWriteLocations: props.enableMultipleWriteLocations,
        locations: props.locations,
        enableFreeTier: props.enableFreeTier,
        serverless: props.serverless,
        publicNetworkAccess: props.publicNetworkAccess,
        minimalTlsVersion: props.minimalTlsVersion,
        enableAnalyticalStorage: props.enableAnalyticalStorage,
        tags: props.tags,
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "cosmosdb-account",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (!cosmosDBAccountId) {
        console.warn(`No cosmosDBAccountId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        const resourceGroupName =
          typeof props.resourceGroup === "string"
            ? props.resourceGroup
            : props.resourceGroup.name;

        try {
          await clients.cosmosDB.databaseAccounts.beginDeleteAndWait(
            resourceGroupName,
            name,
          );
        } catch (error) {
          if (!isNotFoundError(error)) {
            console.error(`Error deleting Cosmos DB account ${name}:`, error);
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

    if (props.serverless) {
      if (props.enableAutomaticFailover) {
        throw new Error(
          "Serverless mode cannot be used with automatic failover",
        );
      }
      if (props.locations && props.locations.length > 0) {
        throw new Error(
          "Serverless mode cannot be used with multiple locations",
        );
      }
      if (props.enableMultipleWriteLocations) {
        throw new Error(
          "Serverless mode cannot be used with multiple write locations",
        );
      }
    }

    type Location = {
      locationName: string;
      failoverPriority: number;
      isZoneRedundant: boolean;
    };
    const locations: Location[] = [
      {
        locationName: location,
        failoverPriority: 0,
        isZoneRedundant: false,
      },
    ];
    if (props.locations) {
      props.locations.forEach((loc, index) => {
        locations.push({
          locationName: loc,
          failoverPriority: index + 1,
          isZoneRedundant: false,
        });
      });
    }

    const consistencyPolicy = {
      defaultConsistencyLevel: props.consistencyLevel || "Session",
    };

    type Capability = { name: string };
    const capabilities: Capability[] = [];
    if (props.serverless) {
      capabilities.push({ name: "EnableServerless" });
    }
    if (props.enableAnalyticalStorage) {
      capabilities.push({ name: "EnableAnalyticalStorage" });
    }

    const accountParams = {
      location,
      kind: props.kind || "GlobalDocumentDB",
      locations,
      databaseAccountOfferType: "Standard" as const,
      properties: {
        consistencyPolicy,
        enableAutomaticFailover: props.enableAutomaticFailover ?? false,
        enableMultipleWriteLocations:
          props.enableMultipleWriteLocations ?? false,
        enableFreeTier: props.enableFreeTier ?? false,
        publicNetworkAccess: props.publicNetworkAccess || "Enabled",
        minimalTlsVersion: props.minimalTlsVersion || "Tls12",
        capabilities: capabilities.length > 0 ? capabilities : undefined,
      },
      tags: props.tags,
    };

    let result: DatabaseAccountGetResults;

    if (cosmosDBAccountId) {
      result =
        await clients.cosmosDB.databaseAccounts.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          accountParams,
        );
    } else {
      try {
        result =
          await clients.cosmosDB.databaseAccounts.beginCreateOrUpdateAndWait(
            resourceGroupName,
            name,
            accountParams,
          );
      } catch (error: unknown) {
        if (isConflictError(error)) {
          if (!adopt) {
            throw new Error(
              `Cosmos DB account "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Fetch existing account
          result = await clients.cosmosDB.databaseAccounts.get(
            resourceGroupName,
            name,
          );

          // Update it with new configuration
          result =
            await clients.cosmosDB.databaseAccounts.beginCreateOrUpdateAndWait(
              resourceGroupName,
              name,
              accountParams,
            );
        } else {
          throw error;
        }
      }
    }

    const keys = await clients.cosmosDB.databaseAccounts.listKeys(
      resourceGroupName,
      name,
    );

    const connectionStrings =
      await clients.cosmosDB.databaseAccounts.listConnectionStrings(
        resourceGroupName,
        name,
      );

    const primaryConnectionString =
      connectionStrings.connectionStrings?.[0]?.connectionString || "";
    const primaryKey = keys.primaryMasterKey || "";
    const secondaryKey = keys.secondaryMasterKey || "";

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      location: result.location!,
      kind: (result.kind as any) || "GlobalDocumentDB",
      cosmosDBAccountId: result.id!,
      connectionString: Secret.wrap(primaryConnectionString),
      primaryKey: Secret.wrap(primaryKey),
      secondaryKey: Secret.wrap(secondaryKey),
      documentEndpoint: result.documentEndpoint || "",
      consistencyLevel: props.consistencyLevel,
      enableAutomaticFailover: props.enableAutomaticFailover,
      enableMultipleWriteLocations: props.enableMultipleWriteLocations,
      locations: props.locations,
      enableFreeTier: props.enableFreeTier,
      serverless: props.serverless,
      publicNetworkAccess: props.publicNetworkAccess,
      minimalTlsVersion: props.minimalTlsVersion,
      enableAnalyticalStorage: props.enableAnalyticalStorage,
      tags: props.tags,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "cosmosdb-account",
    };
  },
);

/**
 * Type guard to check if a resource is a CosmosDBAccount
 */
export function isCosmosDBAccount(
  resource: unknown,
): resource is CosmosDBAccount {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::CosmosDBAccount"
  );
}

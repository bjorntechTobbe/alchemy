import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { StorageAccount as AzureStorageAccount } from "@azure/arm-storage";

export interface StorageAccountProps extends AzureClientProps {
  /**
   * Name of the storage account
   * Must be 3-24 characters, lowercase letters and numbers only
   * Must be globally unique across all of Azure
   * @default ${app}-${stage}-${id} (lowercase, numbers only)
   */
  name?: string;

  /**
   * The resource group to create this storage account in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this storage account
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The SKU (pricing tier) for the storage account
   * @default "Standard_LRS"
   */
  sku?:
    | "Standard_LRS" // Locally redundant storage
    | "Standard_GRS" // Geo-redundant storage
    | "Standard_RAGRS" // Read-access geo-redundant storage
    | "Standard_ZRS" // Zone-redundant storage
    | "Premium_LRS" // Premium locally redundant storage
    | "Premium_ZRS"; // Premium zone-redundant storage

  /**
   * The kind of storage account
   * @default "StorageV2"
   */
  kind?: "StorageV2" | "BlobStorage" | "BlockBlobStorage" | "FileStorage";

  /**
   * Access tier for blob data (only applies to BlobStorage and StorageV2)
   * @default "Hot"
   */
  accessTier?: "Hot" | "Cool";

  /**
   * Enable hierarchical namespace for Data Lake Storage Gen2
   * @default false
   */
  enableHierarchicalNamespace?: boolean;

  /**
   * Enable blob public access
   * When false, anonymous access is disabled for all blobs and containers
   * @default false
   */
  allowBlobPublicAccess?: boolean;

  /**
   * Minimum TLS version required for storage requests
   * @default "TLS1_2"
   */
  minimumTlsVersion?: "TLS1_0" | "TLS1_1" | "TLS1_2";

  /**
   * Tags to apply to the storage account
   * @example { environment: "production", purpose: "app-storage" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing storage account
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the storage account when removed from Alchemy
   * WARNING: Deleting a storage account deletes ALL data inside it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal storage account ID for lifecycle management
   * @internal
   */
  storageAccountId?: string;
}

export type StorageAccount = Omit<StorageAccountProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The storage account name (required in output)
   */
  name: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * The Azure region (required in output)
   */
  location: string;

  /**
   * The Azure resource ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Storage/storageAccounts/{accountName}
   */
  storageAccountId: string;

  /**
   * Primary connection string for accessing the storage account
   * Use this to connect SDKs and applications to the storage account
   */
  primaryConnectionString: Secret;

  /**
   * Secondary connection string (if geo-redundant storage is enabled)
   */
  secondaryConnectionString?: Secret;

  /**
   * Primary access key
   */
  primaryAccessKey: Secret;

  /**
   * Secondary access key
   */
  secondaryAccessKey: Secret;

  /**
   * Primary blob endpoint
   * @example https://{accountName}.blob.core.windows.net/
   */
  primaryBlobEndpoint: string;

  /**
   * Primary file endpoint
   * @example https://{accountName}.file.core.windows.net/
   */
  primaryFileEndpoint?: string;

  /**
   * Primary queue endpoint
   * @example https://{accountName}.queue.core.windows.net/
   */
  primaryQueueEndpoint?: string;

  /**
   * Primary table endpoint
   * @example https://{accountName}.table.core.windows.net/
   */
  primaryTableEndpoint?: string;

  /**
   * The provisioning state of the storage account
   */
  provisioningState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::StorageAccount";
};

/**
 * Azure Storage Account - foundation for blob, file, queue, and table storage
 *
 * A Storage Account provides a unique namespace in Azure for storing data objects.
 * Storage Accounts support:
 * - Blob storage (objects/files) - equivalent to AWS S3, Cloudflare R2
 * - File storage (SMB file shares)
 * - Queue storage (messaging)
 * - Table storage (NoSQL key-value)
 *
 * Key features:
 * - Multiple redundancy options (LRS, GRS, ZRS, RA-GRS)
 * - Different access tiers (Hot, Cool, Archive)
 * - Globally unique naming across all of Azure
 * - Secure access via connection strings or managed identity
 * - Data encryption at rest and in transit
 *
 * @example
 * ## Basic Storage Account
 *
 * Create a storage account for blob storage:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, StorageAccount } from "alchemy/azure";
 *
 * const app = await alchemy("my-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
 *   }
 * });
 *
 * const rg = await ResourceGroup("main", {
 *   location: "eastus"
 * });
 *
 * const storage = await StorageAccount("storage", {
 *   resourceGroup: rg,
 *   sku: "Standard_LRS",
 *   accessTier: "Hot"
 * });
 *
 * console.log(`Storage Account: ${storage.name}`);
 * console.log(`Blob Endpoint: ${storage.primaryBlobEndpoint}`);
 * console.log(`Connection String: ${storage.primaryConnectionString}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Storage Account with Geo-Redundancy
 *
 * Create a geo-redundant storage account for critical data:
 *
 * ```typescript
 * const storage = await StorageAccount("critical-storage", {
 *   resourceGroup: rg,
 *   sku: "Standard_RAGRS", // Read-access geo-redundant
 *   accessTier: "Hot",
 *   tags: {
 *     criticality: "high",
 *     backup: "enabled"
 *   }
 * });
 *
 * // Access secondary endpoint for read operations
 * console.log(`Secondary Blob Endpoint: ${storage.secondaryBlobEndpoint}`);
 * ```
 *
 * @example
 * ## Premium Storage for High Performance
 *
 * Create a premium storage account for low-latency workloads:
 *
 * ```typescript
 * const premiumStorage = await StorageAccount("premium", {
 *   resourceGroup: rg,
 *   sku: "Premium_LRS",
 *   kind: "BlockBlobStorage", // Optimized for block blobs
 *   tags: {
 *     performance: "high",
 *     purpose: "media-processing"
 *   }
 * });
 * ```
 *
 * @example
 * ## Data Lake Storage Gen2
 *
 * Create a storage account with hierarchical namespace for big data:
 *
 * ```typescript
 * const dataLake = await StorageAccount("datalake", {
 *   resourceGroup: rg,
 *   sku: "Standard_LRS",
 *   enableHierarchicalNamespace: true, // Enables Data Lake Gen2
 *   tags: {
 *     purpose: "analytics",
 *     type: "datalake"
 *   }
 * });
 * ```
 *
 * @example
 * ## Adopting an Existing Storage Account
 *
 * Adopt an existing storage account to manage it with Alchemy:
 *
 * ```typescript
 * const existingStorage = await StorageAccount("existing", {
 *   name: "myexistingstorage123",
 *   resourceGroup: "my-existing-rg",
 *   location: "eastus",
 *   adopt: true
 * });
 * ```
 */
export const StorageAccount = Resource(
  "azure::StorageAccount",
  async function (
    this: Context<StorageAccount>,
    id: string,
    props: StorageAccountProps,
  ): Promise<StorageAccount> {
    const storageAccountId =
      props.storageAccountId || this.output?.storageAccountId;
    const adopt = props.adopt ?? this.scope.adopt;

    // Generate name with lowercase alphanumeric only
    const defaultName = this.scope
      .createPhysicalName(id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const name = props.name ?? this.output?.name ?? defaultName;

    // Validate name format (Azure requirements)
    if (!/^[a-z0-9]{3,24}$/.test(name)) {
      throw new Error(
        `Storage account name "${name}" is invalid. Must be 3-24 characters and contain only lowercase letters and numbers.`,
      );
    }

    // Get resource group name
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    if (this.scope.local) {
      // Local development mode - return mock data
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location: props.location || "local",
        storageAccountId:
          storageAccountId ||
          `/subscriptions/local/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${name}`,
        primaryConnectionString: Secret.wrap(
          `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=mockkey;EndpointSuffix=core.windows.net`,
        ),
        primaryAccessKey: Secret.wrap("mockaccesskey"),
        secondaryAccessKey: Secret.wrap("mockaccesskey2"),
        primaryBlobEndpoint: `https://${name}.blob.core.windows.net/`,
        primaryFileEndpoint: `https://${name}.file.core.windows.net/`,
        primaryQueueEndpoint: `https://${name}.queue.core.windows.net/`,
        primaryTableEndpoint: `https://${name}.table.core.windows.net/`,
        provisioningState: "Succeeded",
        sku: props.sku,
        kind: props.kind,
        accessTier: props.accessTier,
        enableHierarchicalNamespace: props.enableHierarchicalNamespace,
        allowBlobPublicAccess: props.allowBlobPublicAccess,
        minimumTlsVersion: props.minimumTlsVersion,
        tags: props.tags,
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "azure::StorageAccount",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (props.delete !== false && storageAccountId) {
        try {
          // Begin deletion - this is a long-running operation
          await clients.storage.storageAccounts.delete(resourceGroupName, name);
        } catch (error: any) {
          // If storage account doesn't exist (404), that's fine
          if (error?.statusCode !== 404 && error?.code !== "ResourceNotFound") {
            throw new Error(
              `Failed to delete storage account "${name}": ${error?.message || error}`,
              { cause: error },
            );
          }
        }
      }
      return this.destroy();
    }

    // Determine location from props or resource group
    let location = props.location;
    if (!location) {
      if (typeof props.resourceGroup === "object") {
        location = props.resourceGroup.location;
      } else {
        // Need to fetch resource group to get location
        const rg =
          await clients.resources.resourceGroups.get(resourceGroupName);
        location = rg.location!;
      }
    }

    // Check for immutable property changes
    if (this.phase === "update" && this.output) {
      if (this.output.location !== location) {
        // Location is immutable - need to replace the resource
        return this.replace();
      }
      if (this.output.name !== name) {
        // Name is immutable - need to replace the resource
        return this.replace();
      }
      if (
        props.enableHierarchicalNamespace !== undefined &&
        this.output.enableHierarchicalNamespace !==
          props.enableHierarchicalNamespace
      ) {
        // Hierarchical namespace is immutable - need to replace the resource
        return this.replace();
      }
    }

    const storageAccountParams = {
      location,
      tags: props.tags,
      sku: {
        name: props.sku || "Standard_LRS",
      },
      kind: props.kind || "StorageV2",
      properties: {
        accessTier: props.accessTier || "Hot",
        isHnsEnabled: props.enableHierarchicalNamespace || false,
        allowBlobPublicAccess: props.allowBlobPublicAccess ?? false,
        minimumTlsVersion: props.minimumTlsVersion || "TLS1_2",
      },
    };

    let result: AzureStorageAccount;

    try {
      // Create or update storage account - this is a long-running operation
      const poller = await clients.storage.storageAccounts.beginCreate(
        resourceGroupName,
        name,
        storageAccountParams,
      );

      // Wait for the creation to complete
      result = await poller.pollUntilDone();
    } catch (error: any) {
      // Check if this is a conflict error (resource exists)
      if (
        error?.statusCode === 409 ||
        error?.code === "StorageAccountAlreadyExists" ||
        error?.code === "AccountAlreadyExists"
      ) {
        if (!adopt) {
          throw new Error(
            `Storage account "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        // Adopt the existing storage account by getting it
        try {
          result = await clients.storage.storageAccounts.getProperties(
            resourceGroupName,
            name,
          );

          // Update properties if needed
          if (props.tags || props.accessTier) {
            const updateParams: any = {};
            if (props.tags) updateParams.tags = props.tags;
            if (props.accessTier) {
              updateParams.properties = { accessTier: props.accessTier };
            }

            result = await clients.storage.storageAccounts.update(
              resourceGroupName,
              name,
              updateParams,
            );
          }
        } catch (adoptError: any) {
          throw new Error(
            `Storage account "${name}" failed to create due to name conflict and could not be adopted: ${adoptError?.message || adoptError}`,
            { cause: adoptError },
          );
        }
      } else {
        throw new Error(
          `Failed to create storage account "${name}": ${error?.message || error}`,
          { cause: error },
        );
      }
    }

    if (!result.name || !result.id) {
      throw new Error(
        `Storage account "${name}" was created but response is missing required fields`,
      );
    }

    // Get access keys
    const keysResponse = await clients.storage.storageAccounts.listKeys(
      resourceGroupName,
      name,
    );

    if (!keysResponse.keys || keysResponse.keys.length < 2) {
      throw new Error(
        `Storage account "${name}" was created but access keys are missing`,
      );
    }

    const primaryKey = keysResponse.keys[0].value!;
    const secondaryKey = keysResponse.keys[1].value!;

    // Build connection strings
    const primaryConnectionString = `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${primaryKey};EndpointSuffix=core.windows.net`;
    const secondaryConnectionString = `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${secondaryKey};EndpointSuffix=core.windows.net`;

    return {
      id,
      name: result.name,
      resourceGroup: resourceGroupName,
      location: result.location!,
      storageAccountId: result.id,
      primaryConnectionString: Secret.wrap(primaryConnectionString),
      secondaryConnectionString: Secret.wrap(secondaryConnectionString),
      primaryAccessKey: Secret.wrap(primaryKey),
      secondaryAccessKey: Secret.wrap(secondaryKey),
      primaryBlobEndpoint: result.primaryEndpoints?.blob!,
      primaryFileEndpoint: result.primaryEndpoints?.file,
      primaryQueueEndpoint: result.primaryEndpoints?.queue,
      primaryTableEndpoint: result.primaryEndpoints?.table,
      provisioningState: result.provisioningState,
      sku: props.sku,
      kind: props.kind,
      accessTier: props.accessTier,
      enableHierarchicalNamespace: props.enableHierarchicalNamespace,
      allowBlobPublicAccess: props.allowBlobPublicAccess,
      minimumTlsVersion: props.minimumTlsVersion,
      tags: result.tags,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "azure::StorageAccount",
    };
  },
);

/**
 * Type guard to check if a resource is a StorageAccount
 */
export function isStorageAccount(resource: any): resource is StorageAccount {
  return resource?.[ResourceKind] === "azure::StorageAccount";
}

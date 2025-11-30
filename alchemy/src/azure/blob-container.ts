import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { StorageAccount } from "./storage-account.ts";
import type { BlobContainer as AzureBlobContainer } from "@azure/arm-storage";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface BlobContainerProps extends AzureClientProps {
  /**
   * Name of the blob container
   * Must be 3-63 characters, lowercase letters, numbers, and hyphens only
   * Cannot start or end with a hyphen, and cannot have consecutive hyphens
   * @default ${app}-${stage}-${id} (lowercase, valid characters only)
   */
  name?: string;

  /**
   * The storage account to create this container in
   * Can be a StorageAccount object or the name of an existing storage account
   */
  storageAccount: string | StorageAccount;

  /**
   * The resource group containing the storage account
   * Required if storageAccount is a string name
   * @default Inherited from StorageAccount object if provided
   */
  resourceGroup?: string;

  /**
   * Public access level for the container
   * @default "None" (no anonymous access)
   */
  publicAccess?: "None" | "Blob" | "Container";

  /**
   * Metadata key-value pairs for the container
   * @example { purpose: "images", team: "frontend" }
   */
  metadata?: Record<string, string>;

  /**
   * Tags to apply to the blob container
   * Note: Container tags are stored in metadata, not Azure resource tags
   * @example { environment: "production", backup: "enabled" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing blob container
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the container when removed from Alchemy
   * WARNING: Deleting a container deletes ALL blobs inside it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal container ID for lifecycle management
   * @internal
   */
  containerId?: string;
}

export type BlobContainer = Omit<BlobContainerProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The blob container name (required in output)
   */
  name: string;

  /**
   * The storage account name (required in output)
   */
  storageAccount: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * The container URL
   * @example https://{accountName}.blob.core.windows.net/{containerName}
   */
  url: string;

  /**
   * Whether the container has an immutability policy
   */
  hasImmutabilityPolicy?: boolean;

  /**
   * Whether the container has a legal hold
   */
  hasLegalHold?: boolean;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::BlobContainer";
};

/**
 * Azure Blob Container - object storage container for blobs
 *
 * A Blob Container provides a grouping of blobs within a Storage Account.
 * Containers are similar to directories or folders in a file system.
 * This is equivalent to AWS S3 Buckets and Cloudflare R2 Buckets.
 *
 * Key features:
 * - Organize blobs into logical groups
 * - Set public access levels (private, blob-level, container-level)
 * - Store unlimited blobs (up to 500 TB per storage account)
 * - Metadata support for container-level information
 * - Immutability policies for compliance (WORM storage)
 * - Soft delete for accidental deletion protection
 *
 * @example
 * ## Basic Blob Container
 *
 * Create a private blob container:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, StorageAccount, BlobContainer } from "alchemy/azure";
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
 *   sku: "Standard_LRS"
 * });
 *
 * const container = await BlobContainer("uploads", {
 *   storageAccount: storage,
 *   publicAccess: "None" // Private container
 * });
 *
 * console.log(`Container URL: ${container.url}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Public Blob Container
 *
 * Create a container with public read access for static assets:
 *
 * ```typescript
 * const publicContainer = await BlobContainer("assets", {
 *   storageAccount: storage,
 *   publicAccess: "Blob", // Anonymous read access to blobs
 *   metadata: {
 *     purpose: "static-assets",
 *     cdn: "enabled"
 *   }
 * });
 *
 * // Blobs in this container can be accessed via:
 * // https://{accountName}.blob.core.windows.net/assets/{blobName}
 * ```
 *
 * @example
 * ## Multiple Containers with Different Access Levels
 *
 * Create different containers for different purposes:
 *
 * ```typescript
 * // Private container for user data
 * const privateData = await BlobContainer("user-data", {
 *   storageAccount: storage,
 *   publicAccess: "None",
 *   metadata: { purpose: "user-storage" }
 * });
 *
 * // Public container for images
 * const images = await BlobContainer("images", {
 *   storageAccount: storage,
 *   publicAccess: "Blob",
 *   metadata: { purpose: "public-images" }
 * });
 *
 * // Container-level public access for entire container listings
 * const downloads = await BlobContainer("downloads", {
 *   storageAccount: storage,
 *   publicAccess: "Container", // Can list all blobs anonymously
 *   metadata: { purpose: "public-downloads" }
 * });
 * ```
 *
 * @example
 * ## Container with Storage Account Reference
 *
 * Reference an existing storage account by name:
 *
 * ```typescript
 * const container = await BlobContainer("backups", {
 *   storageAccount: "myexistingstorage123",
 *   resourceGroup: "my-resource-group",
 *   publicAccess: "None",
 *   metadata: {
 *     purpose: "database-backups",
 *     retention: "30-days"
 *   }
 * });
 * ```
 *
 * @example
 * ## Adopting an Existing Container
 *
 * Adopt an existing blob container to manage it with Alchemy:
 *
 * ```typescript
 * const existingContainer = await BlobContainer("existing", {
 *   name: "my-existing-container",
 *   storageAccount: "myexistingstorage123",
 *   resourceGroup: "my-resource-group",
 *   adopt: true
 * });
 * ```
 */
export const BlobContainer = Resource(
  "azure::BlobContainer",
  async function (
    this: Context<BlobContainer>,
    id: string,
    props: BlobContainerProps,
  ): Promise<BlobContainer> {
    const containerId = props.containerId || this.output?.containerId;
    const adopt = props.adopt ?? this.scope.adopt;

    // Generate name with lowercase alphanumeric and hyphens only
    const defaultName = this.scope
      .createPhysicalName(id)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/--+/g, "-") // Remove consecutive hyphens
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
    const name = props.name ?? this.output?.name ?? defaultName;

    if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(name)) {
      throw new Error(
        `Blob container name "${name}" is invalid. Must be 3-63 characters, lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen or have consecutive hyphens.`,
      );
    }

    // Get storage account name and resource group
    const storageAccountName =
      typeof props.storageAccount === "string"
        ? props.storageAccount
        : props.storageAccount.name;

    let resourceGroupName = props.resourceGroup;
    if (!resourceGroupName) {
      if (typeof props.storageAccount === "object") {
        resourceGroupName = props.storageAccount.resourceGroup;
      } else {
        throw new Error(
          `resourceGroup is required when storageAccount is a string name`,
        );
      }
    }

    if (this.scope.local) {
      return {
        id,
        name,
        storageAccount: storageAccountName,
        resourceGroup: resourceGroupName,
        url: `https://${storageAccountName}.blob.core.windows.net/${name}`,
        publicAccess: props.publicAccess,
        metadata: props.metadata,
        tags: props.tags,
        hasImmutabilityPolicy: false,
        hasLegalHold: false,
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "azure::BlobContainer",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (props.delete !== false && containerId) {
        try {
          await clients.storage.blobContainers.delete(
            resourceGroupName,
            storageAccountName,
            name,
          );
        } catch (error: unknown) {
          if (!isNotFoundError(error)) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `Failed to delete blob container "${name}": ${message}`,
              { cause: error },
            );
          }
        }
      }
      return this.destroy();
    }

    const containerParams: Record<string, unknown> = {
      publicAccess: props.publicAccess || "None",
      metadata: props.metadata,
    };

    let result;

    try {
      result = await clients.storage.blobContainers.create(
        resourceGroupName,
        storageAccountName,
        name,
        containerParams,
      );
    } catch (error: unknown) {
      if (isConflictError(error)) {
        if (!adopt) {
          throw new Error(
            `Blob container "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        try {
          result = await clients.storage.blobContainers.get(
            resourceGroupName,
            storageAccountName,
            name,
          );

          if (props.publicAccess || props.metadata) {
            result = await clients.storage.blobContainers.update(
              resourceGroupName,
              storageAccountName,
              name,
              {
                publicAccess: props.publicAccess,
                metadata: props.metadata,
              },
            );
          }
        } catch (adoptError: unknown) {
          const message =
            adoptError instanceof Error
              ? adoptError.message
              : String(adoptError);
          throw new Error(
            `Blob container "${name}" failed to create due to name conflict and could not be adopted: ${message}`,
            { cause: adoptError },
          );
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to create blob container "${name}": ${message}`,
          { cause: error },
        );
      }
    }

    if (!result.name) {
      throw new Error(
        `Blob container "${name}" was created but response is missing required fields`,
      );
    }

    const storageAccountInfo =
      typeof props.storageAccount === "object"
        ? props.storageAccount
        : await clients.storage.storageAccounts.getProperties(
            resourceGroupName,
            storageAccountName,
          );

    const blobEndpoint =
      typeof storageAccountInfo === "object" &&
      "primaryBlobEndpoint" in storageAccountInfo
        ? storageAccountInfo.primaryBlobEndpoint
        : storageAccountInfo.primaryEndpoints?.blob;

    const url = `${blobEndpoint}${name}`;

    return {
      id,
      name: result.name,
      storageAccount: storageAccountName,
      resourceGroup: resourceGroupName,
      url,
      publicAccess: result.publicAccess as any,
      metadata: result.metadata,
      tags: props.tags,
      hasImmutabilityPolicy: result.hasImmutabilityPolicy,
      hasLegalHold: result.hasLegalHold,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "azure::BlobContainer",
    };
  },
);

/**
 * Type guard to check if a resource is a BlobContainer
 */
export function isBlobContainer(resource: unknown): resource is BlobContainer {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::BlobContainer"
  );
}

import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { Identity as AzureIdentity } from "@azure/arm-msi";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface UserAssignedIdentityProps extends AzureClientProps {
  /**
   * Name of the user-assigned managed identity
   * Must be 3-128 characters, alphanumeric, hyphens, and underscores
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this identity in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this identity
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Tags to apply to the identity
   * @example { environment: "production", purpose: "app-access" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing identity
   * @default false
   */
  adopt?: boolean;

  /**
   * Internal identity ID for lifecycle management
   * @internal
   */
  identityId?: string;
}

export type UserAssignedIdentity = Omit<UserAssignedIdentityProps, "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The identity name (required in output)
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
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{identityName}
   */
  identityId: string;

  /**
   * The principal ID (object ID) of the managed identity
   * Use this to grant access to Azure resources
   */
  principalId: string;

  /**
   * The client ID of the managed identity
   * Use this for authentication scenarios
   */
  clientId: string;

  /**
   * The tenant ID of the managed identity
   */
  tenantId: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::UserAssignedIdentity";
};

/**
 * Azure User-Assigned Managed Identity for secure resource authentication
 *
 * A User-Assigned Managed Identity provides an identity in Azure Active Directory
 * that can be assigned to Azure resources (like Function Apps, VMs, or Storage Accounts)
 * to enable secure, password-less authentication to other Azure services.
 *
 * Key benefits:
 * - No credentials to manage - Azure handles authentication automatically
 * - Can be shared across multiple resources
 * - Survives resource deletion (unlike System-Assigned Identities)
 * - Supports role-based access control (RBAC)
 * - Enables secure connectivity without secrets in code
 *
 * This is equivalent to AWS IAM Roles and enables the "cloud-native" pattern
 * of granting permissions between resources without storing credentials.
 *
 * @example
 * ## Basic User-Assigned Identity
 *
 * Create an identity and use it to grant a Function App access to Storage:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, UserAssignedIdentity, StorageAccount, FunctionApp } from "alchemy/azure";
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
 * // Create an identity
 * const identity = await UserAssignedIdentity("app-identity", {
 *   resourceGroup: rg,
 *   location: "eastus"
 * });
 *
 * // Use the identity with a Function App
 * const fn = await FunctionApp("api", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   identity: identity
 * });
 *
 * console.log(`Principal ID: ${identity.principalId}`);
 * console.log(`Client ID: ${identity.clientId}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Identity with Tags
 *
 * Create an identity with organizational tags:
 *
 * ```typescript
 * const identity = await UserAssignedIdentity("data-processor", {
 *   resourceGroup: rg,
 *   location: "westus2",
 *   tags: {
 *     purpose: "data-processing",
 *     team: "engineering",
 *     environment: "production"
 *   }
 * });
 * ```
 *
 * @example
 * ## Shared Identity Across Resources
 *
 * Use a single identity across multiple resources:
 *
 * ```typescript
 * const sharedIdentity = await UserAssignedIdentity("shared", {
 *   resourceGroup: rg,
 *   location: "eastus"
 * });
 *
 * const functionApp = await FunctionApp("api", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   identity: sharedIdentity
 * });
 *
 * const containerInstance = await ContainerInstance("worker", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   identity: sharedIdentity
 * });
 *
 * // Both resources share the same identity and permissions
 * ```
 */
export const UserAssignedIdentity = Resource(
  "azure::UserAssignedIdentity",
  async function (
    this: Context<UserAssignedIdentity>,
    id: string,
    props: UserAssignedIdentityProps,
  ): Promise<UserAssignedIdentity> {
    const identityId = props.identityId || this.output?.identityId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    // Validate name format (Azure requirements)
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(name)) {
      throw new Error(
        `User-assigned identity name "${name}" is invalid. Must be 3-128 characters and contain only alphanumeric characters, hyphens, and underscores.`,
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
        identityId:
          identityId ||
          `/subscriptions/local/resourceGroups/${resourceGroupName}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}`,
        principalId: "00000000-0000-0000-0000-000000000000",
        clientId: "00000000-0000-0000-0000-000000000000",
        tenantId: "00000000-0000-0000-0000-000000000000",
        tags: props.tags,
        subscriptionId: props.subscriptionId,
        type: "azure::UserAssignedIdentity",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (identityId) {
        try {
          // Delete identity - this is a synchronous operation in newer SDK
          await clients.msi.userAssignedIdentities.delete(
            resourceGroupName,
            name,
          );
        } catch (error) {
          // If identity doesn't exist (404), that's fine
          if (error?.statusCode !== 404 && error?.code !== "ResourceNotFound") {
            throw new Error(
              `Failed to delete user-assigned identity "${name}": ${error?.message || error}`,
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
    }

    const identityParams = {
      location,
      tags: props.tags,
    };

    let result;

    try {
      // Create or update identity
      result = await clients.msi.userAssignedIdentities.createOrUpdate(
        resourceGroupName,
        name,
        identityParams,
      );
    } catch (error) {
      // Check if this is a conflict error (resource exists)
      if (
        error?.statusCode === 409 ||
        error?.code === "ResourceAlreadyExists"
      ) {
        if (!adopt) {
          throw new Error(
            `User-assigned identity "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        // Adopt the existing identity by updating it
        try {
          result = await clients.msi.userAssignedIdentities.createOrUpdate(
            resourceGroupName,
            name,
            identityParams,
          );
        } catch (adoptError) {
          throw new Error(
            `User-assigned identity "${name}" failed to create due to name conflict and could not be adopted: ${adoptError?.message || adoptError}`,
            { cause: adoptError },
          );
        }
      } else {
        throw new Error(
          `Failed to create user-assigned identity "${name}": ${error?.message || error}`,
          { cause: error },
        );
      }
    }

    if (!result.name || !result.id) {
      throw new Error(
        `User-assigned identity "${name}" was created but response is missing required fields`,
      );
    }

    if (!result.principalId || !result.clientId) {
      throw new Error(
        `User-assigned identity "${name}" was created but response is missing principalId or clientId`,
      );
    }

    return {
      id,
      name: result.name,
      resourceGroup: resourceGroupName,
      location: result.location!,
      identityId: result.id,
      principalId: result.principalId,
      clientId: result.clientId,
      tenantId: result.tenantId!,
      tags: result.tags,
      subscriptionId: props.subscriptionId,
      type: "azure::UserAssignedIdentity",
    };
  },
);

/**
 * Type guard to check if a resource is a UserAssignedIdentity
 */
export function isUserAssignedIdentity(
  resource: unknown,
): resource is UserAssignedIdentity {
  return resource?.[ResourceKind] === "azure::UserAssignedIdentity";
}

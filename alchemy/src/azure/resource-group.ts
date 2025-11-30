import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup as AzureResourceGroup } from "@azure/arm-resources";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface ResourceGroupProps extends AzureClientProps {
  /**
   * Name of the resource group
   * Must be 1-90 characters, alphanumeric, underscores, hyphens, periods, and parentheses
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * Azure region for this resource group
   * @example "eastus", "westus2", "westeurope"
   */
  location: string;

  /**
   * Tags to apply to the resource group
   * @example { environment: "production", team: "platform" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing resource group
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the resource group when removed from Alchemy
   * WARNING: Deleting a resource group deletes ALL resources inside it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal resource group ID for lifecycle management
   * @internal
   */
  resourceGroupId?: string;
}

export type ResourceGroup = Omit<ResourceGroupProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The resource group name (required in output)
   */
  name: string;

  /**
   * The Azure resource ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}
   */
  resourceGroupId: string;

  /**
   * The provisioning state of the resource group
   */
  provisioningState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::ResourceGroup";
};

/**
 * Azure Resource Group - logical container for Azure resources
 *
 * A Resource Group is Azure's fundamental organizational unit. All Azure resources
 * must belong to exactly one resource group. Resource groups provide:
 * - Logical grouping of related resources
 * - Lifecycle management (deleting a group deletes all resources)
 * - Access control and policy management
 * - Cost tracking and billing organization
 *
 * @example
 * ## Basic Resource Group
 *
 * Create a resource group in East US:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup } from "alchemy/azure";
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
 * console.log(`Resource Group: ${rg.name}`);
 * console.log(`Location: ${rg.location}`);
 * console.log(`Resource ID: ${rg.resourceGroupId}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Resource Group with Tags
 *
 * Create a resource group with organizational tags:
 *
 * ```typescript
 * const rg = await ResourceGroup("production-rg", {
 *   location: "westus2",
 *   tags: {
 *     environment: "production",
 *     team: "platform",
 *     costCenter: "engineering",
 *     project: "infrastructure"
 *   }
 * });
 * ```
 *
 * @example
 * ## Adopting an Existing Resource Group
 *
 * Adopt an existing resource group to manage it with Alchemy:
 *
 * ```typescript
 * const existingRg = await ResourceGroup("existing", {
 *   name: "my-existing-rg",
 *   location: "eastus",
 *   adopt: true
 * });
 * ```
 *
 * @example
 * ## Multi-Region Deployment
 *
 * Create resource groups in different regions:
 *
 * ```typescript
 * const usEast = await ResourceGroup("us-east", {
 *   location: "eastus",
 *   tags: { region: "us-east" }
 * });
 *
 * const usWest = await ResourceGroup("us-west", {
 *   location: "westus2",
 *   tags: { region: "us-west" }
 * });
 *
 * const europe = await ResourceGroup("europe", {
 *   location: "westeurope",
 *   tags: { region: "europe" }
 * });
 * ```
 */
export const ResourceGroup = Resource(
  "azure::ResourceGroup",
  async function (
    this: Context<ResourceGroup>,
    id: string,
    props: ResourceGroupProps,
  ): Promise<ResourceGroup> {
    const resourceGroupId =
      props.resourceGroupId || this.output?.resourceGroupId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroupId:
          resourceGroupId || `/subscriptions/local/resourceGroups/${name}`,
        location: props.location,
        tags: props.tags,
        provisioningState: "Succeeded",
        subscriptionId: props.subscriptionId,
        tenantId: props.tenantId,
        clientId: props.clientId,
        clientSecret: props.clientSecret,
        type: "azure::ResourceGroup",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (props.delete !== false && resourceGroupId) {
        try {
          const poller =
            await clients.resources.resourceGroups.beginDelete(name);

          // This is crucial because Azure returns 202 Accepted immediately
          // but the actual deletion happens asynchronously
          await poller.pollUntilDone();
        } catch (error: unknown) {
          if (!isNotFoundError(error)) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `Failed to delete resource group "${name}": ${message}`,
              { cause: error },
            );
          }
        }
      }
      return this.destroy();
    }

    // Only validate during creation/update, not deletion
    if (!/^[\w\-\.()]{1,90}$/.test(name)) {
      throw new Error(
        `Resource group name "${name}" is invalid. Must be 1-90 characters and contain only alphanumeric characters, underscores, hyphens, periods, and parentheses.`,
      );
    }

    if (this.phase === "update" && this.output) {
      if (this.output.location !== props.location) {
        // Location is immutable - need to replace the resource
        return this.replace();
      }
    }

    const resourceGroupParams = {
      location: props.location,
      tags: props.tags,
    };

    let result;

    try {
      // The SDK automatically handles this as a single operation
      result = await clients.resources.resourceGroups.createOrUpdate(
        name,
        resourceGroupParams,
      );
    } catch (error: unknown) {
      if (isConflictError(error)) {
        if (!adopt) {
          throw new Error(
            `Resource group "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        try {
          result = await clients.resources.resourceGroups.createOrUpdate(
            name,
            resourceGroupParams,
          );
        } catch (adoptError: unknown) {
          const message =
            adoptError instanceof Error
              ? adoptError.message
              : String(adoptError);
          throw new Error(
            `Resource group "${name}" failed to create due to name conflict and could not be adopted: ${message}`,
            { cause: adoptError },
          );
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to create resource group "${name}": ${message}`,
          { cause: error },
        );
      }
    }

    if (!result.name || !result.id) {
      throw new Error(
        `Resource group "${name}" was created but response is missing required fields`,
      );
    }

    return {
      id,
      name: result.name,
      resourceGroupId: result.id,
      location: result.location!,
      tags: result.tags,
      provisioningState: result.properties?.provisioningState,
      subscriptionId: props.subscriptionId,
      tenantId: props.tenantId,
      clientId: props.clientId,
      clientSecret: props.clientSecret,
      type: "azure::ResourceGroup",
    };
  },
);

/**
 * Type guard to check if a resource is a ResourceGroup
 */
export function isResourceGroup(resource: unknown): resource is ResourceGroup {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::ResourceGroup"
  );
}

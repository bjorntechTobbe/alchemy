import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { SBNamespace } from "@azure/arm-servicebus";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface ServiceBusProps extends AzureClientProps {
  /**
   * Name of the Service Bus namespace
   * Must be 6-50 characters, lowercase letters, numbers, and hyphens only
   * Must be globally unique across all of Azure
   * @default ${app}-${stage}-${id} (lowercase, alphanumeric + hyphens)
   */
  name?: string;

  /**
   * The resource group to create this Service Bus namespace in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this Service Bus namespace
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The messaging tier for Service Bus namespace
   * - Basic: Limited features, no topics, 256 KB message size
   * - Standard: Supports topics, 256 KB message size, variable pricing
   * - Premium: Dedicated resources, 1 MB message size, predictable performance
   * @default "Standard"
   */
  sku?: "Basic" | "Standard" | "Premium";

  /**
   * Number of messaging units (Premium SKU only)
   * - Premium SKU requires at least 1 messaging unit
   * - Each unit provides dedicated CPU and memory
   * @default 1 (for Premium SKU)
   */
  capacity?: number;

  /**
   * Enable zone redundancy (Premium SKU only)
   * Replicates namespace across availability zones
   * @default false
   */
  zoneRedundant?: boolean;

  /**
   * Disable local (SAS) authentication, require Azure AD only
   * @default false
   */
  disableLocalAuth?: boolean;

  /**
   * Tags to apply to the Service Bus namespace
   * @example { environment: "production", purpose: "messaging" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing Service Bus namespace
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the Service Bus namespace when removed from Alchemy
   * WARNING: Deleting a namespace deletes ALL queues, topics, and messages
   * @default true
   */
  delete?: boolean;

  /**
   * Internal Service Bus namespace ID for lifecycle management
   * @internal
   */
  serviceBusId?: string;
}

export type ServiceBus = Omit<ServiceBusProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The Service Bus namespace name (required in output)
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
   * The Service Bus namespace ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.ServiceBus/namespaces/{namespaceName}
   */
  serviceBusId: string;

  /**
   * The messaging tier
   */
  sku: "Basic" | "Standard" | "Premium";

  /**
   * Service Bus namespace endpoint
   * Format: https://{namespaceName}.servicebus.windows.net
   */
  endpoint: string;

  /**
   * The primary connection string for the namespace
   * Contains Shared Access Signature (SAS) credentials
   */
  primaryConnectionString: Secret;

  /**
   * The secondary connection string for the namespace
   * Contains Shared Access Signature (SAS) credentials
   */
  secondaryConnectionString: Secret;

  /**
   * The primary key for the namespace
   */
  primaryKey: Secret;

  /**
   * The secondary key for the namespace
   */
  secondaryKey: Secret;

  /**
   * Provisioning state of the namespace
   */
  provisioningState?: string;

  /**
   * Resource type identifier for binding
   * @internal
   */
  type: "azure::ServiceBus";
};

/**
 * Type guard to check if a resource is a ServiceBus namespace
 */
export function isServiceBus(resource: unknown): resource is ServiceBus {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::ServiceBus"
  );
}

/**
 * Azure Service Bus - Enterprise messaging service
 *
 * Service Bus is a fully managed enterprise message broker with message queues and publish-subscribe topics.
 * Use Service Bus to decouple applications and services, transfer data across applications,
 * and implement reliable message-based architectures.
 *
 * **AWS Equivalent**: Combines features of Amazon SQS (queues) and Amazon SNS (topics/pub-sub)
 *
 * @example
 * ## Basic Service Bus with Standard SKU
 *
 * Create a Service Bus namespace for message queuing and pub/sub:
 *
 * ```ts
 * const rg = await ResourceGroup("messaging-rg", {
 *   location: "eastus"
 * });
 *
 * const bus = await ServiceBus("orders", {
 *   resourceGroup: rg,
 *   sku: "Standard" // Supports queues and topics
 * });
 *
 * console.log(bus.endpoint); // https://myapp-prod-orders.servicebus.windows.net
 * console.log(Secret.unwrap(bus.primaryConnectionString)); // Connection string for clients
 * ```
 *
 * @example
 * ## Premium Service Bus with Zone Redundancy
 *
 * Create a high-performance Service Bus with dedicated resources:
 *
 * ```ts
 * const bus = await ServiceBus("critical-msgs", {
 *   resourceGroup: rg,
 *   sku: "Premium",
 *   capacity: 2, // 2 messaging units
 *   zoneRedundant: true // Replicate across availability zones
 * });
 * ```
 *
 * @example
 * ## Service Bus with Azure AD Authentication Only
 *
 * Disable SAS keys and require Azure AD authentication:
 *
 * ```ts
 * const bus = await ServiceBus("secure-bus", {
 *   resourceGroup: rg,
 *   sku: "Standard",
 *   disableLocalAuth: true // No SAS keys, Azure AD only
 * });
 * ```
 */
export const ServiceBus = Resource(
  "azure::ServiceBus",
  async function (
    this: Context<ServiceBus>,
    id: string,
    props: ServiceBusProps,
  ): Promise<ServiceBus> {
    const serviceBusId = props.serviceBusId || this.output?.serviceBusId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");

    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    const location =
      props.location ||
      this.output?.location ||
      (typeof props.resourceGroup === "string"
        ? undefined
        : props.resourceGroup.location);

    if (!location) {
      throw new Error(
        "Location must be specified either directly or via ResourceGroup object",
      );
    }

    const sku = props.sku ?? this.output?.sku ?? "Standard";

    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        serviceBusId: serviceBusId || "",
        sku,
        endpoint: `https://${name}.servicebus.windows.net`,
        primaryConnectionString: Secret.wrap(""),
        secondaryConnectionString: Secret.wrap(""),
        primaryKey: Secret.wrap(""),
        secondaryKey: Secret.wrap(""),
        provisioningState: "Succeeded",
        type: "azure::ServiceBus",
      };
    }

    const { serviceBus } = await createAzureClients(props);

    if (this.phase === "delete") {
      if (props.delete === false) {
        // Don't delete the namespace, just remove from state
        return this.destroy();
      }

      if (!serviceBusId) {
        console.warn(`No serviceBusId found for ${id}, skipping delete`);
        return this.destroy();
      }

      try {
        await serviceBus.namespaces.beginDeleteAndWait(resourceGroupName, name);
      } catch (error) {
        if (!isNotFoundError(error)) {
          console.error(`Error deleting Service Bus namespace ${id}:`, error);
          throw error;
        }
      }
      return this.destroy();
    }

    // Validate name format (after delete phase)
    if (name.length < 6 || name.length > 50) {
      throw new Error(
        `Service Bus namespace name must be 6-50 characters, got: ${name}`,
      );
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `Service Bus namespace name must contain only lowercase letters, numbers, and hyphens, got: ${name}`,
      );
    }

    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `Service Bus namespace name cannot start or end with a hyphen, got: ${name}`,
      );
    }

    // Validate SKU-specific options (after delete phase)
    if (sku === "Basic" && props.capacity) {
      throw new Error("Capacity is not supported for Basic SKU");
    }
    if (sku !== "Premium" && props.zoneRedundant) {
      throw new Error("Zone redundancy is only supported for Premium SKU");
    }
    if (sku !== "Premium" && props.capacity && props.capacity > 1) {
      throw new Error(
        "Capacity greater than 1 is only supported for Premium SKU",
      );
    }

    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace();
      }
      if (this.output.location !== location) {
        return this.replace();
      }
      if (this.output.sku !== sku) {
        // SKU can only be upgraded Standard->Premium, not downgraded
        if (
          sku === "Basic" ||
          (sku === "Standard" && this.output.sku === "Premium")
        ) {
          return this.replace();
        }
      }
    }

    const namespaceParams: SBNamespace = {
      location,
      sku: {
        name: sku,
        tier: sku,
      },
      tags: props.tags,
      disableLocalAuth: props.disableLocalAuth,
      zoneRedundant: props.zoneRedundant,
    };

    // Add capacity for Premium SKU
    if (sku === "Premium") {
      namespaceParams.sku!.capacity = props.capacity ?? 1;
    }

    let namespace: SBNamespace;

    if (serviceBusId) {
      namespace = await serviceBus.namespaces.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        namespaceParams,
      );
    } else {
      if (!adopt) {
        try {
          const existing = await serviceBus.namespaces.get(
            resourceGroupName,
            name,
          );
          if (existing) {
            throw new Error(
              `Service Bus namespace "${name}" already exists. Use adopt: true to adopt it.`,
            );
          }
        } catch (error) {
          // 404 is expected - namespace doesn't exist
          if (!isNotFoundError(error)) {
            // Re-throw if it's not a 404
            if (error.message?.includes("already exists")) {
              throw error;
            }
          }
        }
      }

      // Create or adopt namespace
      namespace = await serviceBus.namespaces.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        namespaceParams,
      );
    }

    const keys = await serviceBus.namespaces.listKeys(
      resourceGroupName,
      name,
      "RootManageSharedAccessKey",
    );

    return {
      id,
      name: namespace.name!,
      resourceGroup: resourceGroupName,
      location: namespace.location!,
      serviceBusId: namespace.id!,
      sku,
      endpoint: `https://${namespace.name}.servicebus.windows.net`,
      primaryConnectionString: Secret.wrap(keys.primaryConnectionString || ""),
      secondaryConnectionString: Secret.wrap(
        keys.secondaryConnectionString || "",
      ),
      primaryKey: Secret.wrap(keys.primaryKey || ""),
      secondaryKey: Secret.wrap(keys.secondaryKey || ""),
      provisioningState: namespace.provisioningState,
      disableLocalAuth: props.disableLocalAuth,
      capacity: sku === "Premium" ? (props.capacity ?? 1) : undefined,
      zoneRedundant: props.zoneRedundant,
      tags: props.tags,
      type: "azure::ServiceBus",
    };
  },
);

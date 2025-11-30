import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { VirtualNetwork as AzureVirtualNetwork } from "@azure/arm-network";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface Subnet {
  /**
   * Name of the subnet
   */
  name: string;

  /**
   * Address prefix for the subnet in CIDR notation
   * @example "10.0.1.0/24"
   */
  addressPrefix: string;
}

export interface VirtualNetworkProps extends AzureClientProps {
  /**
   * Name of the virtual network
   * Must be 2-64 characters, letters, numbers, underscores, periods, and hyphens
   * Must start with letter or number and end with letter, number or underscore
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this virtual network in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this virtual network
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Address space for the virtual network in CIDR notation
   * Can specify multiple address spaces
   * @default ["10.0.0.0/16"]
   * @example ["10.0.0.0/16", "192.168.0.0/16"]
   */
  addressSpace?: string[];

  /**
   * Subnets to create within the virtual network
   * @default [{ name: "default", addressPrefix: "<first-address-space>/24" }]
   */
  subnets?: Subnet[];

  /**
   * DNS servers for the virtual network
   * If not specified, Azure-provided DNS is used
   * @example ["10.0.0.4", "10.0.0.5"]
   */
  dnsServers?: string[];

  /**
   * Tags to apply to the virtual network
   * @example { environment: "production", purpose: "app-network" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing virtual network
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the virtual network when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal virtual network ID for lifecycle management
   * @internal
   */
  virtualNetworkId?: string;
}

export type VirtualNetwork = Omit<VirtualNetworkProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The virtual network name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID
   */
  virtualNetworkId: string;

  /**
   * Address spaces configured for this virtual network
   */
  addressSpace: string[];

  /**
   * Subnets within this virtual network
   */
  subnets: Subnet[];

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::VirtualNetwork";
};

/**
 * Azure Virtual Network for isolated network environments
 *
 * Virtual Networks (VNets) provide isolated network environments in Azure,
 * equivalent to AWS VPC. They enable secure communication between Azure resources,
 * on-premises networks, and the internet.
 *
 * @example
 * ## Basic Virtual Network
 *
 * Create a simple virtual network with default address space:
 *
 * ```ts
 * const rg = await ResourceGroup("network-rg", {
 *   location: "eastus"
 * });
 *
 * const vnet = await VirtualNetwork("app-network", {
 *   resourceGroup: rg,
 *   location: "eastus"
 * });
 * ```
 *
 * @example
 * ## Virtual Network with Multiple Subnets
 *
 * Create a virtual network with separate subnets for different tiers:
 *
 * ```ts
 * const vnet = await VirtualNetwork("app-network", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   addressSpace: ["10.0.0.0/16"],
 *   subnets: [
 *     { name: "web", addressPrefix: "10.0.1.0/24" },
 *     { name: "api", addressPrefix: "10.0.2.0/24" },
 *     { name: "database", addressPrefix: "10.0.3.0/24" }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Virtual Network with Custom DNS
 *
 * Configure custom DNS servers for the virtual network:
 *
 * ```ts
 * const vnet = await VirtualNetwork("corp-network", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   addressSpace: ["10.1.0.0/16"],
 *   dnsServers: ["10.1.0.4", "10.1.0.5"],
 *   subnets: [
 *     { name: "default", addressPrefix: "10.1.0.0/24" }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Multi-Region Virtual Networks
 *
 * Create virtual networks in multiple regions for global deployments:
 *
 * ```ts
 * const eastVnet = await VirtualNetwork("east-network", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   addressSpace: ["10.0.0.0/16"]
 * });
 *
 * const westVnet = await VirtualNetwork("west-network", {
 *   resourceGroup: rg,
 *   location: "westus",
 *   addressSpace: ["10.1.0.0/16"]
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Virtual Network
 *
 * Adopt an existing virtual network created outside Alchemy:
 *
 * ```ts
 * const vnet = await VirtualNetwork("existing-network", {
 *   name: "my-existing-vnet",
 *   resourceGroup: "existing-rg",
 *   location: "eastus",
 *   adopt: true
 * });
 * ```
 */
export const VirtualNetwork = Resource(
  "azure::VirtualNetwork",
  async function (
    this: Context<VirtualNetwork>,
    id: string,
    props: VirtualNetworkProps,
  ): Promise<VirtualNetwork> {
    const virtualNetworkId =
      props.virtualNetworkId || this.output?.virtualNetworkId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}[a-zA-Z0-9_]$/.test(name)) {
      throw new Error(
        `Virtual network name "${name}" is invalid. Must be 2-64 characters, start with letter or number, end with letter/number/underscore, and contain only letters, numbers, underscores, periods, and hyphens.`,
      );
    }

    if (this.scope.local) {
      const addressSpace = props.addressSpace || ["10.0.0.0/16"];
      const defaultSubnet = addressSpace[0].replace(/\/\d+$/, "/24");
      return {
        id,
        name,
        virtualNetworkId: virtualNetworkId || `local-${id}`,
        location: props.location || "eastus",
        addressSpace,
        subnets: props.subnets || [
          { name: "default", addressPrefix: defaultSubnet },
        ],
        resourceGroup: props.resourceGroup,
        dnsServers: props.dnsServers,
        tags: props.tags,
        type: "azure::VirtualNetwork",
      };
    }

    const clients = await createAzureClients(props);
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    // Get resource group for location inheritance
    let location = props.location;
    if (!location) {
      const rg = await clients.resources.resourceGroups.get(resourceGroupName);
      location = rg.location!;
    }

    if (this.phase === "delete") {
      if (props.delete !== false && virtualNetworkId) {
        try {
          await clients.network.virtualNetworks.beginDeleteAndWait(
            resourceGroupName,
            name,
          );
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace(); // Name is immutable
      }
      if (this.output.location !== location) {
        return this.replace(); // Location is immutable
      }
    }

    // Default address space and subnets
    const addressSpace = props.addressSpace ||
      this.output?.addressSpace || ["10.0.0.0/16"];

    // Compute default subnet based on the address space
    const defaultSubnet = addressSpace[0].replace(/\/\d+$/, "/24");
    const subnets = props.subnets ||
      this.output?.subnets || [
        { name: "default", addressPrefix: defaultSubnet },
      ];

    const requestBody: Partial<AzureVirtualNetwork> = {
      location,
      tags: props.tags,
      addressSpace: {
        addressPrefixes: addressSpace,
      },
      subnets: subnets.map((subnet) => ({
        name: subnet.name,
        addressPrefix: subnet.addressPrefix,
      })),
    };

    // Add DNS servers if specified
    if (props.dnsServers && props.dnsServers.length > 0) {
      requestBody.dhcpOptions = {
        dnsServers: props.dnsServers,
      };
    }

    let result: AzureVirtualNetwork;

    if (virtualNetworkId) {
      result = await clients.network.virtualNetworks.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        requestBody,
      );
    } else {
      try {
        result =
          await clients.network.virtualNetworks.beginCreateOrUpdateAndWait(
            resourceGroupName,
            name,
            requestBody,
          );
      } catch (error) {
        if (isConflictError(error)) {
          if (!adopt) {
            throw new Error(
              `Virtual network "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Get existing virtual network to verify it exists
          await clients.network.virtualNetworks.get(resourceGroupName, name);

          // Update with requested configuration
          result =
            await clients.network.virtualNetworks.beginCreateOrUpdateAndWait(
              resourceGroupName,
              name,
              requestBody,
            );
        } else {
          throw error;
        }
      }
    }

    return {
      id,
      name: result.name!,
      virtualNetworkId: result.id!,
      location: result.location!,
      addressSpace: result.addressSpace?.addressPrefixes || [],
      subnets:
        result.subnets?.map((subnet) => ({
          name: subnet.name!,
          addressPrefix: subnet.addressPrefix || "",
        })) || [],
      resourceGroup: props.resourceGroup,
      dnsServers: result.dhcpOptions?.dnsServers,
      tags: result.tags,
      type: "azure::VirtualNetwork",
    };
  },
);

/**
 * Type guard to check if a resource is a VirtualNetwork
 */
export function isVirtualNetwork(
  resource: unknown,
): resource is VirtualNetwork {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::VirtualNetwork"
  );
}

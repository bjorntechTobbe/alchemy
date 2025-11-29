import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";

export interface SecurityRule {
  /**
   * Name of the security rule
   */
  name: string;

  /**
   * Priority of the rule (100-4096, lower is higher priority)
   */
  priority: number;

  /**
   * Direction of traffic (Inbound or Outbound)
   */
  direction: "Inbound" | "Outbound";

  /**
   * Action to take (Allow or Deny)
   */
  access: "Allow" | "Deny";

  /**
   * Protocol for the rule
   */
  protocol: "Tcp" | "Udp" | "Icmp" | "Esp" | "Ah" | "*";

  /**
   * Source address prefix, CIDR, or service tag
   * @example "10.0.0.0/16", "Internet", "VirtualNetwork"
   */
  sourceAddressPrefix?: string;

  /**
   * Source port range or *
   * @example "80", "8000-8999", "*"
   */
  sourcePortRange?: string;

  /**
   * Destination address prefix, CIDR, or service tag
   * @example "10.0.1.0/24", "VirtualNetwork"
   */
  destinationAddressPrefix?: string;

  /**
   * Destination port range or *
   * @example "443", "8000-8999", "*"
   */
  destinationPortRange?: string;

  /**
   * Description of the rule
   */
  description?: string;
}

export interface NetworkSecurityGroupProps extends AzureClientProps {
  /**
   * Name of the network security group
   * Must be 1-80 characters, letters, numbers, underscores, periods, and hyphens
   * Must start with letter or number and end with letter, number or underscore
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this network security group in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this network security group
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Security rules for the network security group
   * @default []
   */
  securityRules?: SecurityRule[];

  /**
   * Tags to apply to the network security group
   * @example { environment: "production", purpose: "web-firewall" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing network security group
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the network security group when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal network security group ID for lifecycle management
   * @internal
   */
  networkSecurityGroupId?: string;
}

export type NetworkSecurityGroup = Omit<
  NetworkSecurityGroupProps,
  "delete" | "adopt"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The network security group name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID
   */
  networkSecurityGroupId: string;

  /**
   * Security rules configured for this network security group
   */
  securityRules: SecurityRule[];

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::NetworkSecurityGroup";
};

/**
 * Azure Network Security Group for firewall rules
 *
 * Network Security Groups (NSGs) contain security rules that allow or deny network
 * traffic to Azure resources, equivalent to AWS Security Groups. NSGs can be associated
 * with subnets or individual network interfaces.
 *
 * @example
 * ## Basic Network Security Group
 *
 * Create a network security group with HTTP and HTTPS rules:
 *
 * ```ts
 * const rg = await ResourceGroup("network-rg", {
 *   location: "eastus"
 * });
 *
 * const nsg = await NetworkSecurityGroup("web-nsg", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   securityRules: [
 *     {
 *       name: "allow-http",
 *       priority: 100,
 *       direction: "Inbound",
 *       access: "Allow",
 *       protocol: "Tcp",
 *       sourceAddressPrefix: "*",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "80"
 *     },
 *     {
 *       name: "allow-https",
 *       priority: 110,
 *       direction: "Inbound",
 *       access: "Allow",
 *       protocol: "Tcp",
 *       sourceAddressPrefix: "*",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "443"
 *     }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Network Security Group for Database
 *
 * Create NSG allowing only internal network access:
 *
 * ```ts
 * const dbNsg = await NetworkSecurityGroup("db-nsg", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   securityRules: [
 *     {
 *       name: "allow-sql-internal",
 *       priority: 100,
 *       direction: "Inbound",
 *       access: "Allow",
 *       protocol: "Tcp",
 *       sourceAddressPrefix: "10.0.0.0/16",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "1433",
 *       description: "Allow SQL Server from internal network"
 *     },
 *     {
 *       name: "deny-internet",
 *       priority: 200,
 *       direction: "Inbound",
 *       access: "Deny",
 *       protocol: "*",
 *       sourceAddressPrefix: "Internet",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "*",
 *       description: "Deny all traffic from internet"
 *     }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Network Security Group with SSH Access
 *
 * Allow SSH from specific IP range:
 *
 * ```ts
 * const sshNsg = await NetworkSecurityGroup("ssh-nsg", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   securityRules: [
 *     {
 *       name: "allow-ssh",
 *       priority: 100,
 *       direction: "Inbound",
 *       access: "Allow",
 *       protocol: "Tcp",
 *       sourceAddressPrefix: "203.0.113.0/24",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "22",
 *       description: "Allow SSH from office network"
 *     }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Network Security Group with Outbound Rules
 *
 * Control outbound traffic:
 *
 * ```ts
 * const restrictiveNsg = await NetworkSecurityGroup("restrictive-nsg", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   securityRules: [
 *     {
 *       name: "allow-outbound-https",
 *       priority: 100,
 *       direction: "Outbound",
 *       access: "Allow",
 *       protocol: "Tcp",
 *       sourceAddressPrefix: "*",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "Internet",
 *       destinationPortRange: "443",
 *       description: "Allow HTTPS to internet"
 *     },
 *     {
 *       name: "deny-outbound-all",
 *       priority: 200,
 *       direction: "Outbound",
 *       access: "Deny",
 *       protocol: "*",
 *       sourceAddressPrefix: "*",
 *       sourcePortRange: "*",
 *       destinationAddressPrefix: "*",
 *       destinationPortRange: "*",
 *       description: "Deny all other outbound traffic"
 *     }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Network Security Group
 *
 * Adopt an existing network security group:
 *
 * ```ts
 * const nsg = await NetworkSecurityGroup("existing-nsg", {
 *   name: "my-existing-nsg",
 *   resourceGroup: "existing-rg",
 *   location: "eastus",
 *   adopt: true
 * });
 * ```
 */
export const NetworkSecurityGroup = Resource(
  "azure::NetworkSecurityGroup",
  async function (
    this: Context<NetworkSecurityGroup>,
    id: string,
    props: NetworkSecurityGroupProps,
  ): Promise<NetworkSecurityGroup> {
    const networkSecurityGroupId =
      props.networkSecurityGroupId || this.output?.networkSecurityGroupId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    // Validate name format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,78}[a-zA-Z0-9_]$/.test(name)) {
      throw new Error(
        `Network security group name "${name}" is invalid. Must be 1-80 characters, start with letter or number, end with letter/number/underscore, and contain only letters, numbers, underscores, periods, and hyphens.`,
      );
    }

    if (this.scope.local) {
      // Local development mode - return mock data
      return {
        id,
        name,
        networkSecurityGroupId: networkSecurityGroupId || `local-${id}`,
        location: props.location || "eastus",
        securityRules: props.securityRules || [],
        resourceGroup: props.resourceGroup,
        tags: props.tags,
        type: "azure::NetworkSecurityGroup",
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
      if (props.delete !== false && networkSecurityGroupId) {
        try {
          await clients.network.networkSecurityGroups.beginDeleteAndWait(
            resourceGroupName,
            name,
          );
        } catch (error: any) {
          // Ignore 404 errors - resource already deleted
          if (error.statusCode !== 404) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Check for immutable property changes
    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace(); // Name is immutable
      }
      if (this.output.location !== location) {
        return this.replace(); // Location is immutable
      }
    }

    const requestBody: any = {
      location,
      tags: props.tags,
      properties: {
        securityRules:
          props.securityRules?.map((rule) => ({
            name: rule.name,
            properties: {
              priority: rule.priority,
              direction: rule.direction,
              access: rule.access,
              protocol: rule.protocol,
              sourceAddressPrefix: rule.sourceAddressPrefix || "*",
              sourcePortRange: rule.sourcePortRange || "*",
              destinationAddressPrefix: rule.destinationAddressPrefix || "*",
              destinationPortRange: rule.destinationPortRange || "*",
              description: rule.description,
            },
          })) || [],
      },
    };

    let result: any;

    if (networkSecurityGroupId) {
      // Update existing network security group
      result =
        await clients.network.networkSecurityGroups.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          requestBody,
        );
    } else {
      try {
        // Create new network security group
        result =
          await clients.network.networkSecurityGroups.beginCreateOrUpdateAndWait(
            resourceGroupName,
            name,
            requestBody,
          );
      } catch (error: any) {
        if (
          error.code === "ResourceAlreadyExists" ||
          error.statusCode === 409
        ) {
          if (!adopt) {
            throw new Error(
              `Network security group "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Get existing network security group to verify it exists
          await clients.network.networkSecurityGroups.get(
            resourceGroupName,
            name,
          );

          // Update with requested configuration
          result =
            await clients.network.networkSecurityGroups.beginCreateOrUpdateAndWait(
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
      networkSecurityGroupId: result.id!,
      location: result.location!,
      securityRules:
        result.properties?.securityRules?.map((rule: any) => ({
          name: rule.name!,
          priority: rule.properties?.priority!,
          direction: rule.properties?.direction!,
          access: rule.properties?.access!,
          protocol: rule.properties?.protocol!,
          sourceAddressPrefix: rule.properties?.sourceAddressPrefix,
          sourcePortRange: rule.properties?.sourcePortRange,
          destinationAddressPrefix: rule.properties?.destinationAddressPrefix,
          destinationPortRange: rule.properties?.destinationPortRange,
          description: rule.properties?.description,
        })) || [],
      resourceGroup: props.resourceGroup,
      tags: result.tags,
      type: "azure::NetworkSecurityGroup",
    };
  },
);

/**
 * Type guard to check if a resource is a NetworkSecurityGroup
 */
export function isNetworkSecurityGroup(
  resource: any,
): resource is NetworkSecurityGroup {
  return resource?.[ResourceKind] === "azure::NetworkSecurityGroup";
}

import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";

export interface PublicIPAddressProps extends AzureClientProps {
  /**
   * Name of the public IP address
   * Must be 1-80 characters, letters, numbers, underscores, periods, and hyphens
   * Must start with letter or number and end with letter, number or underscore
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this public IP address in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this public IP address
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * SKU tier for the public IP address
   * Standard SKU is required for zone-redundant deployments
   * @default "Standard"
   */
  sku?: "Basic" | "Standard";

  /**
   * IP address allocation method
   * - Static: IP address is allocated immediately and doesn't change
   * - Dynamic: IP address is allocated when resource is attached (Basic SKU only)
   * @default "Static"
   */
  allocationMethod?: "Static" | "Dynamic";

  /**
   * IP address version
   * @default "IPv4"
   */
  ipVersion?: "IPv4" | "IPv6";

  /**
   * DNS domain name label
   * Creates a DNS record: <label>.<region>.cloudapp.azure.com
   * Must be lowercase, 3-63 characters, letters, numbers, and hyphens
   */
  domainNameLabel?: string;

  /**
   * Idle timeout in minutes (4-30)
   * Time before TCP connection is closed due to inactivity
   * @default 4
   */
  idleTimeoutInMinutes?: number;

  /**
   * Availability zones for zone-redundant deployment
   * Only available with Standard SKU
   * @example ["1", "2", "3"]
   */
  zones?: string[];

  /**
   * Tags to apply to the public IP address
   * @example { environment: "production", purpose: "load-balancer" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing public IP address
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the public IP address when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal public IP address ID for lifecycle management
   * @internal
   */
  publicIpAddressId?: string;
}

export type PublicIPAddress = Omit<PublicIPAddressProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The public IP address name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID
   */
  publicIpAddressId: string;

  /**
   * The allocated IP address (only set when allocated)
   */
  ipAddress?: string;

  /**
   * The fully qualified domain name (FQDN)
   * Only set if domainNameLabel is specified
   */
  fqdn?: string;

  /**
   * Provisioning state
   */
  provisioningState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::PublicIPAddress";
};

/**
 * Azure Public IP Address for external connectivity
 *
 * Public IP Addresses provide external connectivity for Azure resources,
 * equivalent to AWS Elastic IP. They can be attached to load balancers,
 * NAT gateways, VPN gateways, application gateways, and virtual machines.
 *
 * @example
 * ## Basic Public IP Address
 *
 * Create a static public IP address:
 *
 * ```ts
 * const rg = await ResourceGroup("network-rg", {
 *   location: "eastus"
 * });
 *
 * const publicIp = await PublicIPAddress("app-ip", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   allocationMethod: "Static"
 * });
 *
 * console.log(`IP Address: ${publicIp.ipAddress}`);
 * ```
 *
 * @example
 * ## Public IP with DNS Label
 *
 * Create a public IP with a custom DNS name:
 *
 * ```ts
 * const publicIp = await PublicIPAddress("web-ip", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   domainNameLabel: "myapp",
 *   tags: {
 *     purpose: "web-server"
 *   }
 * });
 *
 * console.log(`FQDN: ${publicIp.fqdn}`);
 * // Output: myapp.eastus.cloudapp.azure.com
 * ```
 *
 * @example
 * ## Zone-Redundant Public IP
 *
 * Create a zone-redundant public IP for high availability:
 *
 * ```ts
 * const publicIp = await PublicIPAddress("ha-ip", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   sku: "Standard",
 *   zones: ["1", "2", "3"],
 *   allocationMethod: "Static"
 * });
 * ```
 *
 * @example
 * ## IPv6 Public IP
 *
 * Create an IPv6 public IP address:
 *
 * ```ts
 * const publicIpV6 = await PublicIPAddress("ipv6-ip", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   ipVersion: "IPv6",
 *   allocationMethod: "Static"
 * });
 * ```
 *
 * @example
 * ## Public IP for Load Balancer
 *
 * Create a public IP for use with a load balancer:
 *
 * ```ts
 * const lbIp = await PublicIPAddress("lb-ip", {
 *   resourceGroup: rg,
 *   location: "eastus",
 *   sku: "Standard",
 *   allocationMethod: "Static",
 *   domainNameLabel: "mylb",
 *   idleTimeoutInMinutes: 30
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Public IP
 *
 * Adopt an existing public IP address:
 *
 * ```ts
 * const publicIp = await PublicIPAddress("existing-ip", {
 *   name: "my-existing-ip",
 *   resourceGroup: "existing-rg",
 *   location: "eastus",
 *   adopt: true
 * });
 * ```
 */
export const PublicIPAddress = Resource(
  "azure::PublicIPAddress",
  async function (
    this: Context<PublicIPAddress>,
    id: string,
    props: PublicIPAddressProps,
  ): Promise<PublicIPAddress> {
    const publicIpAddressId =
      props.publicIpAddressId || this.output?.publicIpAddressId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    // Validate name format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,78}[a-zA-Z0-9_]$/.test(name)) {
      throw new Error(
        `Public IP address name "${name}" is invalid. Must be 1-80 characters, start with letter or number, end with letter/number/underscore, and contain only letters, numbers, underscores, periods, and hyphens.`,
      );
    }

    // Validate domain name label if provided
    if (props.domainNameLabel) {
      if (!/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(props.domainNameLabel)) {
        throw new Error(
          `Domain name label "${props.domainNameLabel}" is invalid. Must be 3-63 characters, lowercase, start with letter, end with letter or number, and contain only letters, numbers, and hyphens.`,
        );
      }
    }

    // Validate idle timeout
    if (
      props.idleTimeoutInMinutes &&
      (props.idleTimeoutInMinutes < 4 || props.idleTimeoutInMinutes > 30)
    ) {
      throw new Error(
        `Idle timeout must be between 4 and 30 minutes, got ${props.idleTimeoutInMinutes}`,
      );
    }

    if (this.scope.local) {
      // Local development mode - return mock data
      return {
        id,
        name,
        publicIpAddressId: publicIpAddressId || `local-${id}`,
        location: props.location || "eastus",
        ipAddress: "203.0.113.1", // Mock IP from TEST-NET-3
        fqdn: props.domainNameLabel
          ? `${props.domainNameLabel}.${props.location || "eastus"}.cloudapp.azure.com`
          : undefined,
        provisioningState: "Succeeded",
        resourceGroup: props.resourceGroup,
        sku: props.sku || "Standard",
        allocationMethod: props.allocationMethod || "Static",
        ipVersion: props.ipVersion || "IPv4",
        domainNameLabel: props.domainNameLabel,
        idleTimeoutInMinutes: props.idleTimeoutInMinutes || 4,
        zones: props.zones,
        tags: props.tags,
        type: "azure::PublicIPAddress",
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
      if (props.delete !== false && publicIpAddressId) {
        try {
          await clients.network.publicIPAddresses.beginDeleteAndWait(
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
      if (this.output.sku !== (props.sku || "Standard")) {
        return this.replace(); // SKU is immutable
      }
      if (this.output.ipVersion !== (props.ipVersion || "IPv4")) {
        return this.replace(); // IP version is immutable
      }
    }

    const requestBody: any = {
      location,
      tags: props.tags,
      sku: {
        name: props.sku || "Standard",
      },
      properties: {
        publicIPAllocationMethod: props.allocationMethod || "Static",
        publicIPAddressVersion: props.ipVersion || "IPv4",
        idleTimeoutInMinutes: props.idleTimeoutInMinutes || 4,
      },
    };

    // Add DNS settings if domain name label is specified
    if (props.domainNameLabel) {
      requestBody.properties.dnsSettings = {
        domainNameLabel: props.domainNameLabel,
      };
    }

    // Add zones for zone-redundant deployment
    if (props.zones && props.zones.length > 0) {
      requestBody.zones = props.zones;
    }

    let result: any;

    if (publicIpAddressId) {
      // Update existing public IP address
      result =
        await clients.network.publicIPAddresses.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          requestBody,
        );
    } else {
      try {
        // Create new public IP address
        result =
          await clients.network.publicIPAddresses.beginCreateOrUpdateAndWait(
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
              `Public IP address "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Get existing public IP address to verify it exists
          await clients.network.publicIPAddresses.get(resourceGroupName, name);

          // Update with requested configuration
          result =
            await clients.network.publicIPAddresses.beginCreateOrUpdateAndWait(
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
      publicIpAddressId: result.id!,
      location: result.location!,
      ipAddress: result.properties?.ipAddress,
      fqdn: result.properties?.dnsSettings?.fqdn,
      provisioningState: result.properties?.provisioningState,
      resourceGroup: props.resourceGroup,
      sku: result.sku?.name,
      allocationMethod: result.properties?.publicIPAllocationMethod,
      ipVersion: result.properties?.publicIPAddressVersion,
      domainNameLabel: result.properties?.dnsSettings?.domainNameLabel,
      idleTimeoutInMinutes: result.properties?.idleTimeoutInMinutes,
      zones: result.zones,
      tags: result.tags,
      type: "azure::PublicIPAddress",
    };
  },
);

/**
 * Type guard to check if a resource is a PublicIPAddress
 */
export function isPublicIPAddress(resource: any): resource is PublicIPAddress {
  return resource?.[ResourceKind] === "azure::PublicIPAddress";
}

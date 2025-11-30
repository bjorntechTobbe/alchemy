import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { Profile } from "@azure/arm-cdn";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface CDNProfileProps extends AzureClientProps {
  /**
   * Name of the CDN profile
   * Must be 1-260 characters, alphanumeric and hyphens only
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this CDN profile in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this CDN profile
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The pricing tier (SKU) for this CDN profile
   * - Standard_Microsoft: Microsoft CDN, good performance, Azure-native
   * - Standard_Akamai: Akamai CDN, global reach, fast
   * - Standard_Verizon: Verizon CDN, advanced features
   * - Premium_Verizon: Premium Verizon CDN, rules engine, advanced analytics
   * - Standard_AzureFrontDoor: Azure Front Door Standard (recommended for modern apps)
   * - Premium_AzureFrontDoor: Azure Front Door Premium with WAF and private link
   * @default "Standard_Microsoft"
   */
  sku?:
    | "Standard_Microsoft"
    | "Standard_Akamai"
    | "Standard_Verizon"
    | "Premium_Verizon"
    | "Standard_AzureFrontDoor"
    | "Premium_AzureFrontDoor";

  /**
   * Tags to apply to the CDN profile
   * @example { environment: "production", purpose: "cdn" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing CDN profile
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the CDN profile when removed from Alchemy
   * WARNING: Deleting a CDN profile deletes ALL endpoints under it
   * @default true
   */
  delete?: boolean;

  /**
   * Internal CDN profile ID for lifecycle management
   * @internal
   */
  cdnProfileId?: string;
}

export type CDNProfile = Omit<CDNProfileProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The CDN profile name (required in output)
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
   * The CDN profile ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Cdn/profiles/{profileName}
   */
  cdnProfileId: string;

  /**
   * The pricing tier
   */
  sku:
    | "Standard_Microsoft"
    | "Standard_Akamai"
    | "Standard_Verizon"
    | "Premium_Verizon"
    | "Standard_AzureFrontDoor"
    | "Premium_AzureFrontDoor";

  /**
   * Provisioning state of the profile
   */
  provisioningState?: string;

  /**
   * Resource state (Active, Creating, Deleting, Disabled)
   */
  resourceState?: string;

  /**
   * Resource type identifier for binding
   * @internal
   */
  type: "azure::CDNProfile";
};

/**
 * Type guard to check if a resource is a CDN profile
 */
export function isCDNProfile(resource: unknown): resource is CDNProfile {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::CDNProfile"
  );
}

/**
 * Azure CDN Profile - Content Delivery Network profile container
 *
 * A CDN profile is a container for CDN endpoints. All endpoints in a profile share the same
 * pricing tier (SKU) and configuration. Use CDN to accelerate content delivery globally by
 * caching content at edge locations close to end users.
 *
 * **AWS Equivalent**: CloudFront Distribution (container)
 * **Cloudflare Equivalent**: Zone with CDN enabled
 *
 * @example
 * ## Basic CDN Profile with Microsoft CDN
 *
 * Create a CDN profile for content acceleration:
 *
 * ```ts
 * const rg = await ResourceGroup("cdn-rg", {
 *   location: "eastus"
 * });
 *
 * const cdn = await CDNProfile("content-cdn", {
 *   resourceGroup: rg,
 *   sku: "Standard_Microsoft" // Azure-native CDN
 * });
 *
 * console.log(cdn.cdnProfileId); // Profile ID for creating endpoints
 * ```
 *
 * @example
 * ## Azure Front Door Standard Profile
 *
 * Create a modern CDN profile with Azure Front Door:
 *
 * ```ts
 * const cdn = await CDNProfile("frontdoor", {
 *   resourceGroup: rg,
 *   sku: "Standard_AzureFrontDoor", // Modern, recommended
 *   tags: { environment: "production" }
 * });
 * ```
 *
 * @example
 * ## Premium Verizon with Advanced Features
 *
 * Create a premium CDN profile with rules engine and analytics:
 *
 * ```ts
 * const cdn = await CDNProfile("premium-cdn", {
 *   resourceGroup: rg,
 *   sku: "Premium_Verizon" // Advanced features, rules engine
 * });
 * ```
 */
export const CDNProfile = Resource(
  "azure::CDNProfile",
  async function (
    this: Context<CDNProfile>,
    id: string,
    props: CDNProfileProps,
  ): Promise<CDNProfile> {
    const cdnProfileId = props.cdnProfileId || this.output?.cdnProfileId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    // Validate name format
    if (name.length < 1 || name.length > 260) {
      throw new Error(
        `CDN profile name must be 1-260 characters, got: ${name}`,
      );
    }

    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
      throw new Error(
        `CDN profile name must contain only alphanumeric characters and hyphens, got: ${name}`,
      );
    }

    // Get resource group name
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    // Get location from resource group if not specified
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

    const sku = props.sku ?? this.output?.sku ?? "Standard_Microsoft";

    // Local development mode
    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        cdnProfileId: cdnProfileId || "",
        sku,
        provisioningState: "Succeeded",
        resourceState: "Active",
        type: "azure::CDNProfile",
      };
    }

    // Create Azure clients
    const { cdn } = await createAzureClients(props);

    // Handle deletion
    if (this.phase === "delete") {
      if (props.delete === false) {
        // Don't delete the profile, just remove from state
        return this.destroy();
      }

      if (!cdnProfileId) {
        console.warn(`No cdnProfileId found for ${id}, skipping delete`);
        return this.destroy();
      }

      try {
        await cdn.profiles.beginDeleteAndWait(resourceGroupName, name);
      } catch (error) {
        if (!isNotFoundError(error)) {
          console.error(`Error deleting CDN profile ${id}:`, error);
          throw error;
        }
      }
      return this.destroy();
    }

    // Check for replacement due to immutable properties
    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace();
      }
      if (this.output.location !== location) {
        return this.replace();
      }
      if (this.output.sku !== sku) {
        return this.replace();
      }
    }

    // Prepare profile parameters
    const profileParams: Profile = {
      location,
      sku: {
        name: sku,
      },
      tags: props.tags,
    };

    let profile: Profile;

    if (cdnProfileId) {
      // Update existing profile
      profile = await cdn.profiles.beginCreateAndWait(
        resourceGroupName,
        name,
        profileParams,
      );
    } else {
      try {
        // Create new profile
        profile = await cdn.profiles.beginCreateAndWait(
          resourceGroupName,
          name,
          profileParams,
        );
      } catch (error) {
        // Handle name conflicts with adoption
        if (error.code === "ProfileAlreadyExists" || error.statusCode === 409) {
          if (!adopt) {
            throw new Error(
              `CDN profile "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Try to get existing profile
          try {
            profile = await cdn.profiles.get(resourceGroupName, name);
            // Update with desired configuration
            profile = await cdn.profiles.beginCreateAndWait(
              resourceGroupName,
              name,
              profileParams,
            );
          } catch (getError) {
            throw new Error(
              `CDN profile "${name}" failed to create due to name conflict and could not be found for adoption.`,
              { cause: getError },
            );
          }
        } else {
          throw error;
        }
      }
    }

    return {
      id,
      name: profile.name!,
      resourceGroup: resourceGroupName,
      location: profile.location!,
      cdnProfileId: profile.id!,
      sku,
      provisioningState: profile.provisioningState,
      resourceState: profile.resourceState,
      tags: props.tags,
      type: "azure::CDNProfile",
    };
  },
);

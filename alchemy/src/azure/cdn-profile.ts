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
   *
   * **IMPORTANT**: Classic CDN SKUs (Standard_Microsoft, Standard_Akamai, Standard_Verizon, Premium_Verizon)
   * are deprecated by Azure and no longer support new profile creation. Use Azure Front Door SKUs instead.
   *
   * - Standard_AzureFrontDoor: Azure Front Door Standard (recommended, requires location: "global")
   * - Premium_AzureFrontDoor: Azure Front Door Premium with WAF and private link (requires location: "global")
   * - Standard_Microsoft: ⚠️ DEPRECATED - Microsoft CDN (not supported for new profiles)
   * - Standard_Akamai: ⚠️ DEPRECATED - Akamai CDN (not supported for new profiles)
   * - Standard_Verizon: ⚠️ DEPRECATED - Verizon CDN (not supported for new profiles)
   * - Premium_Verizon: ⚠️ DEPRECATED - Premium Verizon CDN (not supported for new profiles)
   *
   * @default "Standard_AzureFrontDoor"
   */
  sku?:
    | "Standard_AzureFrontDoor"
    | "Premium_AzureFrontDoor"
    | "Standard_Microsoft"
    | "Standard_Akamai"
    | "Standard_Verizon"
    | "Premium_Verizon";

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
 * ## Azure Front Door Standard Profile
 *
 * Create a CDN profile with Azure Front Door (recommended):
 *
 * ```ts
 * const rg = await ResourceGroup("cdn-rg", {
 *   location: "eastus"
 * });
 *
 * const cdn = await CDNProfile("content-cdn", {
 *   resourceGroup: rg,
 *   location: "global", // Azure Front Door requires global location
 *   sku: "Standard_AzureFrontDoor" // Default, recommended
 * });
 *
 * console.log(cdn.cdnProfileId); // Profile ID for creating endpoints
 * ```
 *
 * @example
 * ## Azure Front Door Premium with WAF
 *
 * Create a premium CDN profile with Web Application Firewall:
 *
 * ```ts
 * const cdn = await CDNProfile("premium-cdn", {
 *   resourceGroup: rg,
 *   location: "global",
 *   sku: "Premium_AzureFrontDoor", // Includes WAF, private link
 *   tags: { environment: "production" }
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

    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    const sku = props.sku ?? this.output?.sku ?? "Standard_AzureFrontDoor";
    const isFrontDoor =
      sku === "Standard_AzureFrontDoor" || sku === "Premium_AzureFrontDoor";

    let location: string;
    if (isFrontDoor) {
      location = "global";
    } else {
      location =
        props.location ||
        this.output?.location ||
        (typeof props.resourceGroup === "string"
          ? undefined
          : props.resourceGroup.location) ||
        "";

      if (!location) {
        throw new Error(
          "Location must be specified either directly or via ResourceGroup object for classic CDN SKUs",
        );
      }
    }

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

    const { cdn } = await createAzureClients(props);

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
      } catch (error: any) {
        if (!isNotFoundError(error)) {
          console.error(`Error deleting CDN profile ${id}:`, error);
          throw error;
        }
      }
      return this.destroy();
    }

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

    const profileParams: Profile = {
      location,
      sku: {
        name: sku,
      },
      tags: props.tags,
    };

    let profile: Profile;

    if (cdnProfileId) {
      profile = await cdn.profiles.beginCreateAndWait(
        resourceGroupName,
        name,
        profileParams,
      );
    } else {
      try {
        profile = await cdn.profiles.beginCreateAndWait(
          resourceGroupName,
          name,
          profileParams,
        );
      } catch (error: any) {
        if (error.code === "ProfileAlreadyExists" || error.statusCode === 409) {
          if (!adopt) {
            throw new Error(
              `CDN profile "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          try {
            profile = await cdn.profiles.get(resourceGroupName, name);
            profile = await cdn.profiles.beginCreateAndWait(
              resourceGroupName,
              name,
              profileParams,
            );
          } catch (getError: any) {
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

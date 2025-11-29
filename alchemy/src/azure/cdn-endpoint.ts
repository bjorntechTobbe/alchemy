import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { CDNProfile } from "./cdn-profile.ts";
import type { Endpoint, DeepCreatedOrigin } from "@azure/arm-cdn";

export interface CDNEndpointProps extends AzureClientProps {
  /**
   * Name of the CDN endpoint
   * Must be globally unique (forms part of the hostname)
   * Must be 1-50 characters, lowercase alphanumeric and hyphens only
   * @default ${app}-${stage}-${id} (lowercase)
   */
  name?: string;

  /**
   * The CDN profile to create this endpoint in
   * Can be a CDNProfile object or the name of an existing profile
   */
  profile: string | CDNProfile;

  /**
   * The resource group containing the CDN profile
   * Required when using string profile reference
   */
  resourceGroup?: string;

  /**
   * Azure region for this CDN endpoint
   * @default Inherited from CDN profile
   */
  location?: string;

  /**
   * Origin servers to pull content from
   * At least one origin is required
   */
  origins: Array<{
    /**
     * Name of the origin
     */
    name: string;

    /**
     * Hostname of the origin server
     * @example "myapp.azurewebsites.net", "storage.blob.core.windows.net"
     */
    hostName: string;

    /**
     * HTTP port for origin connections
     * @default 80
     */
    httpPort?: number;

    /**
     * HTTPS port for origin connections
     * @default 443
     */
    httpsPort?: number;

    /**
     * Host header to send to the origin
     * @default Same as hostName
     */
    originHostHeader?: string;

    /**
     * Priority for this origin (used in origin groups)
     * @default 1
     */
    priority?: number;

    /**
     * Weight for this origin (used in origin groups for load balancing)
     * @default 1000
     */
    weight?: number;
  }>;

  /**
   * Whether the endpoint is enabled
   * @default true
   */
  isHttpAllowed?: boolean;

  /**
   * Whether HTTPS is allowed
   * @default true
   */
  isHttpsAllowed?: boolean;

  /**
   * Query string caching behavior
   * - NotSet: Default behavior (varies by SKU)
   * - IgnoreQueryString: Query strings are ignored for caching
   * - BypassCaching: Bypass cache for URLs with query strings
   * - UseQueryString: Cache every unique URL with query strings
   * @default "IgnoreQueryString"
   */
  queryStringCachingBehavior?:
    | "NotSet"
    | "IgnoreQueryString"
    | "BypassCaching"
    | "UseQueryString";

  /**
   * Optimization type for content delivery
   * - GeneralWebDelivery: Standard web content
   * - GeneralMediaStreaming: Video and audio streaming
   * - VideoOnDemandMediaStreaming: On-demand video
   * - LargeFileDownload: Large file downloads (> 10 MB)
   * - DynamicSiteAcceleration: Dynamic content acceleration
   * @default "GeneralWebDelivery"
   */
  optimizationType?:
    | "GeneralWebDelivery"
    | "GeneralMediaStreaming"
    | "VideoOnDemandMediaStreaming"
    | "LargeFileDownload"
    | "DynamicSiteAcceleration";

  /**
   * Content types to compress
   * @default Common web content types (text/html, text/css, application/json, etc.)
   */
  contentTypesToCompress?: string[];

  /**
   * Whether compression is enabled
   * @default true
   */
  isCompressionEnabled?: boolean;

  /**
   * Tags to apply to the CDN endpoint
   * @example { environment: "production", purpose: "cdn" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing CDN endpoint
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the CDN endpoint when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal CDN endpoint ID for lifecycle management
   * @internal
   */
  cdnEndpointId?: string;
}

export type CDNEndpoint = Omit<CDNEndpointProps, "delete" | "adopt" | "profile"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The CDN endpoint name (required in output)
   */
  name: string;

  /**
   * The CDN profile name (required in output)
   */
  profile: string;

  /**
   * The resource group name (required in output)
   */
  resourceGroup: string;

  /**
   * Azure region (required in output)
   */
  location: string;

  /**
   * The CDN endpoint ID
   * Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Cdn/profiles/{profileName}/endpoints/{endpointName}
   */
  cdnEndpointId: string;

  /**
   * The endpoint hostname
   * Format: {endpointName}.azureedge.net
   */
  hostName: string;

  /**
   * Provisioning state of the endpoint
   */
  provisioningState?: string;

  /**
   * Resource state (Creating, Active, Deleting)
   */
  resourceState?: string;

  /**
   * Resource type identifier for binding
   * @internal
   */
  type: "azure::CDNEndpoint";
};

/**
 * Type guard to check if a resource is a CDN endpoint
 */
export function isCDNEndpoint(resource: any): resource is CDNEndpoint {
  return resource?.[ResourceKind] === "azure::CDNEndpoint";
}

/**
 * Azure CDN Endpoint - Content delivery endpoint
 *
 * A CDN endpoint is the actual content delivery point that caches and serves content from
 * origin servers. Each endpoint has a unique hostname (*.azureedge.net) and can be configured
 * with caching rules, compression, and optimization settings.
 *
 * **AWS Equivalent**: CloudFront Distribution
 * **Cloudflare Equivalent**: DNS record with CDN proxying enabled
 *
 * @example
 * ## Basic CDN Endpoint for Static Website
 *
 * Create a CDN endpoint to cache and deliver static website content:
 *
 * ```ts
 * const cdn = await CDNProfile("content-cdn", {
 *   resourceGroup: rg,
 *   sku: "Standard_Microsoft"
 * });
 *
 * const endpoint = await CDNEndpoint("website", {
 *   profile: cdn,
 *   origins: [{
 *     name: "storage-origin",
 *     hostName: "mystorage.blob.core.windows.net"
 *   }],
 *   isCompressionEnabled: true,
 *   queryStringCachingBehavior: "IgnoreQueryString"
 * });
 *
 * console.log(endpoint.hostName); // website.azureedge.net
 * ```
 *
 * @example
 * ## CDN for Large File Downloads
 *
 * Optimize for large file delivery:
 *
 * ```ts
 * const endpoint = await CDNEndpoint("downloads", {
 *   profile: cdn,
 *   origins: [{
 *     name: "download-server",
 *     hostName: "downloads.mycompany.com",
 *     httpsPort: 443
 *   }],
 *   optimizationType: "LargeFileDownload",
 *   queryStringCachingBehavior: "UseQueryString"
 * });
 * ```
 *
 * @example
 * ## CDN for Video Streaming
 *
 * Optimize for media streaming:
 *
 * ```ts
 * const endpoint = await CDNEndpoint("video", {
 *   profile: cdn,
 *   origins: [{
 *     name: "media-origin",
 *     hostName: "video.mycompany.com"
 *   }],
 *   optimizationType: "GeneralMediaStreaming",
 *   isHttpsAllowed: true,
 *   isHttpAllowed: false // HTTPS only
 * });
 * ```
 */
export const CDNEndpoint = Resource(
  "azure::CDNEndpoint",
  async function (
    this: Context<CDNEndpoint>,
    id: string,
    props: CDNEndpointProps,
  ): Promise<CDNEndpoint> {
    const cdnEndpointId = props.cdnEndpointId || this.output?.cdnEndpointId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");

    // Validate name format
    if (name.length < 1 || name.length > 50) {
      throw new Error(`CDN endpoint name must be 1-50 characters, got: ${name}`);
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `CDN endpoint name must contain only lowercase alphanumeric characters and hyphens, got: ${name}`,
      );
    }

    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `CDN endpoint name cannot start or end with a hyphen, got: ${name}`,
      );
    }

    // Get profile and resource group names
    const profileName = typeof props.profile === "string" ? props.profile : props.profile.name;
    const resourceGroupName =
      props.resourceGroup ||
      (typeof props.profile === "string" ? undefined : props.profile.resourceGroup);

    if (!resourceGroupName) {
      throw new Error(
        "Resource group must be specified either via resourceGroup prop or CDNProfile object",
      );
    }

    // Get location from profile if not specified
    const location =
      props.location ||
      this.output?.location ||
      (typeof props.profile === "string" ? undefined : props.profile.location);

    if (!location) {
      throw new Error(
        "Location must be specified either directly or via CDNProfile object",
      );
    }

    // Local development mode
    if (this.scope.local) {
      return {
        id,
        name,
        profile: profileName,
        resourceGroup: resourceGroupName,
        location,
        cdnEndpointId: cdnEndpointId || "",
        hostName: `${name}.azureedge.net`,
        provisioningState: "Succeeded",
        resourceState: "Active",
        origins: props.origins,
        isHttpAllowed: props.isHttpAllowed,
        isHttpsAllowed: props.isHttpsAllowed,
        queryStringCachingBehavior: props.queryStringCachingBehavior,
        optimizationType: props.optimizationType,
        contentTypesToCompress: props.contentTypesToCompress,
        isCompressionEnabled: props.isCompressionEnabled,
        type: "azure::CDNEndpoint",
      };
    }

    // Create Azure clients
    const { cdn } = await createAzureClients(props);

    // Handle deletion
    if (this.phase === "delete") {
      if (props.delete === false) {
        // Don't delete the endpoint, just remove from state
        return this.destroy();
      }

      if (!cdnEndpointId) {
        console.warn(`No cdnEndpointId found for ${id}, skipping delete`);
        return this.destroy();
      }

      try {
        await cdn.endpoints.beginDeleteAndWait(resourceGroupName, profileName, name);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          console.error(`Error deleting CDN endpoint ${id}:`, error);
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
      if (this.output.profile !== profileName) {
        return this.replace();
      }
    }

    // Convert origins to Azure SDK format
    const origins: DeepCreatedOrigin[] = props.origins.map((origin) => ({
      name: origin.name,
      hostName: origin.hostName,
      httpPort: origin.httpPort ?? 80,
      httpsPort: origin.httpsPort ?? 443,
      originHostHeader: origin.originHostHeader ?? origin.hostName,
      priority: origin.priority ?? 1,
      weight: origin.weight ?? 1000,
    }));

    // Prepare endpoint parameters
    const endpointParams: Endpoint = {
      location,
      origins,
      isHttpAllowed: props.isHttpAllowed ?? true,
      isHttpsAllowed: props.isHttpsAllowed ?? true,
      queryStringCachingBehavior: props.queryStringCachingBehavior ?? "IgnoreQueryString",
      optimizationType: props.optimizationType ?? "GeneralWebDelivery",
      isCompressionEnabled: props.isCompressionEnabled ?? true,
      contentTypesToCompress: props.contentTypesToCompress ?? [
        "text/plain",
        "text/html",
        "text/css",
        "application/x-javascript",
        "text/javascript",
        "application/javascript",
        "application/json",
        "application/xml",
      ],
      tags: props.tags,
    };

    let endpoint: Endpoint;

    if (cdnEndpointId) {
      // Update existing endpoint
      endpoint = await cdn.endpoints.beginCreateAndWait(
        resourceGroupName,
        profileName,
        name,
        endpointParams,
      );
    } else {
      try {
        // Create new endpoint
        endpoint = await cdn.endpoints.beginCreateAndWait(
          resourceGroupName,
          profileName,
          name,
          endpointParams,
        );
      } catch (error: any) {
        // Handle name conflicts with adoption
        if (error.code === "EndpointAlreadyExists" || error.statusCode === 409) {
          if (!adopt) {
            throw new Error(
              `CDN endpoint "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Try to get existing endpoint
          try {
            endpoint = await cdn.endpoints.get(resourceGroupName, profileName, name);
            // Update with desired configuration
            endpoint = await cdn.endpoints.beginCreateAndWait(
              resourceGroupName,
              profileName,
              name,
              endpointParams,
            );
          } catch (getError: any) {
            throw new Error(
              `CDN endpoint "${name}" failed to create due to name conflict and could not be found for adoption.`,
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
      name: endpoint.name!,
      profile: profileName,
      resourceGroup: resourceGroupName,
      location: endpoint.location!,
      cdnEndpointId: endpoint.id!,
      hostName: endpoint.hostName!,
      provisioningState: endpoint.provisioningState,
      resourceState: endpoint.resourceState,
      origins: props.origins,
      isHttpAllowed: props.isHttpAllowed,
      isHttpsAllowed: props.isHttpsAllowed,
      queryStringCachingBehavior: props.queryStringCachingBehavior,
      optimizationType: props.optimizationType,
      contentTypesToCompress: props.contentTypesToCompress,
      isCompressionEnabled: props.isCompressionEnabled,
      tags: props.tags,
      type: "azure::CDNEndpoint",
    };
  },
);

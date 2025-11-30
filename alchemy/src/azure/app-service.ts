import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { UserAssignedIdentity } from "./user-assigned-identity.ts";
import type { Site } from "@azure/arm-appservice";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface AppServiceProps extends AzureClientProps {
  /**
   * Name of the app service
   * Must be 2-60 characters, alphanumeric and hyphens only
   * Must be globally unique across all of Azure (creates {name}.azurewebsites.net)
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this app service in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this app service
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The pricing tier (App Service Plan SKU)
   * @default "B1" (Basic 1)
   */
  sku?:
    | "F1" // Free
    | "D1" // Shared
    | "B1" // Basic 1
    | "B2" // Basic 2
    | "B3" // Basic 3
    | "S1" // Standard 1
    | "S2" // Standard 2
    | "S3" // Standard 3
    | "P1V2" // Premium V2 1
    | "P2V2" // Premium V2 2
    | "P3V2" // Premium V2 3
    | "P1V3" // Premium V3 1
    | "P2V3" // Premium V3 2
    | "P3V3"; // Premium V3 3

  /**
   * The runtime stack for the app service
   * @default "node"
   */
  runtime?: "node" | "python" | "dotnet" | "java" | "php" | "ruby";

  /**
   * Runtime version (e.g., "18", "20" for Node.js, "3.9", "3.11" for Python)
   * @default "20" for Node.js
   */
  runtimeVersion?: string;

  /**
   * Operating system
   * @default "linux"
   */
  os?: "linux" | "windows";

  /**
   * User-assigned managed identity for secure access to other Azure resources
   * Recommended over connection strings for accessing storage, databases, etc.
   */
  identity?: UserAssignedIdentity;

  /**
   * Application settings (environment variables)
   * @example { NODE_ENV: "production", API_KEY: alchemy.secret.env.API_KEY }
   */
  appSettings?: Record<string, string | Secret>;

  /**
   * Enable HTTPS only (redirect HTTP to HTTPS)
   * @default true
   */
  httpsOnly?: boolean;

  /**
   * Enable Always On (keeps the app loaded even when idle)
   * Not available on Free tier
   * @default true
   */
  alwaysOn?: boolean;

  /**
   * Enable local MySQL in-app database
   * Windows only
   * @default false
   */
  localMySqlEnabled?: boolean;

  /**
   * Enable FTP deployments
   * @default false
   */
  ftpsState?: "AllAllowed" | "FtpsOnly" | "Disabled";

  /**
   * Minimum TLS version
   * @default "1.2"
   */
  minTlsVersion?: "1.0" | "1.1" | "1.2" | "1.3";

  /**
   * Tags to apply to the app service
   * @example { environment: "production", team: "backend" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing app service
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the app service when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal app service ID for lifecycle management
   * @internal
   */
  appServiceId?: string;
}

export type AppService = Omit<AppServiceProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The app service name (required in output)
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
   * The default hostname
   * @example my-app-service.azurewebsites.net
   */
  defaultHostname: string;

  /**
   * The app service URL
   * @example https://my-app-service.azurewebsites.net
   */
  url: string;

  /**
   * The outbound IP addresses
   */
  outboundIpAddresses?: string;

  /**
   * The possible outbound IP addresses
   */
  possibleOutboundIpAddresses?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::AppService";
};

/**
 * Azure App Service - PaaS web hosting for containers and code
 *
 * Azure App Service is a fully managed platform for building, deploying, and scaling
 * web apps. It's equivalent to AWS Elastic Beanstalk and supports multiple languages
 * and frameworks.
 *
 * Key features:
 * - Fully managed infrastructure (no server management)
 * - Support for multiple runtimes (Node.js, Python, .NET, Java, PHP, Ruby)
 * - Built-in autoscaling capabilities
 * - Deployment slots for staging and blue-green deployments
 * - Integration with Azure DevOps and GitHub Actions
 * - Custom domains and SSL certificates
 * - VNet integration for private connectivity
 *
 * @example
 * ## Basic App Service
 *
 * Create a Node.js app service on Linux:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, AppService } from "alchemy/azure";
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
 * const appService = await AppService("web", {
 *   resourceGroup: rg,
 *   runtime: "node",
 *   runtimeVersion: "20",
 *   sku: "B1"
 * });
 *
 * console.log(`App Service URL: ${appService.url}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## App Service with Managed Identity
 *
 * Use managed identity to securely access other Azure resources:
 *
 * ```typescript
 * const identity = await UserAssignedIdentity("app-identity", {
 *   resourceGroup: rg
 * });
 *
 * const appService = await AppService("secure-web", {
 *   resourceGroup: rg,
 *   runtime: "node",
 *   identity: identity,
 *   sku: "S1"
 * });
 * ```
 *
 * @example
 * ## App Service with App Settings
 *
 * Configure environment variables and secrets:
 *
 * ```typescript
 * const appService = await AppService("configured-web", {
 *   resourceGroup: rg,
 *   runtime: "node",
 *   sku: "B1",
 *   appSettings: {
 *     NODE_ENV: "production",
 *     DATABASE_URL: alchemy.secret.env.DATABASE_URL,
 *     API_KEY: alchemy.secret.env.API_KEY
 *   }
 * });
 * ```
 *
 * @example
 * ## Python App Service
 *
 * Create a Python web application:
 *
 * ```typescript
 * const pythonApp = await AppService("python-web", {
 *   resourceGroup: rg,
 *   runtime: "python",
 *   runtimeVersion: "3.11",
 *   sku: "B1"
 * });
 * ```
 *
 * @example
 * ## Premium App Service
 *
 * Use Premium tier for production workloads:
 *
 * ```typescript
 * const premiumApp = await AppService("prod-web", {
 *   resourceGroup: rg,
 *   runtime: "node",
 *   runtimeVersion: "20",
 *   sku: "P1V3", // Premium V3
 *   alwaysOn: true,
 *   httpsOnly: true
 * });
 * ```
 */
export const AppService = Resource(
  "azure::AppService",
  async function (
    this: Context<AppService>,
    id: string,
    props: AppServiceProps,
  ): Promise<AppService> {
    const appServiceId = props.appServiceId || this.output?.appServiceId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

    // Validate name
    if (name.length < 2 || name.length > 60) {
      throw new Error(
        `App service name "${name}" must be between 2 and 60 characters`,
      );
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `App service name "${name}" must contain only lowercase letters, numbers, and hyphens`,
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `App service name "${name}" cannot start or end with a hyphen`,
      );
    }

    // Extract resource group information
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    // Get location (inherit from resource group if not specified)
    const location =
      props.location ||
      this.output?.location ||
      (typeof props.resourceGroup !== "string"
        ? props.resourceGroup.location
        : undefined);

    if (!location) {
      throw new Error(
        `Location is required when resourceGroup is provided as a string. ` +
          `Either provide a ResourceGroup object or specify location explicitly.`,
      );
    }

    const os = props.os || "linux";
    const runtime = props.runtime || "node";
    const runtimeVersion = props.runtimeVersion || "20";

    // Local development mode
    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        defaultHostname: `${name}.azurewebsites.net`,
        url: `https://${name}.azurewebsites.net`,
        runtime,
        runtimeVersion,
        os,
        sku: props.sku || "B1",
        httpsOnly: props.httpsOnly ?? true,
        alwaysOn: props.alwaysOn ?? true,
        ftpsState: props.ftpsState || "Disabled",
        minTlsVersion: props.minTlsVersion || "1.2",
        type: "azure::AppService",
      };
    }

    const clients = await createAzureClients(props);

    // Handle deletion
    if (this.phase === "delete") {
      if (!appServiceId) {
        console.warn(`No appServiceId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        try {
          await clients.appService.webApps.delete(resourceGroupName, name);
        } catch (error) {
          // Ignore 404 errors (already deleted)
          if (error?.statusCode !== 404) {
            console.error(`Error deleting app service ${id}:`, error);
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Check for immutable property changes
    if (this.phase === "update" && this.output) {
      if (this.output.location !== location) {
        return this.replace();
      }
      if (this.output.name !== name) {
        return this.replace();
      }
    }

    // Prepare app settings
    const appSettingsEntries = Object.entries(props.appSettings || {}).map(
      ([key, value]) => [
        key,
        typeof value === "string" ? value : Secret.unwrap(value),
      ],
    );
    const appSettings: Record<string, string> =
      Object.fromEntries(appSettingsEntries);

    // Prepare site config
    const siteConfig: Record<string, unknown> = {
      appSettings: Object.entries(appSettings).map(([name, value]) => ({
        name,
        value,
      })),
      httpsOnly: props.httpsOnly ?? true,
      alwaysOn: props.alwaysOn ?? props.sku !== "F1", // Always On not available on Free tier
      ftpsState: props.ftpsState || "Disabled",
      minTlsVersion: props.minTlsVersion || "1.2",
      localMySqlEnabled: props.localMySqlEnabled ?? false,
    };

    // Set runtime-specific properties based on OS
    if (os === "linux") {
      // Linux uses linuxFxVersion
      if (runtime === "node") {
        siteConfig.linuxFxVersion = `NODE|${runtimeVersion}`;
      } else if (runtime === "python") {
        siteConfig.linuxFxVersion = `PYTHON|${runtimeVersion}`;
      } else if (runtime === "dotnet") {
        siteConfig.linuxFxVersion = `DOTNETCORE|${runtimeVersion}`;
      } else if (runtime === "java") {
        siteConfig.linuxFxVersion = `JAVA|${runtimeVersion}`;
      } else if (runtime === "php") {
        siteConfig.linuxFxVersion = `PHP|${runtimeVersion}`;
      } else if (runtime === "ruby") {
        siteConfig.linuxFxVersion = `RUBY|${runtimeVersion}`;
      }
    } else {
      // Windows uses specific version properties
      if (runtime === "node") {
        siteConfig.nodeVersion = `~${runtimeVersion}`;
      } else if (runtime === "python") {
        siteConfig.pythonVersion = runtimeVersion;
      } else if (runtime === "dotnet") {
        siteConfig.netFrameworkVersion = `v${runtimeVersion}`;
      } else if (runtime === "php") {
        siteConfig.phpVersion = runtimeVersion;
      }
    }

    // Prepare identity configuration
    let identityConfig: Record<string, unknown> | undefined = undefined;
    if (props.identity) {
      const identityResourceId =
        `/subscriptions/${clients.subscriptionId}` +
        `/resourceGroups/${resourceGroupName}` +
        `/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${props.identity.name}`;

      identityConfig = {
        type: "UserAssigned",
        userAssignedIdentities: {
          [identityResourceId]: {},
        },
      };
    }

    // Prepare site envelope
    const siteEnvelope: Site = {
      location,
      tags: props.tags,
      kind: os === "linux" ? "app,linux" : "app",
      identity: identityConfig,
      siteConfig,
      reserved: os === "linux", // Reserved = true for Linux
    };

    let result: Site;

    try {
      // Try to create the app service
      result = await clients.appService.webApps.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        siteEnvelope,
      );
    } catch (error) {
      // Handle name conflicts
      if (error?.code === "WebsiteAlreadyExists" || error?.statusCode === 409) {
        if (!adopt) {
          throw new Error(
            `App service "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        // Adopt existing app service
        try {
          const existing = await clients.appService.webApps.get(
            resourceGroupName,
            name,
          );
          result = await clients.appService.webApps.beginCreateOrUpdateAndWait(
            resourceGroupName,
            name,
            siteEnvelope,
          );
        } catch (getError) {
          throw new Error(
            `App service "${name}" failed to create due to name conflict and could not be found for adoption.`,
            { cause: getError },
          );
        }
      } else {
        throw error;
      }
    }

    // Construct output
    const defaultHostname =
      result.defaultHostName || `${name}.azurewebsites.net`;

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      location: result.location!,
      defaultHostname,
      url: `https://${defaultHostname}`,
      outboundIpAddresses: result.outboundIpAddresses,
      possibleOutboundIpAddresses: result.possibleOutboundIpAddresses,
      runtime,
      runtimeVersion,
      os,
      sku: props.sku || "B1",
      httpsOnly: props.httpsOnly ?? true,
      alwaysOn: props.alwaysOn ?? props.sku !== "F1",
      ftpsState: props.ftpsState || "Disabled",
      minTlsVersion: props.minTlsVersion || "1.2",
      localMySqlEnabled: props.localMySqlEnabled ?? false,
      identity: props.identity,
      appSettings: props.appSettings,
      tags: props.tags,
      type: "azure::AppService",
      appServiceId: result.id,
    };
  },
);

/**
 * Type guard to check if a resource is an AppService
 */
export function isAppService(resource: unknown): resource is AppService {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::AppService"
  );
}

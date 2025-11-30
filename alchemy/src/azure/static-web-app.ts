import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { StaticSiteARMResource } from "@azure/arm-appservice";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface StaticWebAppProps extends AzureClientProps {
  /**
   * Name of the static web app
   * Must be 2-60 characters, alphanumeric and hyphens only
   * Must be globally unique across all of Azure
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this static web app in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this static web app
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * The SKU (pricing tier) for the static web app
   * @default "Free"
   */
  sku?: "Free" | "Standard";

  /**
   * The URL of the GitHub repository
   * @example "https://github.com/username/repo"
   */
  repositoryUrl?: string;

  /**
   * The branch name to deploy from
   * @default "main"
   */
  branch?: string;

  /**
   * GitHub personal access token for repository access
   * Required if repositoryUrl is provided
   * Use alchemy.secret() to securely store this value
   */
  repositoryToken?: string | Secret;

  /**
   * The folder containing the app source code
   * @default "/"
   */
  appLocation?: string;

  /**
   * The folder containing the API source code
   * @default "api"
   */
  apiLocation?: string;

  /**
   * The folder containing the built app artifacts
   * @default "dist" or "build"
   */
  outputLocation?: string;

  /**
   * Custom domains for the static web app
   * @example ["www.example.com", "example.com"]
   */
  customDomains?: string[];

  /**
   * Application settings (environment variables)
   * @example { API_URL: "https://api.example.com", NODE_ENV: "production" }
   */
  appSettings?: Record<string, string | Secret>;

  /**
   * Tags to apply to the static web app
   * @example { environment: "production", team: "frontend" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing static web app
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the static web app when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal static web app ID for lifecycle management
   * @internal
   */
  staticWebAppId?: string;
}

export type StaticWebApp = Omit<
  StaticWebAppProps,
  "delete" | "adopt" | "repositoryToken"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The static web app name (required in output)
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
   * @example nice-sea-123456789.azurestaticapps.net
   */
  defaultHostname: string;

  /**
   * The static web app URL
   * @example https://nice-sea-123456789.azurestaticapps.net
   */
  url: string;

  /**
   * API key for deployment
   */
  apiKey: Secret;

  /**
   * Custom domains attached to the app
   */
  customDomains?: string[];

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::StaticWebApp";
};

/**
 * Azure Static Web App - static site hosting with built-in CI/CD
 *
 * Azure Static Web Apps is a service that automatically builds and deploys full-stack
 * web apps to Azure from a code repository. It's equivalent to Cloudflare Pages,
 * AWS Amplify, and Vercel.
 *
 * Key features:
 * - Automatic CI/CD from GitHub or Azure DevOps
 * - Global content distribution via CDN
 * - Free SSL certificates for custom domains
 * - Built-in API support with Azure Functions
 * - Authentication and authorization
 * - Staging environments from pull requests
 * - No server management required
 *
 * @example
 * ## Basic Static Web App
 *
 * Create a static web app without repository integration:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, StaticWebApp } from "alchemy/azure";
 *
 * const app = await alchemy("my-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
 *   }
 * });
 *
 * const rg = await ResourceGroup("main", {
 *   location: "eastus2"
 * });
 *
 * const website = await StaticWebApp("site", {
 *   resourceGroup: rg,
 *   sku: "Free"
 * });
 *
 * console.log(`Website URL: ${website.url}`);
 * console.log(`Deploy with: Azure CLI or GitHub Actions`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Static Web App with GitHub Integration
 *
 * Automatically deploy from a GitHub repository:
 *
 * ```typescript
 * const website = await StaticWebApp("site", {
 *   resourceGroup: rg,
 *   repositoryUrl: "https://github.com/username/my-site",
 *   branch: "main",
 *   repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
 *   appLocation: "/",
 *   apiLocation: "api",
 *   outputLocation: "dist"
 * });
 *
 * // Azure automatically sets up GitHub Actions workflow
 * // Pushes to main branch trigger automatic deployments
 * ```
 *
 * @example
 * ## Static Web App with Custom Domain
 *
 * Add custom domains to your static web app:
 *
 * ```typescript
 * const website = await StaticWebApp("site", {
 *   resourceGroup: rg,
 *   sku: "Standard", // Custom domains on Standard tier
 *   customDomains: [
 *     "www.example.com",
 *     "example.com"
 *   ]
 * });
 *
 * // Configure DNS CNAME records:
 * // www.example.com -> nice-sea-123456789.azurestaticapps.net
 * // example.com -> nice-sea-123456789.azurestaticapps.net
 * ```
 *
 * @example
 * ## Static Web App with Environment Variables
 *
 * Configure build-time and runtime environment variables:
 *
 * ```typescript
 * const website = await StaticWebApp("site", {
 *   resourceGroup: rg,
 *   appSettings: {
 *     API_URL: "https://api.example.com",
 *     ENVIRONMENT: "production",
 *     SECRET_KEY: alchemy.secret.env.APP_SECRET
 *   }
 * });
 * ```
 *
 * @example
 * ## Static Web App with API
 *
 * Deploy a static site with serverless API backend:
 *
 * ```typescript
 * const website = await StaticWebApp("fullstack-app", {
 *   resourceGroup: rg,
 *   repositoryUrl: "https://github.com/username/fullstack-app",
 *   branch: "main",
 *   repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
 *   appLocation: "frontend",
 *   apiLocation: "api", // Azure Functions
 *   outputLocation: "dist"
 * });
 *
 * // Project structure:
 * // frontend/        - React/Vue/Angular app
 * // api/            - Azure Functions (Node.js/Python/.NET)
 * // dist/           - Build output
 * ```
 */
export const StaticWebApp = Resource(
  "azure::StaticWebApp",
  async function (
    this: Context<StaticWebApp>,
    id: string,
    props: StaticWebAppProps,
  ): Promise<StaticWebApp> {
    const staticWebAppId = props.staticWebAppId || this.output?.staticWebAppId;
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
        `Static web app name "${name}" must be between 2 and 60 characters`,
      );
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `Static web app name "${name}" must contain only lowercase letters, numbers, and hyphens`,
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `Static web app name "${name}" cannot start or end with a hyphen`,
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

    // Local development mode
    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        defaultHostname: `${name}.azurestaticapps.net`,
        url: `https://${name}.azurestaticapps.net`,
        apiKey: Secret.wrap("local-api-key"),
        sku: props.sku || "Free",
        repositoryUrl: props.repositoryUrl,
        branch: props.branch || "main",
        appLocation: props.appLocation || "/",
        apiLocation: props.apiLocation,
        outputLocation: props.outputLocation,
        customDomains: props.customDomains,
        appSettings: props.appSettings,
        tags: props.tags,
        type: "azure::StaticWebApp",
      };
    }

    const clients = await createAzureClients(props);

    // Handle deletion
    if (this.phase === "delete") {
      if (!staticWebAppId) {
        console.warn(`No staticWebAppId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        try {
          await clients.appService.staticSites.beginDeleteStaticSiteAndWait(
            resourceGroupName,
            name,
          );
        } catch (error) {
          // Ignore 404 errors (already deleted)
          if (error?.statusCode !== 404) {
            console.error(`Error deleting static web app ${id}:`, error);
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

    // Prepare build properties
    const buildProperties: Record<string, unknown> = {
      appLocation: props.appLocation || "/",
      apiLocation: props.apiLocation,
      outputLocation: props.outputLocation,
    };

    // Prepare repository properties
    let repositoryProperties: Record<string, unknown> | undefined = undefined;
    if (props.repositoryUrl) {
      if (!props.repositoryToken) {
        throw new Error(
          "repositoryToken is required when repositoryUrl is provided",
        );
      }

      repositoryProperties = {
        repositoryUrl: props.repositoryUrl,
        branch: props.branch || "main",
        repositoryToken:
          typeof props.repositoryToken === "string"
            ? props.repositoryToken
            : Secret.unwrap(props.repositoryToken),
      };
    }

    // Prepare static site envelope
    const staticSiteEnvelope: StaticSiteARMResource = {
      location,
      tags: props.tags,
      sku: {
        name: props.sku || "Free",
        tier: props.sku || "Free",
      },
      buildProperties,
      repositoryUrl: repositoryProperties?.repositoryUrl,
      branch: repositoryProperties?.branch,
      repositoryToken: repositoryProperties?.repositoryToken,
    };

    let result: StaticSiteARMResource;

    try {
      // Try to create the static web app
      result =
        await clients.appService.staticSites.beginCreateOrUpdateStaticSiteAndWait(
          resourceGroupName,
          name,
          staticSiteEnvelope,
        );
    } catch (error) {
      // Handle name conflicts
      if (
        error?.code === "StaticSiteAlreadyExists" ||
        error?.statusCode === 409
      ) {
        if (!adopt) {
          throw new Error(
            `Static web app "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

        // Adopt existing static web app
        try {
          const existing = await clients.appService.staticSites.getStaticSite(
            resourceGroupName,
            name,
          );
          result =
            await clients.appService.staticSites.beginCreateOrUpdateStaticSiteAndWait(
              resourceGroupName,
              name,
              staticSiteEnvelope,
            );
        } catch (getError) {
          throw new Error(
            `Static web app "${name}" failed to create due to name conflict and could not be found for adoption.`,
            { cause: getError },
          );
        }
      } else {
        throw error;
      }
    }

    // Update app settings if provided
    if (Object.keys(appSettings).length > 0) {
      try {
        await clients.appService.staticSites.createOrUpdateStaticSiteAppSettings(
          resourceGroupName,
          name,
          {
            properties: appSettings,
          },
        );
      } catch (error) {
        console.warn(
          `Warning: Failed to update app settings for ${name}:`,
          error.message,
        );
      }
    }

    // Get API key
    let apiKey: string = "";
    try {
      const secrets =
        await clients.appService.staticSites.listStaticSiteSecrets(
          resourceGroupName,
          name,
        );
      apiKey = secrets.properties?.apiKey || "";
    } catch (error) {
      console.warn(`Warning: Failed to retrieve API key for ${name}`);
    }

    // Construct output
    const defaultHostname =
      result.defaultHostname || `${name}.azurestaticapps.net`;

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      location: result.location!,
      defaultHostname,
      url: `https://${defaultHostname}`,
      apiKey: Secret.wrap(apiKey),
      sku: props.sku || "Free",
      repositoryUrl: props.repositoryUrl,
      branch: props.branch || "main",
      appLocation: props.appLocation || "/",
      apiLocation: props.apiLocation,
      outputLocation: props.outputLocation,
      customDomains: props.customDomains,
      appSettings: props.appSettings,
      tags: props.tags,
      type: "azure::StaticWebApp",
      staticWebAppId: result.id,
    };
  },
);

/**
 * Type guard to check if a resource is a StaticWebApp
 */
export function isStaticWebApp(resource: unknown): resource is StaticWebApp {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::StaticWebApp"
  );
}

import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { StorageAccount } from "./storage-account.ts";
import type { UserAssignedIdentity } from "./user-assigned-identity.ts";
import type { Site } from "@azure/arm-appservice";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface FunctionAppProps extends AzureClientProps {
  /**
   * Name of the function app
   * Must be 2-60 characters, alphanumeric and hyphens only
   * Must be globally unique across all of Azure (creates {name}.azurewebsites.net)
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this function app in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this function app
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Storage account for function app storage (required for Azure Functions)
   * Used for triggers, logging, and internal state management
   * Can be a StorageAccount object or the connection string
   */
  storageAccount: string | StorageAccount;

  /**
   * The pricing tier (App Service Plan SKU)
   * @default "Y1" (Consumption plan - serverless)
   */
  sku?:
    | "Y1" // Consumption (serverless, pay per execution)
    | "EP1" // Elastic Premium 1
    | "EP2" // Elastic Premium 2
    | "EP3" // Elastic Premium 3
    | "B1" // Basic 1 (dedicated)
    | "B2" // Basic 2 (dedicated)
    | "B3" // Basic 3 (dedicated)
    | "S1" // Standard 1 (dedicated)
    | "S2" // Standard 2 (dedicated)
    | "S3" // Standard 3 (dedicated)
    | "P1V2" // Premium V2 1
    | "P2V2" // Premium V2 2
    | "P3V2"; // Premium V2 3

  /**
   * The runtime stack for the function app
   * @default "node"
   */
  runtime?: "node" | "python" | "dotnet" | "java" | "powershell" | "custom";

  /**
   * Runtime version (e.g., "18", "20" for Node.js, "3.9", "3.11" for Python)
   * @default "20" for Node.js
   */
  runtimeVersion?: string;

  /**
   * Azure Functions runtime version
   * @default "~4" (Functions V4)
   */
  functionsVersion?: "~4" | "~3" | "~2";

  /**
   * User-assigned managed identity for secure access to other Azure resources
   * Recommended over connection strings for accessing storage, databases, etc.
   */
  identity?: UserAssignedIdentity;

  /**
   * Application settings (environment variables)
   * @example { API_KEY: alchemy.secret.env.API_KEY, DATABASE_URL: "..." }
   */
  appSettings?: Record<string, string | Secret>;

  /**
   * Enable HTTPS only (redirect HTTP to HTTPS)
   * @default true
   */
  httpsOnly?: boolean;

  /**
   * Enable Always On (keeps the app loaded even when idle)
   * Only available on non-Consumption plans
   * @default false
   */
  alwaysOn?: boolean;

  /**
   * Tags to apply to the function app
   * @example { environment: "production", team: "backend" }
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing function app
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the function app when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal function app ID for lifecycle management
   * @internal
   */
  functionAppId?: string;
}

export type FunctionApp = Omit<
  FunctionAppProps,
  "delete" | "adopt" | "storageAccount"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The function app name (required in output)
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
   * The storage account name used by this function app
   */
  storageAccount: string;

  /**
   * The default hostname
   * @example my-function-app.azurewebsites.net
   */
  defaultHostname: string;

  /**
   * The function app URL
   * @example https://my-function-app.azurewebsites.net
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
  type: "azure::FunctionApp";
};

/**
 * Azure Function App - serverless compute platform for event-driven functions
 *
 * Azure Functions is a serverless compute service that lets you run code without
 * managing infrastructure. It's equivalent to AWS Lambda and Cloudflare Workers.
 *
 * Key features:
 * - Pay-per-execution pricing with Consumption plan
 * - Automatic scaling based on demand
 * - Multiple runtime support (Node.js, Python, .NET, Java, PowerShell)
 * - Built-in triggers (HTTP, Timer, Queue, Blob, Event Grid, etc.)
 * - Durable Functions for stateful workflows
 * - Integration with Azure services via managed identity
 * - Deployment slots for staging and blue-green deployments
 *
 * @example
 * ## Basic Function App
 *
 * Create a Node.js function app on the Consumption plan:
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, StorageAccount, FunctionApp } from "alchemy/azure";
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
 * const storage = await StorageAccount("storage", {
 *   resourceGroup: rg,
 *   sku: "Standard_LRS"
 * });
 *
 * const functionApp = await FunctionApp("api", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   runtime: "node",
 *   runtimeVersion: "20"
 * });
 *
 * console.log(`Function App URL: ${functionApp.url}`);
 * ```
 *
 * @example
 * ## Function App with Managed Identity
 *
 * Use managed identity to securely access other Azure resources:
 *
 * ```typescript
 * const identity = await UserAssignedIdentity("app-identity", {
 *   resourceGroup: rg
 * });
 *
 * const functionApp = await FunctionApp("secure-api", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   identity: identity,
 *   runtime: "node",
 *   runtimeVersion: "20"
 * });
 * ```
 *
 * @example
 * ## Function App with App Settings
 *
 * Configure environment variables and secrets:
 *
 * ```typescript
 * const functionApp = await FunctionApp("configured-api", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   runtime: "node",
 *   appSettings: {
 *     NODE_ENV: "production",
 *     API_KEY: alchemy.secret.env.API_KEY,
 *     DATABASE_URL: alchemy.secret.env.DATABASE_URL
 *   }
 * });
 * ```
 *
 * @example
 * ## Premium Function App
 *
 * Use Premium plan for VNet integration, longer execution time, and better performance:
 *
 * ```typescript
 * const functionApp = await FunctionApp("premium-api", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   sku: "EP1", // Elastic Premium
 *   runtime: "node",
 *   runtimeVersion: "20",
 *   alwaysOn: true
 * });
 * ```
 *
 * @example
 * ## Python Function App
 *
 * Create a Python-based function app:
 *
 * ```typescript
 * const pythonApp = await FunctionApp("python-api", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   runtime: "python",
 *   runtimeVersion: "3.11",
 *   functionsVersion: "~4"
 * });
 * ```
 */
export const FunctionApp = Resource(
  "azure::FunctionApp",
  async function (
    this: Context<FunctionApp>,
    id: string,
    props: FunctionAppProps,
  ): Promise<FunctionApp> {
    const functionAppId = props.functionAppId || this.output?.functionAppId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ??
      this.output?.name ??
      this.scope
        .createPhysicalName(id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");

    if (name.length < 2 || name.length > 60) {
      throw new Error(
        `Function app name "${name}" must be between 2 and 60 characters`,
      );
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        `Function app name "${name}" must contain only lowercase letters, numbers, and hyphens`,
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      throw new Error(
        `Function app name "${name}" cannot start or end with a hyphen`,
      );
    }

    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

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

    // Get storage connection string
    let storageConnectionString: string;
    if (typeof props.storageAccount === "string") {
      storageConnectionString = props.storageAccount;
    } else {
      storageConnectionString = Secret.unwrap(
        props.storageAccount.primaryConnectionString,
      ) as string;
    }

    if (this.scope.local) {
      return {
        id,
        name,
        resourceGroup: resourceGroupName,
        location,
        storageAccount:
          typeof props.storageAccount === "string"
            ? props.storageAccount
            : props.storageAccount.name,
        defaultHostname: `${name}.azurewebsites.net`,
        url: `https://${name}.azurewebsites.net`,
        runtime: props.runtime || "node",
        runtimeVersion: props.runtimeVersion || "20",
        functionsVersion: props.functionsVersion || "~4",
        sku: props.sku || "Y1",
        httpsOnly: props.httpsOnly ?? true,
        alwaysOn: props.alwaysOn ?? false,
        type: "azure::FunctionApp",
      };
    }

    const clients = await createAzureClients(props);

    if (this.phase === "delete") {
      if (!functionAppId) {
        console.warn(`No functionAppId found for ${id}, skipping delete`);
        return this.destroy();
      }

      if (props.delete !== false) {
        try {
          await clients.appService.webApps.delete(resourceGroupName, name);
        } catch (error: unknown) {
          const azureError = error as { statusCode?: number; code?: string; message?: string };
          if (azureError.statusCode !== 404) {
            console.error(`Error deleting function app ${id}:`, error);
            throw error;
          }
        }
      }
      return this.destroy();
    }

    if (this.phase === "update" && this.output) {
      if (this.output.location !== location) {
        return this.replace();
      }
      if (this.output.name !== name) {
        return this.replace();
      }
    }

    const appSettings: Record<string, string> = {
      AzureWebJobsStorage: storageConnectionString,
      FUNCTIONS_EXTENSION_VERSION: props.functionsVersion || "~4",
      FUNCTIONS_WORKER_RUNTIME: props.runtime || "node",
      ...(props.runtime === "node"
        ? { WEBSITE_NODE_DEFAULT_VERSION: `~${props.runtimeVersion || "20"}` }
        : {}),
      ...Object.fromEntries(
        Object.entries(props.appSettings || {}).map(([key, value]) => [
          key,
          typeof value === "string" ? value : Secret.unwrap(value),
        ]),
      ),
    };

    const siteConfig: Record<string, unknown> = {
      appSettings: Object.entries(appSettings).map(([name, value]) => ({
        name,
        value,
      })),
      httpsOnly: props.httpsOnly ?? true,
      alwaysOn: props.alwaysOn ?? false,
    };

    if (props.runtime === "node") {
      siteConfig.nodeVersion = `~${props.runtimeVersion || "20"}`;
    } else if (props.runtime === "python") {
      siteConfig.pythonVersion = props.runtimeVersion || "3.11";
    } else if (props.runtime === "dotnet") {
      siteConfig.netFrameworkVersion = props.runtimeVersion || "v8.0";
    }

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

    const siteEnvelope: Site = {
      location,
      tags: props.tags,
      kind: "functionapp",
      identity: identityConfig,
      siteConfig,
    };

    let result: Site;

    try {
      // Try to create the function app
      result = await clients.appService.webApps.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        siteEnvelope,
      );
    } catch (error: unknown) {
      const azureError = error as { statusCode?: number; code?: string; message?: string };
      if (azureError.code === "WebsiteAlreadyExists" || azureError.statusCode === 409) {
        if (!adopt) {
          throw new Error(
            `Function app "${name}" already exists. Use adopt: true to adopt it.`,
            { cause: error },
          );
        }

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
            `Function app "${name}" failed to create due to name conflict and could not be found for adoption.`,
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
    const storageAccountName =
      typeof props.storageAccount === "string"
        ? props.storageAccount
        : props.storageAccount.name;

    return {
      id,
      name: result.name!,
      resourceGroup: resourceGroupName,
      location: result.location!,
      storageAccount: storageAccountName,
      defaultHostname,
      url: `https://${defaultHostname}`,
      outboundIpAddresses: result.outboundIpAddresses,
      possibleOutboundIpAddresses: result.possibleOutboundIpAddresses,
      runtime: props.runtime || "node",
      runtimeVersion: props.runtimeVersion || "20",
      functionsVersion: props.functionsVersion || "~4",
      sku: props.sku || "Y1",
      httpsOnly: props.httpsOnly ?? true,
      alwaysOn: props.alwaysOn ?? false,
      identity: props.identity,
      appSettings: props.appSettings,
      tags: props.tags,
      type: "azure::FunctionApp",
      functionAppId: result.id,
    };
  },
);

/**
 * Type guard to check if a resource is a FunctionApp
 */
export function isFunctionApp(resource: unknown): resource is FunctionApp {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::FunctionApp"
  );
}

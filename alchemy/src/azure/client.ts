import type { TokenCredential } from "@azure/identity";
import {
  DefaultAzureCredential,
  ClientSecretCredential,
} from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { StorageManagementClient } from "@azure/arm-storage";
import { ManagedServiceIdentityClient } from "@azure/arm-msi";
import { WebSiteManagementClient } from "@azure/arm-appservice";
import { CosmosDBManagementClient } from "@azure/arm-cosmosdb";
import { SqlManagementClient } from "@azure/arm-sql";
import { NetworkManagementClient } from "@azure/arm-network";
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import type { AzureClientProps } from "./client-props.ts";
import { resolveAzureCredentials } from "./credentials.ts";

/**
 * Azure SDK clients for managing resources
 */
export interface AzureClients {
  /**
   * Client for managing resource groups and deployments
   */
  resources: ResourceManagementClient;

  /**
   * Client for managing storage accounts and blob containers
   */
  storage: StorageManagementClient;

  /**
   * Client for managing managed identities (User Assigned Identities)
   */
  msi: ManagedServiceIdentityClient;

  /**
   * Client for managing app services, function apps, and static web apps
   */
  appService: WebSiteManagementClient;

  /**
   * Client for managing Cosmos DB accounts and databases
   */
  cosmosDB: CosmosDBManagementClient;

  /**
   * Client for managing SQL servers and databases
   */
  sql: SqlManagementClient;

  /**
   * Client for managing virtual networks and network security groups
   */
  network: NetworkManagementClient;

  /**
   * Client for managing container instances
   */
  containerInstance: ContainerInstanceManagementClient;

  /**
   * The credential used to authenticate with Azure
   */
  credential: TokenCredential;

  /**
   * The Azure subscription ID
   */
  subscriptionId: string;
}

/**
 * Create Azure SDK clients with proper authentication
 *
 * This function creates Azure SDK clients using the official Azure SDK for JavaScript.
 * It supports multiple authentication methods through DefaultAzureCredential:
 * - Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
 * - Azure CLI credentials (via `az login`)
 * - Managed Identity (when running in Azure)
 * - Visual Studio Code credentials
 * - Azure PowerShell credentials
 *
 * The function handles:
 * 1. Credential resolution from environment, scope, and resource levels
 * 2. Creation of service-specific management clients
 * 3. Automatic polling for long-running operations (LROs)
 *
 * @param props - Optional Azure client properties to override credentials
 * @returns Azure SDK clients for resource management
 *
 * @throws {Error} When subscription ID is missing
 * @throws {Error} When authentication fails
 *
 * @example
 * ```typescript
 * // Basic usage with environment variables
 * const clients = await createAzureClients();
 *
 * // Create a resource group
 * const rg = await clients.resources.resourceGroups.createOrUpdate(
 *   "my-resource-group",
 *   { location: "eastus" }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Usage with explicit credentials
 * const clients = await createAzureClients({
 *   subscriptionId: "your-subscription-id",
 *   tenantId: alchemy.secret.env.AZURE_TENANT_ID,
 *   clientId: alchemy.secret.env.AZURE_CLIENT_ID,
 *   clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET
 * });
 * ```
 */
export async function createAzureClients(
  props?: AzureClientProps,
): Promise<AzureClients> {
  // Resolve credentials from environment, scope, and resource levels
  const credentials = await resolveAzureCredentials(props);

  if (!credentials.subscriptionId) {
    throw new Error(
      "Azure subscription ID is required. " +
        "Set AZURE_SUBSCRIPTION_ID environment variable or provide subscriptionId in props.",
    );
  }

  let credential: TokenCredential;

  // If explicit credentials are provided, use ClientSecretCredential
  if (
    credentials.tenantId &&
    credentials.clientId &&
    credentials.clientSecret
  ) {
    credential = new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret,
    );
  } else {
    // Otherwise use DefaultAzureCredential which tries multiple methods
    credential = new DefaultAzureCredential();
  }

  return {
    resources: new ResourceManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    storage: new StorageManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    msi: new ManagedServiceIdentityClient(
      credential,
      credentials.subscriptionId,
    ),
    appService: new WebSiteManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    cosmosDB: new CosmosDBManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    sql: new SqlManagementClient(credential, credentials.subscriptionId),
    network: new NetworkManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    containerInstance: new ContainerInstanceManagementClient(
      credential,
      credentials.subscriptionId,
    ),
    credential,
    subscriptionId: credentials.subscriptionId,
  };
}

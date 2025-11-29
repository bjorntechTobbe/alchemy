import type { Secret } from "../secret.ts";

/**
 * Azure client configuration properties
 *
 * These properties control how Alchemy authenticates with Azure and which
 * subscription to use for resource management.
 *
 * Authentication methods (in order of precedence):
 * 1. Explicit credentials (tenantId, clientId, clientSecret)
 * 2. DefaultAzureCredential chain:
 *    - Environment variables
 *    - Azure CLI
 *    - Managed Identity
 *    - Visual Studio Code
 *    - Azure PowerShell
 */
export interface AzureClientProps {
  /**
   * Azure subscription ID
   * @example "12345678-1234-1234-1234-123456789012"
   */
  subscriptionId?: string;

  /**
   * Azure Active Directory tenant ID
   * Required when using service principal authentication
   * @example "87654321-4321-4321-4321-210987654321"
   */
  tenantId?: string | Secret;

  /**
   * Azure service principal client ID (application ID)
   * Required when using service principal authentication
   * @example "abcdef12-3456-7890-abcd-ef1234567890"
   */
  clientId?: string | Secret;

  /**
   * Azure service principal client secret
   * Required when using service principal authentication
   * Use alchemy.secret.env.X to securely store this value
   */
  clientSecret?: string | Secret;
}

/**
 * Augment the global ProviderCredentials interface to include Azure credentials.
 *
 * This uses TypeScript module augmentation to extend the ProviderCredentials interface.
 * Since ScopeOptions and RunOptions both extend ProviderCredentials,
 * this allows Azure credentials to be passed to alchemy() function:
 *
 * @example
 * ```typescript
 * await alchemy("my-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
 *     tenantId: alchemy.secret.env.AZURE_TENANT_ID,
 *     clientId: alchemy.secret.env.AZURE_CLIENT_ID,
 *     clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET
 *   }
 * });
 * ```
 */
declare module "../scope.ts" {
  interface ProviderCredentials {
    azure?: AzureClientProps;
  }
}

import { alchemy } from "../alchemy.ts";
import { isSecret, Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";

/**
 * Validate Azure client properties to ensure they are strings or Secrets.
 * This follows the same pattern as AWS and Cloudflare credential validation.
 */
function validateAzureClientProps(
  props: AzureClientProps,
  context: string,
): void {
  const validKeys = ["subscriptionId", "tenantId", "clientId", "clientSecret"];

  for (const [key, value] of Object.entries(props)) {
    if (!validKeys.includes(key)) {
      continue; // Ignore unknown properties
    }

    if (value !== undefined && typeof value !== "string" && !isSecret(value)) {
      throw new Error(
        `Invalid Azure configuration in ${context}: Property '${key}' must be a string or Secret, got ${typeof value}. ` +
          "Please ensure all Azure credential properties are strings or Secret objects.",
      );
    }
  }
}

/**
 * Get global Azure configuration from environment variables.
 * This provides the base layer of Azure credential configuration.
 */
export function getGlobalAzureConfig(): AzureClientProps {
  return {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
    tenantId: process.env.AZURE_TENANT_ID
      ? alchemy.secret(process.env.AZURE_TENANT_ID)
      : undefined,
    clientId: process.env.AZURE_CLIENT_ID
      ? alchemy.secret(process.env.AZURE_CLIENT_ID)
      : undefined,
    clientSecret: process.env.AZURE_CLIENT_SECRET
      ? alchemy.secret(process.env.AZURE_CLIENT_SECRET)
      : undefined,
  };
}

/**
 * Unwrap Azure credentials from Secret objects to strings
 */
function unwrapAzureCredentials(
  props: AzureClientProps,
): Omit<AzureClientProps, "tenantId" | "clientId" | "clientSecret"> & {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
} {
  return {
    subscriptionId: props.subscriptionId,
    tenantId: props.tenantId ? Secret.unwrap(props.tenantId) : undefined,
    clientId: props.clientId ? Secret.unwrap(props.clientId) : undefined,
    clientSecret: props.clientSecret
      ? Secret.unwrap(props.clientSecret)
      : undefined,
  };
}

/**
 * Resolve Azure credentials using three-tier resolution: global → scope → resource.
 *
 * This function implements a comprehensive credential resolution system that allows
 * for flexible Azure credential management across different levels of your application.
 * It enables multi-subscription and multi-tenant deployments by providing a consistent
 * way to override credentials at different scopes.
 *
 * The resolution follows this precedence order:
 * 1. Resource-level credentials (highest priority)
 * 2. Scope-level credentials (medium priority)
 * 3. Global environment variables (lowest priority)
 *
 * Supported credential properties include:
 * - `subscriptionId`: Azure subscription ID
 * - `tenantId`: Azure Active Directory tenant ID
 * - `clientId`: Azure service principal client ID
 * - `clientSecret`: Azure service principal client secret
 *
 * @param resourceProps - Resource-level Azure credential properties (optional)
 * @returns Resolved Azure client properties with unwrapped secrets
 *
 * @throws {Error} When scope contains invalid Azure configuration
 * @throws {Error} When resource properties contain invalid Azure configuration
 *
 * @example
 * ```typescript
 * // Basic usage with resource-level credentials
 * const credentials = await resolveAzureCredentials({
 *   subscriptionId: "12345678-1234-1234-1234-123456789012"
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Usage with scope-level credentials
 * await alchemy("my-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
 *     tenantId: alchemy.secret.env.AZURE_TENANT_ID,
 *     clientId: alchemy.secret.env.AZURE_CLIENT_ID,
 *     clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET
 *   }
 * });
 *
 * // Resources created here will use the scope credentials by default
 * const rg = await ResourceGroup("main-rg", {
 *   location: "eastus"
 * });
 *
 * // Resources can override scope credentials
 * const crossSubRg = await ResourceGroup("cross-sub-rg", {
 *   location: "westus",
 *   subscriptionId: "different-subscription-id"
 * });
 * ```
 */
export async function resolveAzureCredentials(
  resourceProps?: AzureClientProps,
): Promise<
  Omit<AzureClientProps, "tenantId" | "clientId" | "clientSecret"> & {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  }
> {
  // 1. Start with global environment variables (lowest priority)
  const globalConfig = getGlobalAzureConfig();

  // 2. Layer in scope-level credentials (medium priority)
  let scopeConfig: AzureClientProps = {};
  try {
    // Import Scope dynamically to avoid circular dependency
    const { Scope } = await import("../scope.ts");
    const currentScope = Scope.getScope();
    if (currentScope?.providerCredentials?.azure) {
      scopeConfig = currentScope.providerCredentials.azure;

      // Validate scope-level credentials if provided
      validateAzureClientProps(scopeConfig, "scope");
    }
  } catch (error) {
    // If we can't access scope (e.g., not running in scope context), just continue
    // with empty scope config unless it's a validation error
    if (
      error instanceof Error &&
      error.message.includes("Invalid Azure configuration")
    ) {
      throw error;
    }
  }

  // 3. Layer in resource-level credentials (highest priority)
  const resourceConfig = resourceProps || {};

  // Validate resource-level credentials if provided
  if (resourceProps && Object.keys(resourceProps).length > 0) {
    validateAzureClientProps(resourceProps, "resource properties");
  }

  // Merge configurations with proper precedence (later properties override earlier ones)
  const resolvedConfig = {
    ...globalConfig,
    ...scopeConfig,
    ...resourceConfig,
  };

  // Unwrap secrets and filter out undefined values from the final result
  const unwrapped = unwrapAzureCredentials(resolvedConfig);

  return Object.fromEntries(
    Object.entries(unwrapped).filter(([_, value]) => value !== undefined),
  ) as Omit<AzureClientProps, "tenantId" | "clientId" | "clientSecret"> & {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { Vault as AzureVault } from "@azure/arm-keyvault";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface AccessPolicyPermissions {
  /**
   * Permissions for keys
   */
  keys?: (
    | "get"
    | "list"
    | "update"
    | "create"
    | "import"
    | "delete"
    | "recover"
    | "backup"
    | "restore"
    | "decrypt"
    | "encrypt"
    | "unwrapKey"
    | "wrapKey"
    | "verify"
    | "sign"
    | "purge"
  )[];

  /**
   * Permissions for secrets
   */
  secrets?: (
    | "get"
    | "list"
    | "set"
    | "delete"
    | "recover"
    | "backup"
    | "restore"
    | "purge"
  )[];

  /**
   * Permissions for certificates
   */
  certificates?: (
    | "get"
    | "list"
    | "update"
    | "create"
    | "import"
    | "delete"
    | "recover"
    | "backup"
    | "restore"
    | "managecontacts"
    | "manageissuers"
    | "getissuers"
    | "listissuers"
    | "setissuers"
    | "deleteissuers"
    | "purge"
  )[];
}

export interface AccessPolicy {
  /**
   * The object ID of the user, service principal, or security group
   * This is the Azure AD object ID
   */
  objectId: string;

  /**
   * The Azure tenant ID
   */
  tenantId: string;

  /**
   * Permissions for this access policy
   */
  permissions: AccessPolicyPermissions;
}

export interface KeyVaultProps extends AzureClientProps {
  /**
   * Name of the key vault
   * Must be 3-24 characters, globally unique, alphanumeric and hyphens
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this key vault in
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this key vault
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * SKU for the key vault
   * @default "standard"
   */
  sku?: "standard" | "premium";

  /**
   * Enable Azure Virtual Machines to retrieve certificates from the vault
   * @default false
   */
  enabledForDeployment?: boolean;

  /**
   * Enable Azure Disk Encryption to retrieve secrets and unwrap keys
   * @default false
   */
  enabledForDiskEncryption?: boolean;

  /**
   * Enable Azure Resource Manager to retrieve secrets during template deployment
   * @default false
   */
  enabledForTemplateDeployment?: boolean;

  /**
   * Enable purge protection
   * When enabled, deleted vaults and secrets cannot be permanently deleted until retention period expires
   * @default false
   */
  enablePurgeProtection?: boolean;

  /**
   * Enable soft delete
   * Deleted vaults and secrets are retained for a period and can be recovered
   * @default true
   */
  enableSoftDelete?: boolean;

  /**
   * Number of days to retain deleted vaults and secrets (7-90 days)
   * Only applicable if enableSoftDelete is true
   * @default 90
   */
  softDeleteRetentionInDays?: number;

  /**
   * Enable RBAC authorization for data plane access
   * When true, access policies are ignored and Azure RBAC is used instead
   * @default false
   */
  enableRbacAuthorization?: boolean;

  /**
   * Access policies for the key vault
   * Only used if enableRbacAuthorization is false
   */
  accessPolicies?: AccessPolicy[];

  /**
   * Network access control
   * - "Allow": Allow access from all networks
   * - "Deny": Deny access from all networks (use with ipRules and virtualNetworkRules)
   * @default "Allow"
   */
  networkAclsDefaultAction?: "Allow" | "Deny";

  /**
   * IP address or CIDR ranges allowed to access the vault
   */
  ipRules?: string[];

  /**
   * Virtual network subnet IDs allowed to access the vault
   */
  virtualNetworkRules?: string[];

  /**
   * Tags to apply to the key vault
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing key vault
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the key vault when removed from Alchemy
   * @default false (preserves secrets by default)
   */
  delete?: boolean;

  /**
   * Internal key vault ID for lifecycle management
   * @internal
   */
  keyVaultId?: string;
}

export type KeyVault = Omit<
  KeyVaultProps,
  "delete" | "adopt" | "accessPolicies" | "tenantId"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The key vault name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID
   */
  keyVaultId: string;

  /**
   * The vault URI for accessing the key vault
   */
  vaultUri: string;

  /**
   * Tenant ID (from Azure response)
   */
  outputTenantId: string;

  /**
   * Access policies (if RBAC is not enabled)
   */
  accessPolicies?: AccessPolicy[];

  /**
   * Provisioning state
   */
  provisioningState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::KeyVault";
};

/**
 * Azure Key Vault for secrets and key management
 *
 * Azure Key Vault is a cloud service for securely storing and accessing secrets,
 * encryption keys, and certificates. It provides centralized secrets management
 * with detailed logging and access control, equivalent to AWS Secrets Manager
 * and AWS KMS combined.
 *
 * @example
 * ## Basic Key Vault
 *
 * Create a key vault with default settings:
 *
 * ```ts
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, KeyVault } from "alchemy/azure";
 *
 * const app = await alchemy("my-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
 *     tenantId: process.env.AZURE_TENANT_ID!
 *   }
 * });
 *
 * const rg = await ResourceGroup("vault-rg", {
 *   location: "eastus"
 * });
 *
 * const vault = await KeyVault("secrets", {
 *   resourceGroup: rg,
 *   sku: "standard"
 * });
 *
 * console.log(`Vault URI: ${vault.vaultUri}`);
 *
 * await app.finalize();
 * ```
 *
 * @example
 * ## Key Vault with Access Policies
 *
 * Create a key vault with access policies for a service principal:
 *
 * ```ts
 * const vault = await KeyVault("app-secrets", {
 *   resourceGroup: rg,
 *   sku: "standard",
 *   accessPolicies: [
 *     {
 *       tenantId: process.env.AZURE_TENANT_ID!,
 *       objectId: "00000000-0000-0000-0000-000000000000", // Service principal object ID
 *       permissions: {
 *         secrets: ["get", "list"],
 *         keys: ["get", "list", "decrypt", "encrypt"]
 *       }
 *     }
 *   ]
 * });
 * ```
 *
 * @example
 * ## Key Vault with RBAC Authorization
 *
 * Use Azure RBAC for access control instead of access policies:
 *
 * ```ts
 * const vault = await KeyVault("rbac-vault", {
 *   resourceGroup: rg,
 *   sku: "premium",
 *   enableRbacAuthorization: true,
 *   enablePurgeProtection: true
 * });
 *
 * // Assign roles using Azure RBAC (outside of this resource)
 * // Key Vault Secrets Officer, Key Vault Secrets User, etc.
 * ```
 *
 * @example
 * ## Key Vault with Network Restrictions
 *
 * Restrict access to specific IP addresses and virtual networks:
 *
 * ```ts
 * const vault = await KeyVault("secure-vault", {
 *   resourceGroup: rg,
 *   networkAclsDefaultAction: "Deny",
 *   ipRules: [
 *     "203.0.113.0/24",  // Office IP range
 *     "198.51.100.42"     // Specific IP
 *   ],
 *   virtualNetworkRules: [
 *     "/subscriptions/.../resourceGroups/my-rg/providers/Microsoft.Network/virtualNetworks/my-vnet/subnets/app-subnet"
 *   ]
 * });
 * ```
 *
 * @example
 * ## Key Vault for Azure Resources
 *
 * Enable key vault for use with VMs, disk encryption, and ARM templates:
 *
 * ```ts
 * const vault = await KeyVault("infra-vault", {
 *   resourceGroup: rg,
 *   sku: "standard",
 *   enabledForDeployment: true,
 *   enabledForDiskEncryption: true,
 *   enabledForTemplateDeployment: true,
 *   enableSoftDelete: true,
 *   softDeleteRetentionInDays: 90,
 *   enablePurgeProtection: true
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Key Vault
 *
 * Adopt an existing key vault for management:
 *
 * ```ts
 * const vault = await KeyVault("existing-vault", {
 *   name: "my-existing-vault",
 *   resourceGroup: "existing-rg",
 *   adopt: true
 * });
 * ```
 */
export const KeyVault = Resource(
  "azure::KeyVault",
  async function (
    this: Context<KeyVault>,
    id: string,
    props: KeyVaultProps,
  ): Promise<KeyVault> {
    const keyVaultId = props.keyVaultId || this.output?.keyVaultId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (this.scope.local) {
      return {
        id,
        name,
        keyVaultId: keyVaultId || `local-${id}`,
        location: props.location || "eastus",
        vaultUri: `https://${name}.vault.azure.net/`,
        outputTenantId: "local-tenant-id",
        sku: props.sku || "standard",
        enabledForDeployment: props.enabledForDeployment || false,
        enabledForDiskEncryption: props.enabledForDiskEncryption || false,
        enabledForTemplateDeployment:
          props.enabledForTemplateDeployment || false,
        enablePurgeProtection: props.enablePurgeProtection || false,
        enableSoftDelete: props.enableSoftDelete ?? true,
        softDeleteRetentionInDays: props.softDeleteRetentionInDays || 90,
        enableRbacAuthorization: props.enableRbacAuthorization || false,
        accessPolicies: props.accessPolicies,
        networkAclsDefaultAction: props.networkAclsDefaultAction || "Allow",
        ipRules: props.ipRules,
        virtualNetworkRules: props.virtualNetworkRules,
        provisioningState: "Succeeded",
        resourceGroup: props.resourceGroup,
        tags: props.tags,
        type: "azure::KeyVault",
      };
    }

    const clients = await createAzureClients(props);
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    // Get resource group for location
    let location = props.location;
    if (!location) {
      const rg = await clients.resources.resourceGroups.get(resourceGroupName);
      location = rg.location!;
    }

    // Get tenant ID from clients (auto-detected from Azure CLI if available)
    let tenantId = clients.tenantId || this.output?.outputTenantId;

    // If still no tenant ID, try to extract from token as final fallback
    if (!tenantId) {
      try {
        const token = await clients.credential.getToken(
          "https://management.azure.com/.default",
        );
        if (token?.token) {
          // Parse the JWT token to get tenant ID
          const payload = JSON.parse(
            Buffer.from(token.token.split(".")[1], "base64").toString(),
          );
          tenantId = payload.tid;
        }
      } catch {
        // Token parsing failed
      }
    }

    if (!tenantId) {
      throw new Error(
        "Tenant ID is required for Key Vault. Please authenticate with Azure CLI (az login) or set AZURE_TENANT_ID environment variable.",
      );
    }

    if (this.phase === "delete") {
      if (props.delete !== false && keyVaultId) {
        try {
          // Delete the vault (no beginDelete operation, just delete)
          await clients.keyVault.vaults.delete(resourceGroupName, name);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Validate name format (must be globally unique, 3-24 chars, alphanumeric + hyphens)
    // Only validate during create/update, not during delete
    if (!/^[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]$/.test(name)) {
      throw new Error(
        `Key vault name "${name}" is invalid. Must be 3-24 characters, start with a letter, end with letter or digit, and contain only alphanumeric characters and hyphens.`,
      );
    }

    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace(); // Name is immutable
      }
      if (this.output.location !== location) {
        return this.replace(); // Location is immutable
      }
      if (this.output.enablePurgeProtection && !props.enablePurgeProtection) {
        throw new Error(
          "Cannot disable purge protection once enabled. This is an Azure platform restriction.",
        );
      }
    }

    const requestBody: Partial<AzureVault> = {
      location,
      tags: props.tags,
      properties: {
        tenantId,
        sku: {
          family: "A",
          name: props.sku || "standard",
        },
        enabledForDeployment: props.enabledForDeployment || false,
        enabledForDiskEncryption: props.enabledForDiskEncryption || false,
        enabledForTemplateDeployment:
          props.enabledForTemplateDeployment || false,
        enableSoftDelete: props.enableSoftDelete ?? true,
        softDeleteRetentionInDays: props.softDeleteRetentionInDays || 90,
        enableRbacAuthorization: props.enableRbacAuthorization || false,
      },
    };

    // Only set enablePurgeProtection if explicitly true (Azure doesn't allow setting it to false)
    if (props.enablePurgeProtection === true) {
      requestBody.properties.enablePurgeProtection = true;
    }

    // Add access policies if provided and RBAC is not enabled
    if (!props.enableRbacAuthorization) {
      requestBody.properties.accessPolicies = props.accessPolicies
        ? props.accessPolicies.map((policy) => ({
            tenantId: policy.tenantId,
            objectId: policy.objectId,
            permissions: {
              keys: policy.permissions.keys || [],
              secrets: policy.permissions.secrets || [],
              certificates: policy.permissions.certificates || [],
            },
          }))
        : [];
    }

    // Add network ACLs if specified
    if (
      props.networkAclsDefaultAction === "Deny" ||
      props.ipRules ||
      props.virtualNetworkRules
    ) {
      requestBody.properties.networkAcls = {
        defaultAction: props.networkAclsDefaultAction || "Allow",
        bypass: "AzureServices",
        ipRules: props.ipRules?.map((ip) => ({ value: ip })) || [],
        virtualNetworkRules:
          props.virtualNetworkRules?.map((vnet) => ({ id: vnet })) || [],
      };
    }

    let result: AzureVault;

    if (keyVaultId) {
      result = await clients.keyVault.vaults.beginCreateOrUpdateAndWait(
        resourceGroupName,
        name,
        requestBody,
      );
    } else {
      try {
        result = await clients.keyVault.vaults.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          requestBody,
        );
      } catch (error) {
        if (isConflictError(error)) {
          if (!adopt) {
            throw new Error(
              `Key vault "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }

          // Get existing key vault to verify it exists
          await clients.keyVault.vaults.get(resourceGroupName, name);

          // Update with requested configuration
          result = await clients.keyVault.vaults.beginCreateOrUpdateAndWait(
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
      keyVaultId: result.id!,
      location: result.location!,
      vaultUri: result.properties.vaultUri!,
      outputTenantId: result.properties.tenantId!,
      sku: result.properties.sku.name,
      enabledForDeployment: result.properties.enabledForDeployment,
      enabledForDiskEncryption: result.properties.enabledForDiskEncryption,
      enabledForTemplateDeployment:
        result.properties.enabledForTemplateDeployment,
      enablePurgeProtection: result.properties.enablePurgeProtection,
      enableSoftDelete: result.properties.enableSoftDelete,
      softDeleteRetentionInDays: result.properties.softDeleteRetentionInDays,
      enableRbacAuthorization: result.properties.enableRbacAuthorization,
      accessPolicies: result.properties.accessPolicies?.map((policy: any) => ({
        tenantId: policy.tenantId,
        objectId: policy.objectId,
        permissions: {
          keys: policy.permissions.keys || [],
          secrets: policy.permissions.secrets || [],
          certificates: policy.permissions.certificates || [],
        },
      })),
      networkAclsDefaultAction:
        result.properties.networkAcls?.defaultAction || "Allow",
      ipRules: result.properties.networkAcls?.ipRules?.map(
        (rule: any) => rule.value,
      ),
      virtualNetworkRules:
        result.properties.networkAcls?.virtualNetworkRules?.map(
          (rule: any) => rule.id,
        ),
      provisioningState: result.properties.provisioningState,
      resourceGroup: props.resourceGroup,
      tags: result.tags,
      type: "azure::KeyVault",
    };
  },
);

/**
 * Type guard to check if a resource is a KeyVault
 */
export function isKeyVault(resource: unknown): resource is KeyVault {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::KeyVault"
  );
}

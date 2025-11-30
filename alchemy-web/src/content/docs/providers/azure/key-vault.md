---
title: KeyVault
description: Azure Key Vault - Secrets, keys, and certificate management service
---

# KeyVault

Azure Key Vault helps safeguard cryptographic keys, secrets, and certificates used by cloud applications and services. It provides secure storage with hardware security module (HSM) backing and comprehensive access control.

**AWS Equivalent**: Combines AWS Secrets Manager (secrets) + AWS KMS (keys) + AWS Certificate Manager (certificates)

Key features:
- Secure secret storage with encryption at rest
- Cryptographic key management with HSM backing
- Certificate management and auto-renewal
- Access control via Access Policies or RBAC
- Soft delete and purge protection
- Network restrictions and private endpoints
- Audit logging and monitoring
- Integration with Azure services

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the key vault. Must be 3-24 characters, globally unique, alphanumeric and hyphens. Defaults to `${app}-${stage}-${id}` (lowercase) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this key vault in |
| `location` | `string` | No | Azure region for the key vault. Defaults to the resource group's location |
| `sku` | `"standard" \| "premium"` | No | SKU for the key vault. Premium includes HSM-backed keys. Defaults to `standard` |
| `enabledForDeployment` | `boolean` | No | Enable Azure VMs to retrieve certificates. Defaults to `false` |
| `enabledForDiskEncryption` | `boolean` | No | Enable Azure Disk Encryption to retrieve secrets. Defaults to `false` |
| `enabledForTemplateDeployment` | `boolean` | No | Enable ARM templates to retrieve secrets. Defaults to `false` |
| `enablePurgeProtection` | `boolean` | No | Prevent permanent deletion until retention expires. Defaults to `false` |
| `enableSoftDelete` | `boolean` | No | Retain deleted items for recovery. Defaults to `true` |
| `softDeleteRetentionInDays` | `number` | No | Retention period for soft delete (7-90 days). Defaults to `90` |
| `enableRbacAuthorization` | `boolean` | No | Use RBAC for data plane access instead of access policies. Defaults to `false` |
| `accessPolicies` | `AccessPolicy[]` | No | Access policies for the vault (required if not using RBAC) |
| `networkAclsDefaultAction` | `"Allow" \| "Deny"` | No | Default action for network ACLs. Defaults to `Allow` |
| `ipRules` | `string[]` | No | IP addresses or CIDR ranges allowed to access the vault |
| `virtualNetworkRules` | `string[]` | No | Virtual network subnet IDs allowed to access the vault |
| `tags` | `Record<string, string>` | No | Tags to apply to the key vault |
| `adopt` | `boolean` | No | Whether to adopt an existing key vault. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the key vault when removed from Alchemy. Defaults to `true` |

### Access Policy Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `objectId` | `string` | Yes | Azure AD object ID (user, service principal, or group) |
| `tenantId` | `string` | Yes | Azure AD tenant ID |
| `permissions` | `object` | Yes | Permissions for keys, secrets, and certificates |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `keyVaultId` | `string` | The Azure resource ID |
| `vaultUri` | `string` | The vault URI (e.g., `https://{name}.vault.azure.net/`) |
| `tenantId` | `string` | The Azure AD tenant ID |
| `provisioningState` | `string` | The provisioning state of the vault |
| `type` | `"azure::KeyVault"` | Resource type identifier |

## SKU Comparison

| Feature | Standard | Premium |
|---------|----------|---------|
| **Secrets** | ✅ Yes | ✅ Yes |
| **Keys** | Software-protected | **HSM-backed** |
| **Certificates** | ✅ Yes | ✅ Yes |
| **FIPS 140-2 Level** | Level 1 | **Level 2** |
| **Pricing** | Lower | Higher |
| **Use Cases** | Development, general use | Production, compliance |

## Usage

### Basic Key Vault with Standard SKU

Create a key vault for storing application secrets:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, KeyVault } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("security", {
  location: "eastus"
});

const vault = await KeyVault("secrets", {
  resourceGroup: rg,
  sku: "standard",
  enableSoftDelete: true,
  softDeleteRetentionInDays: 90
});

console.log(`Vault URI: ${vault.vaultUri}`);
// Store secrets using Azure SDK or Azure CLI

await app.finalize();
```

### Premium Key Vault with HSM-Backed Keys

Create a premium key vault for production workloads requiring HSM protection:

```typescript
const vault = await KeyVault("prod-secrets", {
  resourceGroup: rg,
  sku: "premium", // HSM-backed keys
  enablePurgeProtection: true, // Cannot be permanently deleted
  enableSoftDelete: true,
  softDeleteRetentionInDays: 90,
  tags: {
    environment: "production",
    compliance: "pci-dss"
  }
});
```

### Key Vault with RBAC Authorization

Use RBAC for data plane access instead of access policies:

```typescript
const vault = await KeyVault("rbac-vault", {
  resourceGroup: rg,
  sku: "standard",
  enableRbacAuthorization: true // Use RBAC instead of access policies
});

// Assign RBAC roles using Azure CLI or Azure Portal
// az role assignment create --role "Key Vault Secrets User" \
//   --assignee <user-object-id> \
//   --scope /subscriptions/.../vaults/rbac-vault
```

### Key Vault with Access Policies

Grant access to users or service principals using access policies:

```typescript
const vault = await KeyVault("app-vault", {
  resourceGroup: rg,
  sku: "standard",
  accessPolicies: [
    {
      tenantId: "your-tenant-id",
      objectId: "user-or-sp-object-id",
      permissions: {
        secrets: ["get", "list", "set"],
        keys: ["get", "list", "create"],
        certificates: ["get", "list"]
      }
    }
  ]
});
```

### Key Vault for Azure Resources

Enable Azure services to access the vault:

```typescript
const vault = await KeyVault("azure-vault", {
  resourceGroup: rg,
  sku: "standard",
  enabledForDeployment: true, // VMs can retrieve certificates
  enabledForDiskEncryption: true, // Disk encryption can use keys
  enabledForTemplateDeployment: true // ARM templates can retrieve secrets
});
```

### Key Vault with Network Restrictions

Restrict access to specific IP addresses and virtual networks:

```typescript
import { VirtualNetwork } from "alchemy/azure";

const vnet = await VirtualNetwork("app-network", {
  resourceGroup: rg,
  addressSpace: ["10.0.0.0/16"],
  subnets: [
    { name: "app-subnet", addressPrefix: "10.0.1.0/24" }
  ]
});

const vault = await KeyVault("secure-vault", {
  resourceGroup: rg,
  sku: "premium",
  networkAclsDefaultAction: "Deny", // Deny by default
  ipRules: ["203.0.113.0/24"], // Allow specific IPs
  virtualNetworkRules: [
    `${vnet.virtualNetworkId}/subnets/app-subnet` // Allow specific subnet
  ]
});
```

### Key Vault with Function App Integration

Use Key Vault with a Function App via managed identity:

```typescript
import { FunctionApp, UserAssignedIdentity } from "alchemy/azure";

const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
});

const vault = await KeyVault("app-secrets", {
  resourceGroup: rg,
  sku: "standard",
  accessPolicies: [
    {
      tenantId: vault.tenantId,
      objectId: identity.principalId,
      permissions: {
        secrets: ["get", "list"]
      }
    }
  ]
});

const api = await FunctionApp("api", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  identity: {
    type: "UserAssigned",
    userAssignedIdentities: [identity.userAssignedIdentityId]
  },
  environmentVariables: {
    KEY_VAULT_URI: vault.vaultUri
  }
});

// In function code, use DefaultAzureCredential to access vault
```

### Multi-Region Key Vault Setup

Create key vaults in multiple regions for redundancy:

```typescript
const primaryVault = await KeyVault("primary-vault", {
  resourceGroup: primaryRg,
  location: "eastus",
  sku: "premium",
  enablePurgeProtection: true
});

const secondaryVault = await KeyVault("secondary-vault", {
  resourceGroup: secondaryRg,
  location: "westus",
  sku: "premium",
  enablePurgeProtection: true
});

// Implement application-level replication for secrets
```

### Adopt Existing Key Vault

Adopt an existing key vault:

```typescript
const vault = await KeyVault("legacy-vault", {
  name: "existing-vault-name",
  resourceGroup: rg,
  sku: "standard",
  adopt: true // Adopt the existing vault
});
```

## Common Patterns

### Application Secrets Management

Store application configuration securely:

```typescript
const vault = await KeyVault("app-config", {
  resourceGroup: rg,
  sku: "standard",
  enableRbacAuthorization: true
});

// Store secrets using Azure CLI:
// az keyvault secret set --vault-name app-config \
//   --name DatabasePassword --value "secret123"
// az keyvault secret set --vault-name app-config \
//   --name ApiKey --value "key456"
```

### Certificate Management

Manage SSL/TLS certificates:

```typescript
const vault = await KeyVault("certs", {
  resourceGroup: rg,
  sku: "standard",
  accessPolicies: [
    {
      tenantId: vault.tenantId,
      objectId: "app-gateway-object-id",
      permissions: {
        certificates: ["get", "list"],
        secrets: ["get"] // Certificates stored as secrets
      }
    }
  ]
});

// Import or create certificates in the vault
// Use with Application Gateway, CDN, etc.
```

### Encryption Key Management

Manage encryption keys for data at rest:

```typescript
const vault = await KeyVault("encryption", {
  resourceGroup: rg,
  sku: "premium", // HSM-backed keys
  enablePurgeProtection: true,
  enabledForDiskEncryption: true
});

// Create encryption keys using Azure CLI:
// az keyvault key create --vault-name encryption \
//   --name disk-encryption-key --protection hsm
```

### Disaster Recovery

Implement backup and recovery for secrets:

```typescript
const vault = await KeyVault("dr-vault", {
  resourceGroup: rg,
  sku: "premium",
  enableSoftDelete: true,
  softDeleteRetentionInDays: 90, // Maximum retention
  enablePurgeProtection: true, // Cannot permanently delete
  accessPolicies: [
    {
      tenantId: vault.tenantId,
      objectId: "backup-sp-object-id",
      permissions: {
        secrets: ["backup", "restore"],
        keys: ["backup", "restore"],
        certificates: ["backup", "restore"]
      }
    }
  ]
});
```

## Important Notes

### Global Uniqueness

Key Vault names must be globally unique across all of Azure. The name becomes part of the vault URI: `https://{name}.vault.azure.net/`

### Immutable Properties

These properties cannot be changed after creation (requires replacement):
- `name` - The vault name (impacts URI)
- `location` - The Azure region
- `enablePurgeProtection` - **Cannot be disabled once enabled**

### Soft Delete

- **Enabled by default** since Azure enforces it
- Deleted vaults are retained for 7-90 days
- Can be recovered during retention period
- Use `enablePurgeProtection: true` to prevent permanent deletion

### Purge Protection

- **Once enabled, cannot be disabled**
- Prevents permanent deletion of vault and secrets until retention expires
- Recommended for production environments
- Required for compliance scenarios (PCI-DSS, HIPAA, etc.)

### Access Control

Two models available:

**Access Policies (Classic)**:
- Per-vault permission model
- Fine-grained control over keys, secrets, certificates
- Easier to understand for simple scenarios

**RBAC (Recommended)**:
- Azure-wide permission model
- Consistent with other Azure resources
- Better for large organizations
- Requires `enableRbacAuthorization: true`

### SKU Selection

**Standard SKU**:
- ✅ Software-protected keys
- ✅ Suitable for development and most production workloads
- ✅ Lower cost

**Premium SKU**:
- ✅ HSM-backed keys (FIPS 140-2 Level 2)
- ✅ Required for compliance (PCI-DSS, HIPAA)
- ✅ Better for high-value secrets
- ⚠️ Higher cost

### Network Security

For production:
1. Set `networkAclsDefaultAction: "Deny"`
2. Add specific IP ranges or VNet subnets
3. Consider private endpoints for internal-only access
4. Use firewall rules to restrict access

### Pricing

- Charged per operation (get, set, list, etc.)
- Secret storage is very low cost
- HSM-protected operations (Premium) cost more
- See [Key Vault Pricing](https://azure.microsoft.com/pricing/details/key-vault/)

### Best Practices

1. **Enable soft delete** for recoverability
2. **Use RBAC** for consistent access control
3. **Enable purge protection** for production vaults
4. **Use managed identities** instead of access keys when possible
5. **Implement network restrictions** for sensitive vaults
6. **Rotate secrets regularly** using automated processes
7. **Audit access** using Azure Monitor and Log Analytics
8. **Use Premium SKU** for compliance requirements

### Common Limitations

- Maximum 25 access policies per vault (use RBAC for more)
- Secret size limit: 25 KB
- Key Vault operations are rate-limited
- Cannot move vault between subscriptions without recreation

## Related Resources

- [ResourceGroup](./resource-group.md) - Required parent resource
- [UserAssignedIdentity](./user-assigned-identity.md) - For managed identity access
- [FunctionApp](./function-app.md) - Common consumer of secrets
- [VirtualNetwork](./virtual-network.md) - For network restrictions

## Official Documentation

- [Key Vault Documentation](https://docs.microsoft.com/azure/key-vault/)
- [Key Vault Best Practices](https://docs.microsoft.com/azure/key-vault/general/best-practices)
- [Key Vault RBAC Guide](https://docs.microsoft.com/azure/key-vault/general/rbac-guide)
- [Key Vault Pricing](https://azure.microsoft.com/pricing/details/key-vault/)

---
title: UserAssignedIdentity
description: Azure User-Assigned Managed Identity for secure resource authentication
---

# UserAssignedIdentity

A User-Assigned Managed Identity provides an identity in Azure Active Directory that can be assigned to Azure resources (like Function Apps, VMs, or Storage Accounts) to enable secure, password-less authentication to other Azure services.

## Key Benefits

- **No credentials to manage** - Azure handles authentication automatically
- **Can be shared** across multiple resources
- **Survives resource deletion** (unlike System-Assigned Identities)
- **Supports RBAC** for granular access control
- **Enables secure connectivity** without secrets in code

This is equivalent to **AWS IAM Roles** and enables the "cloud-native" pattern of granting permissions between resources without storing credentials.

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the identity. Must be 3-128 characters, alphanumeric, hyphens, and underscores. Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this identity in |
| `location` | `string` | No | Azure region for the identity. Inherited from resource group if not specified |
| `tags` | `Record<string, string>` | No | Tags to apply to the identity |
| `adopt` | `boolean` | No | Whether to adopt an existing identity. Defaults to `false` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `identityId` | `string` | The Azure resource ID |
| `principalId` | `string` | The principal ID (object ID) of the managed identity. Use this to grant access to Azure resources |
| `clientId` | `string` | The client ID of the managed identity. Use this for authentication scenarios |
| `tenantId` | `string` | The tenant ID of the managed identity |
| `type` | `"azure::UserAssignedIdentity"` | Resource type identifier |

## Usage

### Basic Identity

Create an identity and use it to grant a Function App access to Storage:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, UserAssignedIdentity } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

// Create an identity
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg,
  location: "eastus"
});

console.log(`Principal ID: ${identity.principalId}`);
console.log(`Client ID: ${identity.clientId}`);

await app.finalize();
```

### Identity with Tags

Create an identity with organizational tags:

```typescript
const identity = await UserAssignedIdentity("data-processor", {
  resourceGroup: rg,
  location: "westus2",
  tags: {
    purpose: "data-processing",
    team: "engineering",
    environment: "production"
  }
});
```

### Shared Identity Across Resources

Use a single identity across multiple resources:

```typescript
const sharedIdentity = await UserAssignedIdentity("shared", {
  resourceGroup: rg,
  location: "eastus"
});

const functionApp = await FunctionApp("api", {
  resourceGroup: rg,
  location: "eastus",
  identity: sharedIdentity
});

const containerInstance = await ContainerInstance("worker", {
  resourceGroup: rg,
  location: "eastus",
  identity: sharedIdentity
});

// Both resources share the same identity and permissions
```

### Location Inheritance

Inherit location from the resource group:

```typescript
const rg = await ResourceGroup("main", {
  location: "centralus"
});

// Location inherited automatically
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
  // location: "centralus" is inherited
});

console.log(identity.location);  // "centralus"
```

### Using Resource Group Reference

Reference a resource group by name (string) instead of object:

```typescript
// Using resource group name (string)
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: "my-existing-rg",  // String reference
  location: "eastus"  // Must specify location when using string
});
```

### Adopting an Existing Identity

Adopt an existing managed identity to manage it with Alchemy:

```typescript
const existingIdentity = await UserAssignedIdentity("existing", {
  name: "my-existing-identity",
  resourceGroup: rg,
  adopt: true
});
```

## Important Notes

### Principal ID for RBAC

The `principalId` is used to grant the identity access to other Azure resources:

```typescript
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
});

// Grant the identity "Storage Blob Data Contributor" role
// (This would be done via Azure RBAC, not shown in this example)
console.log(`Grant access to principal: ${identity.principalId}`);
```

Common Azure RBAC roles:
- **Storage Blob Data Contributor**: Read/write blob data
- **Storage Queue Data Contributor**: Read/write queue messages
- **Key Vault Secrets User**: Read secrets from Key Vault
- **Contributor**: Full access to resources

### Client ID for Authentication

The `clientId` is used when configuring applications to use the identity:

```typescript
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
});

// Use in application configuration
const config = {
  clientId: identity.clientId,
  tenantId: identity.tenantId
};
```

### Shared vs System-Assigned Identities

**User-Assigned (this resource)**:
- ✅ Can be shared across multiple resources
- ✅ Survives resource deletion
- ✅ Created and managed independently
- ✅ Use when you need persistent identity

**System-Assigned**:
- ❌ Tied to a single resource
- ❌ Deleted when resource is deleted
- ✅ Simpler for single-resource scenarios
- ✅ Use for simple, isolated access needs

### Naming Constraints

Identity names must:
- Be **3-128 characters** long
- Contain only **alphanumeric characters**, **hyphens**, and **underscores**
- Be unique within the **resource group**

Invalid names will throw a validation error:

```typescript
// ❌ Too short (less than 3 characters)
await UserAssignedIdentity("short", {
  name: "ab",
  resourceGroup: rg
});
// Error: User-assigned identity name "ab" is invalid. Must be 3-128 characters...

// ❌ Invalid characters
await UserAssignedIdentity("invalid", {
  name: "my identity!",
  resourceGroup: rg
});
// Error: User-assigned identity name "my identity!" is invalid...
```

### Location Immutability

The `location` property is **immutable** after creation. Changing it will trigger a **resource replacement** (delete old, create new).

**Important**: When an identity is replaced, you must:
1. Re-assign it to all resources that were using it
2. Re-configure RBAC permissions for the new principal ID
3. Update any applications using the client ID

### Adoption Pattern

When adopting an existing identity:

```typescript
// First attempt without adopt flag
await UserAssignedIdentity("existing", {
  name: "my-existing-identity",
  resourceGroup: rg
});
// ❌ Error: User-assigned identity "my-existing-identity" already exists. Use adopt: true to adopt it.

// Adopt the existing identity
await UserAssignedIdentity("existing", {
  name: "my-existing-identity",
  resourceGroup: rg,
  adopt: true  // ✅ Adopts and manages existing identity
});
```

## Common Patterns

### Function App with Storage Access

```typescript
const rg = await ResourceGroup("main", { location: "eastus" });

// Create identity
const identity = await UserAssignedIdentity("function-identity", {
  resourceGroup: rg
});

// Create storage
const storage = await StorageAccount("storage", {
  resourceGroup: rg
});

// Create function with identity
const func = await FunctionApp("api", {
  resourceGroup: rg,
  identity: identity
});

// Grant identity access to storage (via Azure RBAC)
// Then the function can access storage without credentials
```

### Multi-Region Identity

```typescript
const eastRg = await ResourceGroup("east", { location: "eastus" });
const westRg = await ResourceGroup("west", { location: "westus2" });

// Identity in East US
const eastIdentity = await UserAssignedIdentity("east-identity", {
  resourceGroup: eastRg
});

// Identity in West US
const westIdentity = await UserAssignedIdentity("west-identity", {
  resourceGroup: westRg
});

// Each region has its own identity for regional resources
```

## Type Safety

Check if a resource is a UserAssignedIdentity:

```typescript
import { isUserAssignedIdentity } from "alchemy/azure";

if (isUserAssignedIdentity(resource)) {
  console.log(resource.principalId);  // TypeScript knows this is a UserAssignedIdentity
}
```

## Related Resources

- [ResourceGroup](/providers/azure/resource-group) - Required container for the identity
- Use with FunctionApp, AppService, ContainerInstance for secure authentication
- Grant access to StorageAccount, KeyVault, and other Azure services

## Official Documentation

- [Managed Identities Overview](https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/overview)
- [How to use Managed Identities](https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/how-manage-user-assigned-managed-identities)
- [Azure RBAC Roles](https://docs.microsoft.com/azure/role-based-access-control/built-in-roles)
- [Managed Identity Best Practices](https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/managed-identity-best-practice-recommendations)

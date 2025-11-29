---
title: ResourceGroup
description: Azure Resource Group - logical container for Azure resources
---

# ResourceGroup

A Resource Group is Azure's fundamental organizational unit. All Azure resources must belong to exactly one resource group. Resource groups provide:

- **Logical grouping** of related resources
- **Lifecycle management** - deleting a group deletes all resources
- **Access control** and policy management
- **Cost tracking** and billing organization

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the resource group. Must be 1-90 characters, alphanumeric, underscores, hyphens, periods, and parentheses. Defaults to `${app}-${stage}-${id}` |
| `location` | `string` | Yes | Azure region for the resource group (e.g., "eastus", "westus2") |
| `tags` | `Record<string, string>` | No | Tags to apply to the resource group |
| `adopt` | `boolean` | No | Whether to adopt an existing resource group. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the resource group when removed from Alchemy. **WARNING**: Deleting a resource group deletes ALL resources inside it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `resourceGroupId` | `string` | The Azure resource ID (format: `/subscriptions/{subscriptionId}/resourceGroups/{name}`) |
| `provisioningState` | `string` | The provisioning state of the resource group |
| `type` | `"azure::ResourceGroup"` | Resource type identifier |

## Usage

### Basic Resource Group

Create a resource group in East US:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

console.log(`Resource Group: ${rg.name}`);
console.log(`Location: ${rg.location}`);
console.log(`Resource ID: ${rg.resourceGroupId}`);

await app.finalize();
```

### Resource Group with Tags

Create a resource group with organizational tags:

```typescript
const rg = await ResourceGroup("production-rg", {
  location: "westus2",
  tags: {
    environment: "production",
    team: "platform",
    costCenter: "engineering",
    project: "infrastructure"
  }
});
```

### Adopting an Existing Resource Group

Adopt an existing resource group to manage it with Alchemy:

```typescript
const existingRg = await ResourceGroup("existing", {
  name: "my-existing-rg",
  location: "eastus",
  adopt: true
});
```

### Multi-Region Deployment

Create resource groups in different regions:

```typescript
const usEast = await ResourceGroup("us-east", {
  location: "eastus",
  tags: { region: "us-east" }
});

const usWest = await ResourceGroup("us-west", {
  location: "westus2",
  tags: { region: "us-west" }
});

const europe = await ResourceGroup("europe", {
  location: "westeurope",
  tags: { region: "europe" }
});
```

### Preserving Resource Groups

Prevent a resource group from being deleted when removed from Alchemy:

```typescript
const preservedRg = await ResourceGroup("preserved", {
  location: "centralus",
  delete: false  // Resource group will NOT be deleted
});

await destroy(scope);
// Resource group still exists in Azure
```

**Warning**: Use `delete: false` carefully - preserved resource groups and their contents continue to incur costs.

## Important Notes

### Resource Group Deletion

When you delete a Resource Group in Azure:

1. **ALL resources inside are deleted** asynchronously
2. The deletion operation is **long-running** (can take several minutes)
3. Alchemy automatically waits for completion using the Azure SDK
4. You cannot recreate a resource group with the same name until deletion completes

### Immutable Properties

The `location` property is **immutable** after creation. Changing it will:
1. Trigger a **resource replacement** (delete old, create new)
2. **Delete all resources** in the old resource group
3. Require recreating all dependent resources

To change location, you must:
1. Create a new resource group in the desired location
2. Migrate resources to the new group
3. Delete the old resource group

### Naming Constraints

Resource group names must:
- Be **1-90 characters** long
- Contain only **alphanumeric characters**, **underscores**, **hyphens**, **periods**, and **parentheses**
- Be unique within your **Azure subscription**

Invalid names will throw a validation error:

```typescript
// ❌ Too long (over 90 characters)
await ResourceGroup("invalid", {
  name: "a".repeat(91),
  location: "eastus"
});
// Error: Resource group name "aaa..." is invalid. Must be 1-90 characters...

// ❌ Invalid characters
await ResourceGroup("invalid", {
  name: "my-rg@2024!",
  location: "eastus"
});
// Error: Resource group name "my-rg@2024!" is invalid...
```

### Adoption Pattern

When adopting an existing resource group:

```typescript
// First attempt without adopt flag
await ResourceGroup("existing", {
  name: "my-existing-rg",
  location: "eastus"
});
// ❌ Error: Resource group "my-existing-rg" already exists. Use adopt: true to adopt it.

// Adopt the existing resource group
await ResourceGroup("existing", {
  name: "my-existing-rg",
  location: "eastus",
  adopt: true  // ✅ Adopts and manages existing resource
});
```

## Type Safety

Check if a resource is a ResourceGroup:

```typescript
import { isResourceGroup } from "alchemy/azure";

if (isResourceGroup(resource)) {
  console.log(resource.location);  // TypeScript knows this is a ResourceGroup
}
```

## Related Resources

- **All Azure resources** require a Resource Group
- Use with [UserAssignedIdentity](/providers/azure/user-assigned-identity) for RBAC
- Container for [StorageAccount](/providers/azure/storage-account), [BlobContainer](/providers/azure/blob-container), and more

## Official Documentation

- [Azure Resource Groups Overview](https://docs.microsoft.com/azure/azure-resource-manager/management/overview#resource-groups)
- [Resource Group Naming Rules](https://docs.microsoft.com/azure/azure-resource-manager/management/resource-name-rules)
- [Azure Resource Manager](https://docs.microsoft.com/azure/azure-resource-manager/)

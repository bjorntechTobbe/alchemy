# Azure Provider for Alchemy

This directory contains the Azure provider implementation for Alchemy, enabling TypeScript-native Infrastructure-as-Code for Microsoft Azure resources.

## Overview

The Azure provider follows Alchemy's established patterns and conventions, providing type-safe, declarative infrastructure management with:

- **Official Azure SDK**: Uses `@azure/identity` and `@azure/arm-*` SDKs for reliable authentication and resource management
- **Multiple Authentication Methods**: Supports environment variables, Azure CLI, Service Principals, Managed Identity, and more
- **Long-Running Operation (LRO) Handling**: Automatic polling for async operations via Azure SDK
- **Three-Tier Credential Resolution**: Global → Scope → Resource precedence for flexible multi-subscription deployments
- **Comprehensive Error Handling**: Detailed error messages with proper Azure error code handling
- **Adoption Pattern**: Support for adopting existing Azure resources into Alchemy management
- **Local Development Support**: Mock data for offline development via `scope.local`

## Architecture

### Authentication Flow

```typescript
// 1. Global environment variables (lowest priority)
process.env.AZURE_SUBSCRIPTION_ID
process.env.AZURE_TENANT_ID
process.env.AZURE_CLIENT_ID
process.env.AZURE_CLIENT_SECRET

// 2. Scope-level credentials (medium priority)
await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
    tenantId: alchemy.secret.env.AZURE_TENANT_ID,
    clientId: alchemy.secret.env.AZURE_CLIENT_ID,
    clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET
  }
});

// 3. Resource-level credentials (highest priority)
const rg = await ResourceGroup("cross-subscription-rg", {
  subscriptionId: "different-subscription-id",
  location: "eastus"
});
```

### Client Factory

The `createAzureClients()` function creates Azure SDK clients with proper authentication:

```typescript
import { createAzureClients } from "alchemy/azure";

const clients = await createAzureClients();
// Returns:
// - clients.resources: ResourceManagementClient
// - clients.storage: StorageManagementClient
// - clients.msi: ManagedServiceIdentityClient
// - clients.credential: TokenCredential
// - clients.subscriptionId: string
```

The client factory supports:
- **DefaultAzureCredential**: Tries multiple authentication methods automatically
- **ClientSecretCredential**: Explicit service principal authentication
- **Credential Caching**: Reuses credentials across resource operations

## Resource Hierarchy

Azure has a unique hierarchical structure that must be respected:

```
Subscription
  └─ Resource Group (required container)
       └─ Resources (Storage, Compute, Databases, etc.)
```

**Key Principle**: All Azure resources must belong to exactly one Resource Group.

## Resources

### Tier 1: Core Infrastructure (Implemented)

#### ResourceGroup
**Purpose**: Logical container for Azure resources
**Priority**: HIGHEST - Required for all other resources
**Status**: ✅ Implemented

```typescript
const rg = await ResourceGroup("main", {
  location: "eastus",
  tags: {
    environment: "production",
    team: "platform"
  }
});
```

**Features**:
- Name validation (1-90 chars, alphanumeric + underscores/hyphens/periods/parentheses)
- Supports adoption of existing resource groups
- Optional deletion (set `delete: false` to preserve)
- Tag management
- Location is immutable (triggers replacement)

**Important**: Deleting a Resource Group deletes ALL resources inside it. The SDK automatically waits for completion.

#### UserAssignedIdentity
**Purpose**: Managed Identity for secure resource-to-resource authentication
**Equivalent**: AWS IAM Role
**Priority**: HIGHEST - Critical for cloud-native security
**Status**: ✅ Implemented

```typescript
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg,
  location: "eastus"
});

// Use with other resources
const functionApp = await FunctionApp("api", {
  resourceGroup: rg,
  identity: identity // Grants access without secrets
});
```

**Features**:
- Name validation (3-128 chars, alphanumeric + hyphens/underscores)
- Returns `principalId`, `clientId`, `tenantId` for RBAC
- Can be shared across multiple resources
- Survives resource deletion (unlike System-Assigned Identities)
- Location inheritance from Resource Group when not specified

### Tier 2: Storage (Implemented)

#### StorageAccount
**Purpose**: Foundation for blob storage, file shares, queues, and tables
**Equivalent**: AWS S3 Account-level settings
**Priority**: HIGH
**Status**: ✅ Implemented

#### BlobContainer
**Purpose**: Object storage container
**Equivalent**: Cloudflare R2 Bucket, AWS S3 Bucket
**Priority**: HIGH
**Status**: ✅ Implemented

### Tier 3: Compute (Implemented)

#### FunctionApp
**Purpose**: Serverless compute platform
**Equivalent**: Cloudflare Workers, AWS Lambda
**Priority**: HIGH
**Status**: ✅ Implemented

#### StaticWebApp
**Purpose**: Static site hosting with built-in CI/CD
**Equivalent**: Cloudflare Pages, AWS Amplify
**Priority**: HIGH
**Status**: ✅ Implemented

#### AppService
**Purpose**: PaaS web hosting for containers and code
**Equivalent**: AWS Elastic Beanstalk
**Priority**: MEDIUM
**Status**: ✅ Implemented

### Tier 4: Databases (Implemented)

#### CosmosDBAccount
**Purpose**: Multi-model NoSQL database
**Equivalent**: AWS DynamoDB
**Priority**: MEDIUM
**Status**: ✅ Implemented

#### SqlServer
**Purpose**: Managed SQL Server instance
**Equivalent**: AWS RDS for SQL Server
**Priority**: MEDIUM
**Status**: ✅ Implemented

#### SqlDatabase
**Purpose**: SQL databases on SQL Server
**Equivalent**: AWS RDS Database
**Priority**: MEDIUM
**Status**: ✅ Implemented

### Tier 5: Security & Advanced

#### KeyVault
**Purpose**: Secrets and key management
**Equivalent**: AWS Secrets Manager + AWS KMS
**Priority**: HIGH
**Status**: ✅ Implemented

```typescript
const vault = await KeyVault("secrets", {
  resourceGroup: rg,
  sku: "standard",
  enableSoftDelete: true,
  enableRbacAuthorization: true
});

console.log(`Vault URI: ${vault.vaultUri}`);
```

**Features**:
- Name validation (3-24 chars, globally unique, alphanumeric + hyphens)
- Supports both access policies and RBAC authorization
- Soft delete and purge protection
- Network ACLs (IP and VNet rules)
- Azure resource integration (VMs, Disk Encryption, ARM templates)
- Adoption of existing vaults
- Optional deletion (set `delete: false` to preserve secrets)

#### ContainerInstance
**Purpose**: Run containers without orchestration
**Equivalent**: AWS ECS Fargate, Cloudflare Container
**Priority**: MEDIUM
**Status**: ✅ Implemented

**Planned Resources**:
- **ServiceBus**: Enterprise messaging service
- **CognitiveServices**: AI/ML services
- **CDN**: Content delivery network

## Azure-Specific Patterns

### Resource Group Dependency

All resources accept a `resourceGroup` parameter that can be either:
1. A `ResourceGroup` object (recommended - type-safe)
2. A string (for referencing existing resource groups)

```typescript
// Pattern 1: Type-safe reference
const rg = await ResourceGroup("my-rg", { location: "eastus" });
const storage = await StorageAccount("storage", {
  resourceGroup: rg  // ResourceGroup object
});

// Pattern 2: String reference (for existing resources)
const storage = await StorageAccount("storage", {
  resourceGroup: "existing-resource-group"  // string
});
```

### Naming Constraints

Azure has strict naming rules that vary by resource type:

| Resource | Length | Characters | Case | Uniqueness |
|----------|--------|------------|------|------------|
| Resource Group | 1-90 | Letters, numbers, periods, underscores, hyphens, parentheses | Mixed | Subscription |
| Storage Account | 3-24 | Lowercase letters, numbers only | Lowercase | Global |
| Blob Container | 3-63 | Lowercase letters, numbers, hyphens | Lowercase | Storage Account |
| User-Assigned Identity | 3-128 | Alphanumeric, hyphens, underscores | Mixed | Resource Group |

All resources implement automatic validation with helpful error messages.

### Location Inheritance

Many resources support inheriting their location from their Resource Group:

```typescript
const rg = await ResourceGroup("main", { location: "eastus" });

// Location inherited automatically
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
  // location: "eastus" is inherited
});

// Or override explicitly
const identity2 = await UserAssignedIdentity("other-identity", {
  resourceGroup: rg,
  location: "westus2"  // Override
});
```

### Long-Running Operations (LROs)

Azure management operations often return `202 Accepted` and complete asynchronously. The Azure SDK handles this automatically:

```typescript
// The SDK polls until completion
const rg = await ResourceGroup("my-rg", { location: "eastus" });
// ✅ Resource is fully created when promise resolves

// Same for deletion
await destroy(scope);
// ✅ All resources are fully deleted when promise resolves
```

**Important**: Never use raw `fetch()` for Azure management APIs - always use the official SDK to ensure proper LRO handling.

### Adoption Pattern

All resources support adopting existing Azure resources:

```typescript
// Without adopt flag - fails if exists
await ResourceGroup("existing-rg", {
  name: "my-existing-rg",
  location: "eastus"
});
// ❌ Error: Resource group "my-existing-rg" already exists. Use adopt: true to adopt it.

// With adopt flag - adopts and updates
await ResourceGroup("existing-rg", {
  name: "my-existing-rg",
  location: "eastus",
  adopt: true  // ✅ Adopts existing resource
});
```

### Resource Deletion Control

Data resources support opt-out deletion to prevent accidental data loss:

```typescript
const rg = await ResourceGroup("preserve-rg", {
  location: "eastus",
  delete: false  // Resource preserved on scope destruction
});

await destroy(scope);
// ✅ Resource group is NOT deleted
```

**Warning**: Use `delete: false` carefully - it can lead to orphaned resources that continue to incur costs.

## Testing

All resources have comprehensive test coverage following Alchemy patterns:

```typescript
import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { destroy } from "../../src/destroy.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Resources", () => {
  test("create resource group", async (scope) => {
    const rg = await ResourceGroup("test-rg", {
      location: "eastus"
    });

    expect(rg.name).toBeTruthy();
    expect(rg.location).toBe("eastus");

    await destroy(scope);
    await assertResourceGroupDoesNotExist(rg.name);
  });
});
```

Test coverage includes:
- ✅ Create, update, delete lifecycle
- ✅ Adoption scenarios
- ✅ Name validation
- ✅ Default name generation
- ✅ Tag management
- ✅ Error handling
- ✅ Deletion preservation (`delete: false`)
- ✅ Conflict detection

## File Structure

```
azure/
├── client.ts                    # Azure SDK client factory
├── client-props.ts              # TypeScript interfaces + scope augmentation
├── credentials.ts               # Three-tier credential resolution
├── index.ts                     # Module exports
├── resource-group.ts            # ResourceGroup resource
├── user-assigned-identity.ts    # UserAssignedIdentity resource
└── README.md                    # This file
```

## Official Documentation

- [Azure Portal](https://portal.azure.com)
- [Azure SDK for JavaScript](https://github.com/Azure/azure-sdk-for-js)
- [Azure Resource Manager](https://docs.microsoft.com/azure/azure-resource-manager/)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure/)
- [Azure Naming Conventions](https://docs.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming)
- [DefaultAzureCredential](https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential)

## Contributing

When adding new Azure resources:

1. Follow the resource implementation pattern from `resource-group.ts`
2. Use the official Azure SDK (never raw `fetch()`)
3. Implement comprehensive tests with lifecycle verification
4. Add proper name validation per Azure requirements
5. Support the adoption pattern for existing resources
6. Use `Omit` pattern for output types to separate input/computed properties
7. Export type guard function (`isResourceName()`)
8. Document with JSDoc including `@example` blocks
9. Update this README with the new resource

See [AGENTS.md](../../../AGENTS.md) for detailed coding guidelines.

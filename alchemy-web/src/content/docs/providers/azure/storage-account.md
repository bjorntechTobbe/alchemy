---
title: StorageAccount
description: Azure Storage Account - foundation for blob, file, queue, and table storage
---

# StorageAccount

A Storage Account provides a unique namespace in Azure for storing data objects. Storage Accounts support:

- **Blob storage** (objects/files) - equivalent to AWS S3, Cloudflare R2
- **File storage** (SMB file shares)
- **Queue storage** (messaging)
- **Table storage** (NoSQL key-value)

Key features:
- Multiple redundancy options (LRS, GRS, ZRS, RA-GRS)
- Different access tiers (Hot, Cool, Archive)
- Globally unique naming across all of Azure
- Secure access via connection strings or managed identity
- Data encryption at rest and in transit

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the storage account. Must be 3-24 characters, lowercase letters and numbers only. Must be globally unique across all of Azure. Defaults to `${app}-${stage}-${id}` (lowercase, numbers only) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this storage account in |
| `location` | `string` | No | Azure region for the storage account. Defaults to the resource group's location |
| `sku` | `string` | No | The SKU (pricing tier). Options: `Standard_LRS`, `Standard_GRS`, `Standard_RAGRS`, `Standard_ZRS`, `Premium_LRS`, `Premium_ZRS`. Defaults to `Standard_LRS` |
| `kind` | `string` | No | The kind of storage account. Options: `StorageV2`, `BlobStorage`, `BlockBlobStorage`, `FileStorage`. Defaults to `StorageV2` |
| `accessTier` | `string` | No | Access tier for blob data. Options: `Hot`, `Cool`. Defaults to `Hot` |
| `enableHierarchicalNamespace` | `boolean` | No | Enable hierarchical namespace for Data Lake Storage Gen2. Defaults to `false` |
| `allowBlobPublicAccess` | `boolean` | No | Enable blob public access. When false, anonymous access is disabled. Defaults to `false` |
| `minimumTlsVersion` | `string` | No | Minimum TLS version required. Options: `TLS1_0`, `TLS1_1`, `TLS1_2`. Defaults to `TLS1_2` |
| `tags` | `Record<string, string>` | No | Tags to apply to the storage account |
| `adopt` | `boolean` | No | Whether to adopt an existing storage account. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the storage account when removed from Alchemy. **WARNING**: Deleting a storage account deletes ALL data inside it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `storageAccountId` | `string` | The Azure resource ID |
| `primaryConnectionString` | `Secret` | Primary connection string for accessing the storage account |
| `secondaryConnectionString` | `Secret` | Secondary connection string (if geo-redundant storage is enabled) |
| `primaryAccessKey` | `Secret` | Primary access key |
| `secondaryAccessKey` | `Secret` | Secondary access key |
| `primaryBlobEndpoint` | `string` | Primary blob endpoint (e.g., `https://{accountName}.blob.core.windows.net/`) |
| `primaryFileEndpoint` | `string` | Primary file endpoint |
| `primaryQueueEndpoint` | `string` | Primary queue endpoint |
| `primaryTableEndpoint` | `string` | Primary table endpoint |
| `provisioningState` | `string` | The provisioning state of the storage account |
| `type` | `"azure::StorageAccount"` | Resource type identifier |

## Usage

### Basic Storage Account

Create a storage account for blob storage:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, StorageAccount } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  sku: "Standard_LRS",
  accessTier: "Hot"
});

console.log(`Storage Account: ${storage.name}`);
console.log(`Blob Endpoint: ${storage.primaryBlobEndpoint}`);

await app.finalize();
```

### Storage Account with Geo-Redundancy

Create a geo-redundant storage account for critical data:

```typescript
const storage = await StorageAccount("critical-storage", {
  resourceGroup: rg,
  sku: "Standard_RAGRS", // Read-access geo-redundant
  accessTier: "Hot",
  tags: {
    criticality: "high",
    backup: "enabled"
  }
});

// Both primary and secondary connection strings available
console.log(`Primary Endpoint: ${storage.primaryBlobEndpoint}`);
console.log(`Secondary Connection: ${storage.secondaryConnectionString}`);
```

### Premium Storage for High Performance

Create a premium storage account for low-latency workloads:

```typescript
const premiumStorage = await StorageAccount("premium", {
  resourceGroup: rg,
  sku: "Premium_LRS",
  kind: "BlockBlobStorage", // Optimized for block blobs
  tags: {
    performance: "high",
    purpose: "media-processing"
  }
});
```

### Data Lake Storage Gen2

Create a storage account with hierarchical namespace for big data analytics:

```typescript
const dataLake = await StorageAccount("datalake", {
  resourceGroup: rg,
  sku: "Standard_LRS",
  enableHierarchicalNamespace: true, // Enables Data Lake Gen2
  tags: {
    purpose: "analytics",
    type: "datalake"
  }
});
```

### Using Connection Strings

Access the storage account using connection strings:

```typescript
const storage = await StorageAccount("app-storage", {
  resourceGroup: rg,
  sku: "Standard_LRS"
});

// Connection string is a Secret - use Secret.unwrap() to get the value
import { Secret } from "alchemy";

const connectionString = Secret.unwrap(storage.primaryConnectionString);

// Use with Azure SDKs
import { BlobServiceClient } from "@azure/storage-blob";

const blobService = BlobServiceClient.fromConnectionString(connectionString);
```

### Multi-Region Storage

Create storage accounts in different regions:

```typescript
const usEastRg = await ResourceGroup("us-east", {
  location: "eastus"
});

const usWestRg = await ResourceGroup("us-west", {
  location: "westus2"
});

const usEastStorage = await StorageAccount("us-east-storage", {
  resourceGroup: usEastRg,
  sku: "Standard_LRS"
});

const usWestStorage = await StorageAccount("us-west-storage", {
  resourceGroup: usWestRg,
  sku: "Standard_LRS"
});
```

### Adopting an Existing Storage Account

Adopt an existing storage account to manage it with Alchemy:

```typescript
const existingStorage = await StorageAccount("existing", {
  name: "myexistingstorage123",
  resourceGroup: "my-existing-rg",
  location: "eastus",
  adopt: true
});
```

## Important Notes

### Naming Constraints

- Storage account names must be **globally unique** across all of Azure
- Must be 3-24 characters
- Can only contain lowercase letters and numbers
- No hyphens, underscores, or special characters allowed

### Immutable Properties

The following properties cannot be changed after creation:
- `name` - Changing requires resource replacement
- `location` - Changing requires resource replacement
- `enableHierarchicalNamespace` - Changing requires resource replacement

### Access Keys and Connection Strings

- Connection strings and access keys are returned as `Secret` objects
- Use `Secret.unwrap()` to access the actual values
- Keys are automatically rotated by Azure when needed
- Both primary and secondary keys are available for zero-downtime rotation

### SKU Options

| SKU | Redundancy | Performance | Use Case |
|-----|------------|-------------|----------|
| `Standard_LRS` | Locally redundant | Standard | Development, non-critical data |
| `Standard_ZRS` | Zone redundant | Standard | High availability within region |
| `Standard_GRS` | Geo-redundant | Standard | Disaster recovery |
| `Standard_RAGRS` | Read-access geo-redundant | Standard | DR with read access |
| `Premium_LRS` | Locally redundant | Premium | Low-latency workloads |
| `Premium_ZRS` | Zone redundant | Premium | High availability + low latency |

### Access Tiers

- **Hot**: Optimized for frequently accessed data (default)
- **Cool**: Optimized for infrequently accessed data (lower storage costs, higher access costs)
- **Archive**: Lowest storage cost, highest access cost (blob-level only)

## Related Resources

- [BlobContainer](./blob-container.md) - Create blob containers in a storage account
- [ResourceGroup](./resource-group.md) - Required parent resource for storage accounts
- [UserAssignedIdentity](./user-assigned-identity.md) - For managed identity access

## Official Documentation

- [Azure Storage Account Overview](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-overview)
- [Storage Account Redundancy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy)
- [Storage Access Tiers](https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview)
- [Data Lake Storage Gen2](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction)

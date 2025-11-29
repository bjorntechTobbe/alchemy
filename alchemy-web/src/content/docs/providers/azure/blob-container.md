---
title: BlobContainer
description: Azure Blob Container - object storage container for blobs
---

# BlobContainer

A Blob Container provides a grouping of blobs within a Storage Account. Containers are similar to directories or folders in a file system. This is equivalent to AWS S3 Buckets and Cloudflare R2 Buckets.

Key features:
- Organize blobs into logical groups
- Set public access levels (private, blob-level, container-level)
- Store unlimited blobs (up to 500 TB per storage account)
- Metadata support for container-level information
- Immutability policies for compliance (WORM storage)
- Soft delete for accidental deletion protection

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the blob container. Must be 3-63 characters, lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen, and cannot have consecutive hyphens. Defaults to `${app}-${stage}-${id}` (lowercase, valid characters only) |
| `storageAccount` | `string \| StorageAccount` | Yes | The storage account to create this container in |
| `resourceGroup` | `string` | No | The resource group containing the storage account. Required if `storageAccount` is a string name. Inherited from StorageAccount object if provided |
| `publicAccess` | `string` | No | Public access level. Options: `None` (no anonymous access), `Blob` (anonymous read for blobs), `Container` (anonymous read for container and blobs). Defaults to `None` |
| `metadata` | `Record<string, string>` | No | Metadata key-value pairs for the container |
| `tags` | `Record<string, string>` | No | Tags to apply to the blob container (stored in metadata) |
| `adopt` | `boolean` | No | Whether to adopt an existing blob container. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the container when removed from Alchemy. **WARNING**: Deleting a container deletes ALL blobs inside it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `url` | `string` | The container URL (e.g., `https://{accountName}.blob.core.windows.net/{containerName}`) |
| `hasImmutabilityPolicy` | `boolean` | Whether the container has an immutability policy |
| `hasLegalHold` | `boolean` | Whether the container has a legal hold |
| `type` | `"azure::BlobContainer"` | Resource type identifier |

## Usage

### Basic Blob Container

Create a private blob container:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, StorageAccount, BlobContainer } from "alchemy/azure";

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
  sku: "Standard_LRS"
});

const container = await BlobContainer("uploads", {
  storageAccount: storage,
  publicAccess: "None" // Private container
});

console.log(`Container URL: ${container.url}`);

await app.finalize();
```

### Public Blob Container

Create a container with public read access for static assets:

```typescript
const publicContainer = await BlobContainer("assets", {
  storageAccount: storage,
  publicAccess: "Blob", // Anonymous read access to blobs
  metadata: {
    purpose: "static-assets",
    cdn: "enabled"
  }
});

// Blobs in this container can be accessed via:
// https://{accountName}.blob.core.windows.net/assets/{blobName}
```

### Multiple Containers with Different Access Levels

Create different containers for different purposes:

```typescript
// Private container for user data
const privateData = await BlobContainer("user-data", {
  storageAccount: storage,
  publicAccess: "None",
  metadata: { purpose: "user-storage" }
});

// Public container for images
const images = await BlobContainer("images", {
  storageAccount: storage,
  publicAccess: "Blob",
  metadata: { purpose: "public-images" }
});

// Container-level public access for entire container listings
const downloads = await BlobContainer("downloads", {
  storageAccount: storage,
  publicAccess: "Container", // Can list all blobs anonymously
  metadata: { purpose: "public-downloads" }
});
```

### Container with Storage Account Reference

Reference an existing storage account by name:

```typescript
const container = await BlobContainer("backups", {
  storageAccount: "myexistingstorage123",
  resourceGroup: "my-resource-group",
  publicAccess: "None",
  metadata: {
    purpose: "database-backups",
    retention: "30-days"
  }
});
```

### Uploading Blobs

Use the Azure Storage SDK to upload files to the container:

```typescript
import { BlobServiceClient } from "@azure/storage-blob";
import { Secret } from "alchemy";

const container = await BlobContainer("uploads", {
  storageAccount: storage,
  publicAccess: "None"
});

// Get connection string from storage account
const connectionString = Secret.unwrap(storage.primaryConnectionString);

// Create blob service client
const blobService = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobService.getContainerClient(container.name);

// Upload a file
const blobName = "example.txt";
const blockBlobClient = containerClient.getBlockBlobClient(blobName);
await blockBlobClient.upload("Hello, Azure Blob Storage!", 25);

console.log(`Uploaded to: ${container.url}/${blobName}`);
```

### Container with Metadata

Add custom metadata to organize containers:

```typescript
const container = await BlobContainer("analytics", {
  storageAccount: storage,
  publicAccess: "None",
  metadata: {
    department: "engineering",
    project: "data-pipeline",
    retention: "90-days",
    compliance: "gdpr"
  }
});
```

### Preserving Containers

Prevent accidental deletion by setting `delete: false`:

```typescript
const preservedContainer = await BlobContainer("important-data", {
  storageAccount: storage,
  publicAccess: "None",
  delete: false, // Container won't be deleted when removed from Alchemy
  metadata: {
    protected: "true",
    reason: "contains-production-data"
  }
});
```

### Adopting an Existing Container

Adopt an existing blob container to manage it with Alchemy:

```typescript
const existingContainer = await BlobContainer("existing", {
  name: "my-existing-container",
  storageAccount: "myexistingstorage123",
  resourceGroup: "my-resource-group",
  adopt: true
});
```

## Important Notes

### Public Access Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `None` | No anonymous access (default) | Private data, user uploads |
| `Blob` | Anonymous read access to individual blobs | Public static assets (images, CSS, JS) |
| `Container` | Anonymous read access to container and blobs | Public downloads, file sharing |

### Naming Constraints

- Container names must be 3-63 characters
- Can only contain lowercase letters, numbers, and hyphens
- Cannot start or end with a hyphen
- Cannot have consecutive hyphens
- Must be unique within the storage account

### Container URLs

Containers are accessed via:
```
https://{storageAccountName}.blob.core.windows.net/{containerName}
```

Individual blobs are accessed via:
```
https://{storageAccountName}.blob.core.windows.net/{containerName}/{blobName}
```

### Blob Storage Features

- **Block blobs**: Optimized for text and binary data (up to 4.75 TB per blob)
- **Page blobs**: Optimized for random read/write operations (VHD files)
- **Append blobs**: Optimized for append operations (logs)

### Best Practices

1. **Use private containers by default** - Only enable public access when necessary
2. **Organize by purpose** - Create separate containers for different data types
3. **Use metadata** - Tag containers with organizational information
4. **Enable soft delete** - Protect against accidental deletion (enabled at storage account level)
5. **Implement lifecycle policies** - Automatically tier or delete old data

## Common Patterns

### Static Website Hosting

```typescript
const website = await BlobContainer("$web", {
  storageAccount: storage,
  publicAccess: "Blob"
});

// Enable static website hosting on the storage account
// (requires additional Azure SDK configuration)
```

### Backup Storage

```typescript
const backups = await BlobContainer("backups", {
  storageAccount: storage,
  publicAccess: "None",
  delete: false, // Preserve backups
  metadata: {
    purpose: "database-backups",
    retention: "30-days",
    schedule: "daily"
  }
});
```

### Multi-Environment Setup

```typescript
const environments = ["dev", "staging", "production"];

const containers = await Promise.all(
  environments.map(env =>
    BlobContainer(`${env}-data`, {
      storageAccount: storage,
      publicAccess: "None",
      metadata: {
        environment: env,
        purpose: "application-data"
      }
    })
  )
);
```

## Related Resources

- [StorageAccount](./storage-account.md) - Required parent resource for blob containers
- [ResourceGroup](./resource-group.md) - Container for Azure resources
- [UserAssignedIdentity](./user-assigned-identity.md) - For managed identity access to blobs

## Official Documentation

- [Azure Blob Storage Overview](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-overview)
- [Container Public Access](https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure)
- [Blob Storage SDK](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs)
- [Immutability Policies](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview)

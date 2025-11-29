# Azure Storage Example

This example demonstrates how to use Alchemy to provision Azure Storage infrastructure including:

- **Resource Groups** - Logical containers for Azure resources
- **Storage Accounts** - Foundation for blob, file, queue, and table storage
- **Blob Containers** - Object storage containers with different access levels
- **Managed Identities** - Secure authentication for Azure resources

## Features Demonstrated

### Storage Accounts
- Standard locally redundant storage (LRS)
- Geo-redundant storage (GRS) for critical data
- Different access tiers (Hot, Cool)
- Connection strings and access keys

### Blob Containers
- **Private containers** - No anonymous access (user uploads)
- **Public containers** - Anonymous blob-level access (static assets)
- **Preserved containers** - Not deleted when infrastructure is destroyed (backups)
- Container metadata and tags

### Security
- User-assigned managed identities
- TLS 1.2 minimum encryption
- Public access controls

## Prerequisites

1. **Azure Account**: You need an Azure account with an active subscription
2. **Azure CLI**: Install and authenticate with Azure CLI
   ```bash
   # Install Azure CLI (macOS)
   brew install azure-cli
   
   # Login to Azure
   az login
   
   # Set your subscription
   az account set --subscription "<your-subscription-id>"
   ```

3. **Environment Variables**: Set your Azure subscription ID
   ```bash
   export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
   ```

## Installation

```bash
# Install dependencies
bun install
```

## Deployment

Deploy the infrastructure:

```bash
bun alchemy.run.ts
```

This will create:
- 1 Resource Group in East US
- 1 User-Assigned Managed Identity
- 2 Storage Accounts (Standard LRS and Geo-Redundant)
- 4 Blob Containers (private, public, backup, critical)

Expected output:
```
✓ Resource Group: azure-storage-example-dev-storage-demo
✓ Managed Identity: azure-storage-example-dev-storage-identity
  Principal ID: ...
✓ Storage Account: azurestorageexampledev...
  Blob Endpoint: https://azurestorageexampledev.blob.core.windows.net/
  ...
✓ Private Container: uploads
  URL: https://...blob.core.windows.net/uploads
  Public Access: None
✓ Public Container: assets
  URL: https://...blob.core.windows.net/assets
  Public Access: Blob
...
```

## Using the Storage

### Get Connection String

After deployment, get the storage account connection string:

```bash
# Get the storage account name from the deployment output
STORAGE_ACCOUNT_NAME="<storage-account-name>"
RESOURCE_GROUP_NAME="<resource-group-name>"

# Get the connection string
az storage account show-connection-string \
  --name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP_NAME" \
  --output tsv
```

### Upload Files

Set the connection string and run the upload script:

```bash
export AZURE_STORAGE_CONNECTION_STRING="<connection-string>"
bun run upload
```

This will:
1. Upload `sample.txt` to the private container
2. Upload `data.json` to the private container
3. Upload `demo.html` to the public container
4. List all blobs in the private container

### Access Public Files

Public blobs can be accessed directly via URL:

```
https://{storageAccountName}.blob.core.windows.net/assets/demo.html
```

Copy the URL from the upload output and open it in your browser!

### Access Private Files

Private blobs require authentication. You can:

1. **Use Azure SDK** with connection string (as shown in `src/upload.ts`)
2. **Use Managed Identity** from Azure services (Function Apps, VMs)
3. **Generate SAS token** for temporary access:
   ```bash
   az storage blob generate-sas \
     --account-name "$STORAGE_ACCOUNT_NAME" \
     --container-name uploads \
     --name sample.txt \
     --permissions r \
     --expiry "2024-12-31T23:59:59Z" \
     --https-only
   ```

## Project Structure

```
azure-storage/
├── alchemy.run.ts          # Infrastructure definition
├── src/
│   └── upload.ts           # Example upload script
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md              # This file
```

## Cleanup

### Option 1: Destroy All Resources

```bash
bun alchemy.run.ts --destroy
```

**Note**: The backup container has `delete: false`, so it will be preserved. You'll need to delete it manually if desired:

```bash
az storage container delete \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --name backups
```

### Option 2: Keep Specific Resources

To keep the storage account but remove it from Alchemy management, add `delete: false` to the resource definition in `alchemy.run.ts`.

## Cost Estimation

This example creates resources that incur costs:

- **Resource Group**: Free
- **Managed Identity**: Free
- **Storage Account (Standard LRS)**: ~$0.02/GB/month + operations
- **Storage Account (Standard GRS)**: ~$0.04/GB/month + operations
- **Blob Storage**: Charged per GB stored and operations

**Estimated monthly cost** (if left running with minimal data): ~$1-5

Remember to destroy resources when done testing!

## Learn More

- [Azure Storage Account](../../alchemy-web/src/content/docs/providers/azure/storage-account.md)
- [Azure Blob Container](../../alchemy-web/src/content/docs/providers/azure/blob-container.md)
- [Azure Resource Group](../../alchemy-web/src/content/docs/providers/azure/resource-group.md)
- [Azure SDK for JavaScript](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs)

## Troubleshooting

### Authentication Errors

If you get authentication errors:
1. Ensure you're logged in: `az login`
2. Check your subscription: `az account show`
3. Verify the subscription ID matches your environment variable

### Storage Account Name Conflicts

Storage account names must be globally unique. If you get a conflict:
1. The default name includes your app name and stage
2. Try changing the app name in `alchemy.run.ts`
3. Or manually specify a unique name:
   ```typescript
   const storage = await StorageAccount("storage", {
     name: "myuniquestorage123", // must be globally unique
     resourceGroup: rg,
     ...
   });
   ```

### Connection String Not Working

Ensure you:
1. Copied the entire connection string (it's quite long)
2. Wrapped it in quotes: `export AZURE_STORAGE_CONNECTION_STRING="..."`
3. Set it in the same terminal session where you run `bun run upload`

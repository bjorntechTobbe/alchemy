---
title: BlobStateStore
description: Learn how to use BlobStateStore for reliable, cloud-based state storage in your Alchemy applications using Azure Blob Storage.
---

The BlobStateStore provides reliable, scalable state storage for Alchemy applications using [Azure Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/). It's designed for cloud-based deployments where you need durable, shared state storage across multiple environments or team members.

## Basic Usage

Configure Alchemy to use Azure Blob Storage for state storage:

```ts
import { BlobStateStore } from "alchemy/azure";

const app = await alchemy("my-app", {
  stage: "prod",
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: "myalchemystate",
    accountKey: process.env.AZURE_STORAGE_KEY,
    containerName: "alchemy-state"
  })
});
```

## Configuration Options

### Account Name and Key

Specify the Azure Storage account credentials:

```ts
import { BlobStateStore } from "alchemy/azure";

const app = await alchemy("my-app", {
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: "mycompanyalchemy",
    accountKey: process.env.AZURE_STORAGE_KEY,
    containerName: "alchemy-state"
  })
});
```

### Custom Container and Prefix

Use a custom container name and prefix to organize state files:

```ts
import { BlobStateStore } from "alchemy/azure";

const app = await alchemy("my-app", {
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: "sharedalchemy",
    accountKey: process.env.AZURE_STORAGE_KEY,
    containerName: "team-state",
    prefix: "my-team/my-app/"
  })
});
```

## Prerequisites

### Create Storage Account and Container

The Azure Storage account and container must exist before using BlobStateStore.

```bash
# Create a storage account with Azure CLI
az storage account create \
  --name myalchemystate \
  --resource-group my-resource-group \
  --location eastus \
  --sku Standard_LRS

# Get the storage account key
ACCOUNT_KEY=$(az storage account keys list \
  --account-name myalchemystate \
  --resource-group my-resource-group \
  --query "[0].value" \
  --output tsv)

# Create the container
az storage container create \
  --name alchemy-state \
  --account-name myalchemystate \
  --account-key "$ACCOUNT_KEY"
```

### Configure Credentials

Set Azure Storage credentials via environment variables:

```bash
export AZURE_STORAGE_ACCOUNT=myalchemystate
export AZURE_STORAGE_KEY=your-account-key-here
```

Or provide them directly in the BlobStateStore configuration:

```ts
const app = await alchemy("my-app", {
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: "myalchemystate",
    accountKey: "your-account-key-here"
  })
});
```

## State Organization

BlobStateStore organizes state files using scope-based prefixes:

```
alchemy-state (container)
  alchemy/my-app/dev/
    my-resource
    my-other-resource
  alchemy/my-app/prod/
    my-resource
    my-other-resource
```

Keys containing forward slashes are converted to colons for consistency:

- Resource key: `api/database/connection`
- Blob name: `alchemy/my-app/dev/api:database:connection`

## Environment-Specific Configuration

### Development

Use environment-specific containers or prefixes:

```ts
const isDev = process.env.NODE_ENV === "development";

const app = await alchemy("my-app", {
  stage: isDev ? "dev" : "prod",
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: process.env.AZURE_STORAGE_ACCOUNT!,
    accountKey: process.env.AZURE_STORAGE_KEY!,
    containerName: isDev ? "alchemy-dev-state" : "alchemy-prod-state"
  })
});
```

### Team Environments

Share state across team members with appropriate access controls:

```ts
const app = await alchemy("my-app", {
  stage: "shared",
  stateStore: (scope) => new BlobStateStore(scope, {
    accountName: "teamsharedalchemy",
    accountKey: process.env.AZURE_STORAGE_KEY!,
    containerName: "team-state",
    prefix: `${process.env.USER || "unknown"}/`
  })
});
```

## GitHub Actions Integration

Use BlobStateStore in CI/CD pipelines:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      
      - name: Deploy Infrastructure
        run: bun run deploy
        env:
          AZURE_STORAGE_ACCOUNT: ${{ secrets.AZURE_STORAGE_ACCOUNT }}
          AZURE_STORAGE_KEY: ${{ secrets.AZURE_STORAGE_KEY }}
          ALCHEMY_PASSWORD: ${{ secrets.ALCHEMY_PASSWORD }}
```

## Error Handling

BlobStateStore includes built-in error handling:

- **Missing container**: Clear error message if container doesn't exist
- **Missing account credentials**: Clear error message with setup instructions
- **Missing blobs**: Gracefully handles missing state files
- **Network errors**: Proper error propagation with detailed messages
- **Permissions**: Clear Azure permission error messages

## Performance Considerations

- **Strong consistency**: Azure Blob Storage provides strong consistency for state operations
- **Batch operations**: Uses concurrent requests for multi-key operations
- **Network latency**: Consider storage account region proximity to your deployment location
- **Costs**: Azure Blob Storage charges for requests and storage (typically very low for state files)
- **Redundancy**: Supports LRS, GRS, and other redundancy options via storage account configuration

## Security Best Practices

### Use Shared Access Signatures (SAS)

For production environments, consider using SAS tokens instead of account keys:

```ts
// Note: BlobStateStore currently requires account keys
// SAS token support may be added in future versions
```

### Rotate Keys Regularly

Azure Storage accounts support dual keys for zero-downtime rotation:

1. Generate new secondary key
2. Update applications to use secondary key
3. Regenerate primary key
4. Update applications back to primary key

### Network Security

Configure firewall rules to restrict access to your storage account:

```bash
# Allow only specific IP ranges
az storage account network-rule add \
  --account-name myalchemystate \
  --ip-address "203.0.113.0/24"
```

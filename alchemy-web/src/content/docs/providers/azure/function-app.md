---
title: FunctionApp
description: Azure Function App - serverless compute platform for event-driven functions
---

# FunctionApp

Azure Functions is a serverless compute service that lets you run event-driven code without managing infrastructure. It's equivalent to AWS Lambda and Cloudflare Workers.

Key features:
- **Pay-per-execution** pricing with Consumption plan
- **Automatic scaling** based on demand
- **Multiple runtimes** (Node.js, Python, .NET, Java, PowerShell)
- **Built-in triggers** (HTTP, Timer, Queue, Blob, Event Grid, etc.)
- **Durable Functions** for stateful workflows
- **Managed identity** integration for secure access
- **Deployment slots** for staging and blue-green deployments

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the function app. Must be 2-60 characters, lowercase letters, numbers, and hyphens only. Must be globally unique (creates `{name}.azurewebsites.net`). Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this function app in |
| `location` | `string` | No | Azure region for the function app. Defaults to the resource group's location |
| `storageAccount` | `string \| StorageAccount` | Yes | Storage account for function storage (required for triggers, logging, and internal state) |
| `sku` | `string` | No | The pricing tier. Options: `Y1` (Consumption), `EP1-EP3` (Elastic Premium), `B1-B3` (Basic), `S1-S3` (Standard), `P1V2-P3V2` (Premium V2). Defaults to `Y1` |
| `runtime` | `string` | No | The runtime stack. Options: `node`, `python`, `dotnet`, `java`, `powershell`, `custom`. Defaults to `node` |
| `runtimeVersion` | `string` | No | Runtime version (e.g., `"18"`, `"20"` for Node.js, `"3.9"`, `"3.11"` for Python). Defaults to `"20"` for Node.js |
| `functionsVersion` | `string` | No | Azure Functions runtime version. Options: `~4`, `~3`, `~2`. Defaults to `~4` |
| `identity` | `UserAssignedIdentity` | No | User-assigned managed identity for secure access to Azure resources |
| `appSettings` | `Record<string, string \| Secret>` | No | Application settings (environment variables) |
| `httpsOnly` | `boolean` | No | Enable HTTPS only (redirect HTTP to HTTPS). Defaults to `true` |
| `alwaysOn` | `boolean` | No | Keep the app loaded even when idle (only available on non-Consumption plans). Defaults to `false` |
| `tags` | `Record<string, string>` | No | Tags to apply to the function app |
| `adopt` | `boolean` | No | Whether to adopt an existing function app. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the function app when removed from Alchemy. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `storageAccount` | `string` | The storage account name used by this function app |
| `defaultHostname` | `string` | The default hostname (e.g., `my-function-app.azurewebsites.net`) |
| `url` | `string` | The function app URL (e.g., `https://my-function-app.azurewebsites.net`) |
| `outboundIpAddresses` | `string` | The outbound IP addresses |
| `possibleOutboundIpAddresses` | `string` | The possible outbound IP addresses |
| `type` | `"azure::FunctionApp"` | Resource type identifier |

## Usage

### Basic Function App

Create a Node.js function app on the Consumption plan:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, StorageAccount, FunctionApp } from "alchemy/azure";

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

const functionApp = await FunctionApp("api", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node",
  runtimeVersion: "20"
});

console.log(`Function App URL: ${functionApp.url}`);

await app.finalize();
```

### Function App with Managed Identity

Use managed identity to securely access other Azure resources without secrets:

```typescript
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
});

const functionApp = await FunctionApp("secure-api", {
  resourceGroup: rg,
  storageAccount: storage,
  identity: identity,
  runtime: "node",
  runtimeVersion: "20"
});

// The function app can now access other Azure resources using the managed identity
// without storing connection strings or keys
```

### Function App with App Settings

Configure environment variables and secrets:

```typescript
const functionApp = await FunctionApp("configured-api", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node",
  appSettings: {
    NODE_ENV: "production",
    API_KEY: alchemy.secret.env.API_KEY,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL,
    CUSTOM_SETTING: "value"
  }
});

// App settings are available as environment variables in your functions
// Secrets are encrypted in the Alchemy state file
```

### Premium Function App

Use Premium plan for VNet integration, longer execution time, and better performance:

```typescript
const functionApp = await FunctionApp("premium-api", {
  resourceGroup: rg,
  storageAccount: storage,
  sku: "EP1", // Elastic Premium
  runtime: "node",
  runtimeVersion: "20",
  alwaysOn: true // Keep functions warm
});

// Premium plan benefits:
// - No cold starts with Always On
// - VNet integration for private connections
// - Up to 60 minute execution timeout
// - Better performance and more resources
```

### Python Function App

Create a Python-based function app:

```typescript
const pythonApp = await FunctionApp("python-api", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "python",
  runtimeVersion: "3.11",
  functionsVersion: "~4"
});
```

### .NET Function App

Create a .NET function app:

```typescript
const dotnetApp = await FunctionApp("dotnet-api", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "dotnet",
  runtimeVersion: "8.0"
});
```

### Multi-Region Function App

Deploy function apps across multiple regions for high availability:

```typescript
const eastRg = await ResourceGroup("east", { location: "eastus" });
const westRg = await ResourceGroup("west", { location: "westus" });

const eastStorage = await StorageAccount("east-storage", {
  resourceGroup: eastRg,
  sku: "Standard_LRS"
});

const westStorage = await StorageAccount("west-storage", {
  resourceGroup: westRg,
  sku: "Standard_LRS"
});

const eastApi = await FunctionApp("east-api", {
  resourceGroup: eastRg,
  storageAccount: eastStorage,
  runtime: "node"
});

const westApi = await FunctionApp("west-api", {
  resourceGroup: westRg,
  storageAccount: westStorage,
  runtime: "node"
});

// Use Azure Front Door or Traffic Manager to distribute traffic
```

### Adopt Existing Function App

Adopt and manage an existing function app:

```typescript
const existingApp = await FunctionApp("existing-api", {
  name: "my-existing-function-app",
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node",
  adopt: true
});

// The function app is now managed by Alchemy
// You can update settings, app settings, etc.
```

## Pricing Tiers

| SKU | Type | Description | Use Case |
|-----|------|-------------|----------|
| `Y1` | Consumption | Pay per execution | Development, low-traffic apps, event-driven workloads |
| `EP1-EP3` | Elastic Premium | Premium features with elastic scaling | Production apps needing VNet, longer timeout, no cold starts |
| `B1-B3` | Basic | Dedicated instances, basic features | Always-on apps with predictable traffic |
| `S1-S3` | Standard | Dedicated instances, standard features | Production apps with custom domains and scaling |
| `P1V2-P3V2` | Premium V2 | High-performance dedicated instances | High-traffic production apps |

## Runtime Versions

### Node.js
- `18`: Node.js 18 LTS
- `20`: Node.js 20 LTS (recommended)

### Python
- `3.9`: Python 3.9
- `3.10`: Python 3.10
- `3.11`: Python 3.11 (recommended)

### .NET
- `6.0`: .NET 6 LTS
- `8.0`: .NET 8 LTS (recommended)

### Java
- `11`: Java 11 LTS
- `17`: Java 17 LTS
- `21`: Java 21 LTS

## Important Notes

### Global Naming

Function app names must be globally unique across all of Azure because they create a `{name}.azurewebsites.net` subdomain.

### Storage Account Requirement

Every function app requires a storage account for:
- Triggers and bindings state
- Function execution history
- Logging and diagnostics
- Internal coordination

### Immutable Properties

The following properties cannot be changed after creation:
- `name` - changing the name creates a new function app
- `location` - changing the location creates a new function app

### Always On

The `alwaysOn` property is only available on non-Consumption plans. It keeps your functions loaded even when idle, preventing cold starts.

### HTTPS Only

By default, function apps redirect HTTP traffic to HTTPS (`httpsOnly: true`). This is a security best practice.

## Common Patterns

### Background Processing

Use queue-triggered functions for async background processing:

```typescript
const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  sku: "Standard_LRS"
});

const functionApp = await FunctionApp("worker", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node",
  appSettings: {
    QUEUE_CONNECTION: storage.primaryConnectionString
  }
});

// In your function code:
// - Create a queue-triggered function
// - Process messages from Azure Storage Queue
```

### Scheduled Tasks

Use timer-triggered functions for cron jobs:

```typescript
const functionApp = await FunctionApp("scheduler", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node"
});

// In your function code:
// - Create a timer-triggered function
// - Use cron expressions: "0 */5 * * * *" (every 5 minutes)
```

### API Backend

Use HTTP-triggered functions for REST APIs:

```typescript
const api = await FunctionApp("api", {
  resourceGroup: rg,
  storageAccount: storage,
  runtime: "node",
  sku: "EP1", // Premium for better performance
  alwaysOn: true
});

// In your function code:
// - Create HTTP-triggered functions
// - Return JSON responses
// - Use function.json for routing
```

## Related Resources

- [ResourceGroup](./resource-group) - Logical container for Azure resources
- [StorageAccount](./storage-account) - Required storage for function apps
- [UserAssignedIdentity](./user-assigned-identity) - Managed identity for secure access
- [BlobContainer](./blob-container) - Blob storage for function triggers

## Official Documentation

- [Azure Functions Overview](https://docs.microsoft.com/azure/azure-functions/functions-overview)
- [Azure Functions Runtime Versions](https://docs.microsoft.com/azure/azure-functions/functions-versions)
- [Azure Functions Triggers and Bindings](https://docs.microsoft.com/azure/azure-functions/functions-triggers-bindings)
- [Azure Functions Best Practices](https://docs.microsoft.com/azure/azure-functions/functions-best-practices)
- [Durable Functions](https://docs.microsoft.com/azure/azure-functions/durable/durable-functions-overview)

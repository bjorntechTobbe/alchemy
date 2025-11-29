---
title: AppService
description: Azure App Service - PaaS web hosting for containers and code
---

# AppService

Azure App Service is a fully managed platform for building, deploying, and scaling web apps. It's equivalent to AWS Elastic Beanstalk and supports multiple languages and frameworks without managing infrastructure.

Key features:
- **Fully managed** - no server management required
- **Multiple runtimes** - Node.js, Python, .NET, Java, PHP, Ruby
- **Built-in autoscaling** based on demand
- **Deployment slots** for staging and blue-green deployments
- **CI/CD integration** with Azure DevOps and GitHub Actions
- **Custom domains** and SSL certificates
- **VNet integration** for private connectivity

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the app service. Must be 2-60 characters, alphanumeric and hyphens only. Must be globally unique (creates `{name}.azurewebsites.net`). Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this app service in |
| `location` | `string` | No | Azure region for the app service. Defaults to the resource group's location |
| `sku` | `string` | No | The pricing tier. Options: `F1` (Free), `D1` (Shared), `B1-B3` (Basic), `S1-S3` (Standard), `P1V2-P3V2` (Premium V2), `P1V3-P3V3` (Premium V3). Defaults to `B1` |
| `runtime` | `string` | No | The runtime stack. Options: `node`, `python`, `dotnet`, `java`, `php`, `ruby`. Defaults to `node` |
| `runtimeVersion` | `string` | No | Runtime version (e.g., `"18"`, `"20"` for Node.js, `"3.9"`, `"3.11"` for Python). Defaults to `"20"` for Node.js |
| `os` | `string` | No | Operating system. Options: `linux`, `windows`. Defaults to `linux` |
| `identity` | `UserAssignedIdentity` | No | User-assigned managed identity for secure access to Azure resources |
| `appSettings` | `Record<string, string \| Secret>` | No | Application settings (environment variables) |
| `httpsOnly` | `boolean` | No | Enable HTTPS only (redirect HTTP to HTTPS). Defaults to `true` |
| `alwaysOn` | `boolean` | No | Keep the app loaded even when idle (not available on Free tier). Defaults to `true` |
| `localMySqlEnabled` | `boolean` | No | Enable local MySQL in-app database (Windows only). Defaults to `false` |
| `ftpsState` | `string` | No | FTP deployment state. Options: `AllAllowed`, `FtpsOnly`, `Disabled`. Defaults to `Disabled` |
| `minTlsVersion` | `string` | No | Minimum TLS version. Options: `1.0`, `1.1`, `1.2`, `1.3`. Defaults to `1.2` |
| `tags` | `Record<string, string>` | No | Tags to apply to the app service |
| `adopt` | `boolean` | No | Whether to adopt an existing app service. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the app service when removed from Alchemy. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `defaultHostname` | `string` | The default hostname (e.g., `my-app-service.azurewebsites.net`) |
| `url` | `string` | The app service URL (e.g., `https://my-app-service.azurewebsites.net`) |
| `outboundIpAddresses` | `string` | The outbound IP addresses |
| `possibleOutboundIpAddresses` | `string` | The possible outbound IP addresses |
| `type` | `"azure::AppService"` | Resource type identifier |

## Usage

### Basic App Service

Create a Node.js app service on Linux:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, AppService } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

const appService = await AppService("web", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  sku: "B1"
});

console.log(`App Service URL: ${appService.url}`);

await app.finalize();
```

### App Service with Managed Identity

Use managed identity to securely access other Azure resources:

```typescript
const identity = await UserAssignedIdentity("app-identity", {
  resourceGroup: rg
});

const appService = await AppService("secure-web", {
  resourceGroup: rg,
  runtime: "node",
  identity: identity,
  sku: "S1"
});

// The app service can now access other Azure resources
// without storing connection strings or keys
```

### App Service with App Settings

Configure environment variables and secrets:

```typescript
const appService = await AppService("configured-web", {
  resourceGroup: rg,
  runtime: "node",
  sku: "B1",
  appSettings: {
    NODE_ENV: "production",
    DATABASE_URL: alchemy.secret.env.DATABASE_URL,
    API_KEY: alchemy.secret.env.API_KEY,
    CUSTOM_SETTING: "value"
  }
});

// App settings are available as environment variables
// Secrets are encrypted in the Alchemy state file
```

### Python App Service

Create a Python web application:

```typescript
const pythonApp = await AppService("python-web", {
  resourceGroup: rg,
  runtime: "python",
  runtimeVersion: "3.11",
  os: "linux",
  sku: "B1"
});

// Deploy Flask, Django, FastAPI, or any Python web framework
```

### .NET App Service

Create a .NET web application:

```typescript
const dotnetApp = await AppService("dotnet-web", {
  resourceGroup: rg,
  runtime: "dotnet",
  runtimeVersion: "8.0",
  os: "linux",
  sku: "B1"
});

// Deploy ASP.NET Core applications
```

### Premium App Service

Use Premium tier for production workloads:

```typescript
const premiumApp = await AppService("prod-web", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  sku: "P1V3", // Premium V3
  alwaysOn: true,
  httpsOnly: true,
  minTlsVersion: "1.3"
});

// Premium features:
// - VNet integration
// - Better performance
// - More memory and CPU
// - Advanced scaling options
```

### Windows App Service

Create a Windows-based app service:

```typescript
const windowsApp = await AppService("windows-web", {
  resourceGroup: rg,
  runtime: "dotnet",
  runtimeVersion: "8.0",
  os: "windows",
  sku: "B1",
  localMySqlEnabled: true // Windows-only feature
});
```

### Multi-Region Deployment

Deploy app services across multiple regions:

```typescript
const eastRg = await ResourceGroup("east", { location: "eastus" });
const westRg = await ResourceGroup("west", { location: "westus" });

const eastApp = await AppService("east-web", {
  resourceGroup: eastRg,
  runtime: "node",
  sku: "S1"
});

const westApp = await AppService("west-web", {
  resourceGroup: westRg,
  runtime: "node",
  sku: "S1"
});

// Use Azure Traffic Manager or Front Door to distribute traffic
```

### Adopt Existing App Service

Adopt and manage an existing app service:

```typescript
const existingApp = await AppService("existing-web", {
  name: "my-existing-app-service",
  resourceGroup: rg,
  runtime: "node",
  sku: "B1",
  adopt: true
});

// The app service is now managed by Alchemy
```

## Pricing Tiers

| Tier | Type | Features | Use Case |
|------|------|----------|----------|
| **F1** | Free | 1GB disk, 60 CPU mins/day, no Always On | Development, testing |
| **D1** | Shared | 1GB disk, 240 CPU mins/day, no Always On | Small personal projects |
| **B1-B3** | Basic | Dedicated instances, custom domains, SSL | Small production apps |
| **S1-S3** | Standard | Autoscaling, staging slots, daily backups | Production apps |
| **P1V2-P3V2** | Premium V2 | Better performance, VNet integration | High-traffic production |
| **P1V3-P3V3** | Premium V3 | Latest hardware, best performance | Enterprise apps |

## Runtime Versions

### Node.js (Linux)
- `18`: Node.js 18 LTS
- `20`: Node.js 20 LTS (recommended)

### Python (Linux)
- `3.9`: Python 3.9
- `3.10`: Python 3.10
- `3.11`: Python 3.11 (recommended)
- `3.12`: Python 3.12

### .NET (Linux/Windows)
- `6.0`: .NET 6 LTS
- `8.0`: .NET 8 LTS (recommended)

### Java (Linux)
- `11`: Java 11 LTS
- `17`: Java 17 LTS
- `21`: Java 21 LTS

### PHP (Linux)
- `8.0`: PHP 8.0
- `8.1`: PHP 8.1
- `8.2`: PHP 8.2

## Important Notes

### Global Naming

App service names must be globally unique across all of Azure because they create a `{name}.azurewebsites.net` subdomain.

### Immutable Properties

The following properties cannot be changed after creation:
- `name` - changing the name creates a new app service
- `location` - changing the location creates a new app service

### Always On

The `alwaysOn` property keeps your app loaded even when idle, preventing cold starts. It's:
- **Not available** on Free (F1) tier
- **Recommended** for production apps
- **Default**: `true` (except on Free tier)

### HTTPS Only

By default, app services redirect HTTP traffic to HTTPS (`httpsOnly: true`). This is a security best practice and recommended for all production apps.

### Operating System

- **Linux**: More cost-effective, supports containers, better for Node.js/Python
- **Windows**: Required for .NET Framework, supports in-app MySQL

## Common Patterns

### Express.js API

```typescript
const api = await AppService("express-api", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  sku: "B1",
  appSettings: {
    NODE_ENV: "production",
    PORT: "8080"
  }
});

// Deploy Express.js app
// App listens on process.env.PORT
```

### Django Application

```typescript
const djangoApp = await AppService("django-app", {
  resourceGroup: rg,
  runtime: "python",
  runtimeVersion: "3.11",
  os: "linux",
  sku: "B1",
  appSettings: {
    DJANGO_SETTINGS_MODULE: "myproject.settings",
    SECRET_KEY: alchemy.secret.env.DJANGO_SECRET_KEY
  }
});
```

### ASP.NET Core Web App

```typescript
const aspnetApp = await AppService("aspnet-web", {
  resourceGroup: rg,
  runtime: "dotnet",
  runtimeVersion: "8.0",
  os: "linux",
  sku: "S1",
  alwaysOn: true
});
```

### Container Deployment

```typescript
const containerApp = await AppService("container-web", {
  resourceGroup: rg,
  runtime: "node", // Base runtime
  os: "linux",
  sku: "B1"
});

// Configure container settings separately
// Or use Azure Container Apps for better container support
```

## Deployment

Deploy your application using:
- **Azure CLI**: `az webapp up`
- **GitHub Actions**: Built-in deployment workflow
- **Azure DevOps**: Azure Pipelines
- **FTP/FTPS**: Direct file upload (if enabled)
- **Local Git**: Push to Azure remote
- **ZIP Deploy**: Upload zip file

## Related Resources

- [ResourceGroup](./resource-group) - Logical container for Azure resources
- [UserAssignedIdentity](./user-assigned-identity) - Managed identity for secure access
- [FunctionApp](./function-app) - Serverless alternative for event-driven workloads
- [StaticWebApp](./static-web-app) - Static site hosting alternative

## Official Documentation

- [Azure App Service Overview](https://docs.microsoft.com/azure/app-service/overview)
- [Configure Runtime](https://docs.microsoft.com/azure/app-service/configure-language-nodejs)
- [Configure App Settings](https://docs.microsoft.com/azure/app-service/configure-common)
- [Deployment Best Practices](https://docs.microsoft.com/azure/app-service/deploy-best-practices)
- [Scaling](https://docs.microsoft.com/azure/app-service/manage-scale-up)

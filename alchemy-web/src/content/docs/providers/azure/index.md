---
title: Azure Provider
description: Deploy and manage Azure resources using Alchemy
---

The Azure provider enables you to create and manage Microsoft Azure resources using TypeScript-native Infrastructure as Code. Deploy everything from serverless functions to databases, storage, and networking resources using the familiar Alchemy Resource syntax.

## Resources

The Azure provider includes the following resources:

### Infrastructure
- [ResourceGroup](/providers/azure/resource-group/) - Logical container for Azure resources
- [UserAssignedIdentity](/providers/azure/user-assigned-identity/) - Managed identity for secure resource authentication

### Storage
- [StorageAccount](/providers/azure/storage-account/) - Foundation for blob, file, queue, and table storage
- [BlobContainer](/providers/azure/blob-container/) - Object storage container (S3/R2 equivalent)

### Compute
- [FunctionApp](/providers/azure/function-app/) - Serverless compute platform (Lambda/Workers equivalent)
- [StaticWebApp](/providers/azure/static-web-app/) - Static site hosting with CI/CD (Pages equivalent)
- [AppService](/providers/azure/app-service/) - PaaS web hosting for containers and code

### Networking
- [VirtualNetwork](/providers/azure/virtual-network/) - Isolated network environments (VPC equivalent)
- [NetworkSecurityGroup](/providers/azure/network-security-group/) - Firewall rules for network traffic
- [PublicIPAddress](/providers/azure/public-ip-address/) - Static and dynamic public IP addresses

### Databases
- [CosmosDBAccount](/providers/azure/cosmosdb-account/) - Multi-model NoSQL database (DynamoDB equivalent)
- [SqlServer](/providers/azure/sql-server/) - Managed SQL Server instance
- [SqlDatabase](/providers/azure/sql-database/) - SQL databases on SQL Server

### Security
- [KeyVault](/providers/azure/key-vault/) - Secrets and key management service

### Containers & Messaging
- [ContainerInstance](/providers/azure/container-instance/) - Serverless container hosting (Fargate equivalent)
- [ServiceBus](/providers/azure/service-bus/) - Enterprise messaging service (SQS/SNS equivalent)

### AI & Content Delivery
- [CognitiveServices](/providers/azure/cognitive-services/) - AI and ML services (vision, language, speech)
- [CDNProfile](/providers/azure/cdn-profile/) - Content delivery network profile
- [CDNEndpoint](/providers/azure/cdn-endpoint/) - CDN endpoint configuration

### State Management
- [BlobStateStore](/providers/azure/blob-state-store/) - Store Alchemy state in Azure Blob Storage

## Example

Here's a complete example of deploying a serverless API with storage to Azure:

```typescript
import { alchemy } from "alchemy";
import * as azure from "alchemy/azure";

const app = await alchemy("my-azure-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    tenantId: alchemy.secret.env.AZURE_TENANT_ID,
    clientId: alchemy.secret.env.AZURE_CLIENT_ID,
    clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET,
  }
});

// Create a resource group in East US
const rg = await azure.ResourceGroup("my-rg", {
  location: "eastus",
  tags: {
    environment: "production",
    project: "my-app"
  }
});

// Create a managed identity for secure access
const identity = await azure.UserAssignedIdentity("api-identity", {
  resourceGroup: rg,
  location: "eastus"
});

// Create storage for application data
const storage = await azure.StorageAccount("storage", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard_LRS",
  tier: "Hot"
});

// Create a blob container for uploads
const uploads = await azure.BlobContainer("uploads", {
  resourceGroup: rg,
  storageAccount: storage,
  publicAccess: "none"
});

// Create a serverless API
const api = await azure.FunctionApp("api", {
  resourceGroup: rg,
  location: "eastus",
  runtime: "node",
  runtimeVersion: "20",
  identity: identity,
  appSettings: {
    STORAGE_CONNECTION_STRING: storage.connectionString,
    UPLOAD_CONTAINER: uploads.name
  }
});

console.log(`API URL: ${api.url}`);
console.log(`Storage Account: ${storage.name}`);
console.log(`Identity Principal ID: ${identity.principalId}`);

await app.finalize();
```

## Multi-Tier Application Example

Deploy a complete web application with database, storage, and networking:

```typescript
import * as azure from "alchemy/azure";

// Resource group
const rg = await azure.ResourceGroup("app-rg", {
  location: "eastus"
});

// Virtual network for secure communication
const vnet = await azure.VirtualNetwork("app-vnet", {
  resourceGroup: rg,
  location: "eastus",
  addressSpaces: ["10.0.0.0/16"],
  subnets: [
    { name: "web", addressPrefix: "10.0.1.0/24" },
    { name: "api", addressPrefix: "10.0.2.0/24" },
    { name: "data", addressPrefix: "10.0.3.0/24" }
  ]
});

// Network security group for web tier
const webNsg = await azure.NetworkSecurityGroup("web-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-https",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourcePortRange: "*",
      destinationPortRange: "443",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*"
    }
  ]
});

// Cosmos DB for application data
const cosmosDb = await azure.CosmosDBAccount("app-db", {
  resourceGroup: rg,
  location: "eastus",
  api: "Sql",
  consistencyLevel: "Session"
});

// Storage for static assets
const staticStorage = await azure.StorageAccount("static", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard_LRS"
});

const assets = await azure.BlobContainer("assets", {
  resourceGroup: rg,
  storageAccount: staticStorage,
  publicAccess: "blob"
});

// Static web app for frontend
const web = await azure.StaticWebApp("web", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  appSettings: {
    API_ENDPOINT: api.url,
    COSMOS_ENDPOINT: cosmosDb.endpoint
  }
});

// Function app for API
const api = await azure.FunctionApp("api", {
  resourceGroup: rg,
  location: "eastus",
  runtime: "node",
  runtimeVersion: "20",
  appSettings: {
    COSMOS_ENDPOINT: cosmosDb.endpoint,
    COSMOS_KEY: cosmosDb.primaryKey,
    STORAGE_CONNECTION: staticStorage.connectionString
  }
});

console.log(`Web App: ${web.url}`);
console.log(`API: ${api.url}`);
console.log(`Database: ${cosmosDb.name}`);
```

## Getting Started

For a step-by-step guide on deploying your first Azure application with Alchemy, see the [Azure Getting Started Guide](/guides/azure/).

## Additional Resources

- [Azure Example Projects](https://github.com/alchemy-run/alchemy/tree/main/examples) - Complete working examples
- [Azure Documentation](https://docs.microsoft.com/azure) - Official Azure documentation
- [Azure Portal](https://portal.azure.com) - Azure management console

# Azure Provider Enhancement Plan

This document outlines the plan for adding Azure support to Alchemy following the established provider conventions and patterns.

## Overview

Azure support will enable Alchemy users to provision and manage Azure resources using the same TypeScript-native Infrastructure-as-Code patterns used for Cloudflare and AWS providers.

## Provider Structure

Following the established provider pattern, the Azure provider will be organized as follows:

```
alchemy/
  src/
    azure/
      README.md
      resource-group.ts
      storage-account.ts
      blob-container.ts
      function-app.ts
      app-service.ts
      cosmos-db.ts
      sql-database.ts
      key-vault.ts
      container-instance.ts
      static-web-app.ts
      service-bus.ts
      cognitive-services.ts
      cdn.ts
  test/
    azure/
      resource-group.test.ts
      storage-account.test.ts
      blob-container.test.ts
      function-app.test.ts
      app-service.test.ts
      cosmos-db.test.ts
      sql-database.test.ts
      key-vault.test.ts
      container-instance.test.ts
      static-web-app.test.ts
      service-bus.test.ts
      cognitive-services.test.ts
      cdn.test.ts
alchemy-web/
  guides/
    azure.md
    azure-static-web-app.md
    azure-functions.md
  docs/
    providers/
      azure/
        index.md
        resource-group.md
        storage-account.md
        blob-container.md
        function-app.md
        app-service.md
        cosmos-db.md
        sql-database.md
        key-vault.md
        container-instance.md
        static-web-app.md
        service-bus.md
        cognitive-services.md
        cdn.md
examples/
  azure-function/
    src/
    package.json
    tsconfig.json
    alchemy.run.ts
    README.md
  azure-static-web-app/
    src/
    package.json
    tsconfig.json
    alchemy.run.ts
    README.md
  azure-container/
    src/
    package.json
    tsconfig.json
    alchemy.run.ts
    README.md
```

## Priority Resources

Resources are organized by implementation priority based on common use cases and parity with existing providers.

### Tier 1: Core Compute & Storage

These are the foundational resources that should be implemented first:

#### ResourceGroup
- **Purpose**: Azure's organizational unit for grouping related resources
- **Unique to Azure**: All Azure resources must belong to a resource group
- **Priority**: **HIGHEST** - Required before any other resources can be created

#### UserAssignedIdentity
- **Purpose**: Identity for secure resource-to-resource communication without secrets
- **Equivalent**: AWS IAM Role
- **Priority**: **HIGHEST** - Critical for secure "cloud-native" connectivity (connecting Compute to Storage/DBs)

#### StorageAccount
- **Purpose**: Foundation for blob storage, file shares, queues, and tables
- **Equivalent**: AWS S3 Account-level settings
- **Priority**: **HIGH** - Required for BlobContainer

#### BlobContainer
- **Purpose**: Object storage container
- **Equivalent**: Cloudflare R2 Bucket, AWS S3 Bucket
- **Priority**: **HIGH** - Core storage primitive

#### FunctionApp
- **Purpose**: Serverless compute platform
- **Equivalent**: Cloudflare Workers, AWS Lambda
- **Priority**: **HIGH** - Core compute primitive

#### StaticWebApp
- **Purpose**: Static site hosting with built-in CI/CD
- **Equivalent**: Cloudflare Pages, AWS Amplify
- **Priority**: **HIGH** - Common deployment scenario

### Tier 2: Databases & Services

These resources provide database and managed service capabilities:

#### CosmosDB
- **Purpose**: Multi-model NoSQL database
- **Equivalent**: AWS DynamoDB, Cloudflare D1 (but more powerful)
- **Priority**: **MEDIUM** - Popular database option

#### SqlDatabase
- **Purpose**: Managed relational database (SQL Server)
- **Equivalent**: AWS RDS, Neon Postgres
- **Priority**: **MEDIUM** - Enterprise standard

#### KeyVault
- **Purpose**: Secrets and key management service
- **Equivalent**: AWS Secrets Manager, Cloudflare environment variables
- **Priority**: **MEDIUM** - Security best practice

#### AppService
- **Purpose**: PaaS web hosting for containers and code
- **Equivalent**: AWS Elastic Beanstalk, Heroku
- **Priority**: **MEDIUM** - Alternative to FunctionApp

### Tier 3: Advanced Services

These resources provide specialized capabilities:

#### ContainerInstance
- **Purpose**: Run containers without orchestration
- **Equivalent**: Cloudflare Container, AWS ECS Fargate
- **Priority**: **LOW** - Advanced use case

#### ServiceBus
- **Purpose**: Enterprise messaging service
- **Equivalent**: AWS SQS/SNS, Cloudflare Queues
- **Priority**: **LOW** - Enterprise scenarios

#### CognitiveServices
- **Purpose**: AI/ML services (vision, language, speech)
- **Unique to Azure**: Differentiated offering
- **Priority**: **LOW** - Specialized use case

#### CDN
- **Purpose**: Content delivery network
- **Equivalent**: Cloudflare CDN, AWS CloudFront
- **Priority**: **LOW** - Often handled by Cloudflare

## Azure-Specific Patterns

### Resource Group Dependency

Unlike other providers, Azure requires all resources to belong to a Resource Group. This should be handled in two ways:

```ts
// Pattern 1: Explicit resource group reference
const rg = await ResourceGroup("my-rg", {
  name: "my-resource-group",
  location: "eastus"
});

const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  location: "eastus"
});

// Pattern 2: Reference by name (for adopting existing resources)
const storage = await StorageAccount("storage", {
  resourceGroup: "existing-resource-group",
  location: "eastus"
});
```

Many Azure resource props can extend a shared base interface to avoid duplication:

```ts
export interface AzureResourceProps {
  /**
   * The resource group to create this resource in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;
  
  /**
   * Azure region for this resource
   * @default Inherited from resource group if not specified
   */
  location?: string;
}
```

All Azure resource props should follow the `string | Resource` lifting pattern from AGENTS.md (for example, `resourceGroup: string | ResourceGroup`) so external Azure resources can be referenced either by name or via Alchemy resources.

### Authentication Pattern

Azure uses service principals or managed identities for authentication:

```ts
// In alchemy.run.ts
const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
    tenantId: alchemy.secret.env.AZURE_TENANT_ID,
    clientId: alchemy.secret.env.AZURE_CLIENT_ID,
    clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET,
  }
});
```

Alternatively, support Azure CLI credentials:

```ts
const app = await alchemy("my-app", {
  azure: {
    useAzureCLI: true, // Use `az login` credentials
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
  }
});
```

### Naming Conventions

Azure has stricter naming rules than other providers:

- Storage account names: 3-24 characters, lowercase letters and numbers only
- Resource names: Vary by resource type
- Global uniqueness: Some resources (like storage accounts) must be globally unique
- **Recommendation**: Create physical name logic that is highly configurable per resource type.

The implementation should handle this:

```ts
const name = props.name 
  ?? this.output?.name 
  ?? this.scope.createPhysicalName(id, {
    maxLength: 24,
    lowercase: true,
    allowedChars: /^[a-z0-9]+$/,
  });
```

### Long-Running Operations (LROs)

Azure management APIs frequently return `202 Accepted` with a `Location` header for asynchronous operations. 
**Crucial**: Prefer the official Azure SDK (which handles polling automatically via `beginCreateOrUpdateAndWait`) or a shared Azure API helper, rather than calling `fetch` directly from resource implementations.

### Resource Deletion

Deleting a Resource Group deletes everything inside it asynchronously. If Alchemy deletes a Resource Group, it must wait for completion to avoid "ResourceGroupBeingDeleted" errors on subsequent re-creations. The SDK handles this waiting better than raw REST.

## Example Resource Implementation

Here's a complete example of implementing the BlobContainer resource:

```ts
// alchemy/src/azure/blob-container.ts
import { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { StorageAccount } from "./storage-account.ts";

export interface BlobContainerProps {
  /**
   * Name of the blob container
   * Must be lowercase, 3-63 characters, letters, numbers, and hyphens
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this container in
   */
  resourceGroup: string | ResourceGroup;

  /**
   * The storage account to create this container in
   */
  storageAccount: string | StorageAccount;

  /**
   * Public access level for the container
   * @default "none"
   */
  publicAccess?: "blob" | "container" | "none";

  /**
   * Metadata tags for the container
   */
  metadata?: Record<string, string>;

  /**
   * Whether to delete the container when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Whether to adopt an existing container
   * @default false
   */
  adopt?: boolean;

  /**
   * Internal container ID for lifecycle management
   * @internal
   */
  containerId?: string;
}

export type BlobContainer = Omit<BlobContainerProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The container name
   */
  name: string;

  /**
   * The full container URL
   */
  url: string;

  /**
   * The Azure resource ID
   */
  containerId: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::BlobContainer";
};

/**
 * Azure Blob Storage container for storing unstructured data
 *
 * @example
 * ## Basic Blob Container
 *
 * Create a private blob container for storing application data:
 *
 * ```ts
 * const rg = await ResourceGroup("my-rg", {
 *   location: "eastus"
 * });
 *
 * const storage = await StorageAccount("storage", {
 *   resourceGroup: rg,
 *   location: "eastus"
 * });
 *
 * const container = await BlobContainer("uploads", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   publicAccess: "none"
 * });
 * ```
 *
 * @example
 * ## Public Blob Container
 *
 * Create a container with public read access for static assets:
 *
 * ```ts
 * const assets = await BlobContainer("assets", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 *   publicAccess: "blob",
 *   metadata: {
 *     purpose: "static-assets",
 *     environment: "production"
 *   }
 * });
 * ```
 */
export const BlobContainer = Resource(
  "azure::BlobContainer",
  async function (
    this: Context<BlobContainer>,
    id: string,
    props: BlobContainerProps,
  ): Promise<BlobContainer> {
    const containerId = props.containerId || this.output?.containerId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name = props.name 
      ?? this.output?.name 
      ?? this.scope.createPhysicalName(id, {
        maxLength: 63,
        lowercase: true,
      });

    // Validate name format
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
      throw new Error(
        `Container name "${name}" is invalid. Must be 3-63 characters, lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.`
      );
    }

    if (this.scope.local) {
      // Local development mode - return mock data
      return {
        id,
        name,
        containerId: containerId || `local-${id}`,
        url: `http://localhost:10000/devstoreaccount1/${name}`,
        resourceGroup: props.resourceGroup,
        storageAccount: props.storageAccount,
        publicAccess: props.publicAccess ?? "none",
        metadata: props.metadata,
        type: "azure::BlobContainer",
      };
    }

    const api = await createAzureApi(this.scope);

    if (this.phase === "delete") {
      if (props.delete !== false && containerId) {
        try {
          const deleteResponse = await api.delete(
            `/subscriptions/${this.scope.azure.subscriptionId}/resourceGroups/${getResourceGroupName(props.resourceGroup)}/providers/Microsoft.Storage/storageAccounts/${getStorageAccountName(props.storageAccount)}/blobServices/default/containers/${name}?api-version=2023-01-01`
          );
          if (!deleteResponse.ok && deleteResponse.status !== 404) {
            await handleAzureApiError(deleteResponse, "delete", "blob container", id);
          }
        } catch (error) {
          throw error;
        }
      }
      return this.destroy();
    }

    // Check for immutable property changes
    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace(); // Name is immutable
      }
    }

    const requestBody = {
      properties: {
        publicAccess: props.publicAccess ?? "none",
        metadata: props.metadata,
      },
    };

    let result: AzureBlobContainerResponse;
    
    if (containerId) {
      // Update existing container
      result = await extractAzureResult<AzureBlobContainerResponse>(
        `update blob container "${name}"`,
        api.put(
          `/subscriptions/${this.scope.azure.subscriptionId}/resourceGroups/${getResourceGroupName(props.resourceGroup)}/providers/Microsoft.Storage/storageAccounts/${getStorageAccountName(props.storageAccount)}/blobServices/default/containers/${name}?api-version=2023-01-01`,
          requestBody
        ),
      );
    } else {
      try {
        // Create new container
        result = await extractAzureResult<AzureBlobContainerResponse>(
          `create blob container "${name}"`,
          api.put(
            `/subscriptions/${this.scope.azure.subscriptionId}/resourceGroups/${getResourceGroupName(props.resourceGroup)}/providers/Microsoft.Storage/storageAccounts/${getStorageAccountName(props.storageAccount)}/blobServices/default/containers/${name}?api-version=2023-01-01`,
            requestBody
          ),
        );
      } catch (error) {
        if (error instanceof AzureApiError && error.code === "ContainerAlreadyExists") {
          if (!adopt) {
            throw new Error(
              `Blob container "${name}" already exists. Use adopt: true to adopt it.`,
              { cause: error },
            );
          }
          
          // Get existing container
          const existing = await api.get(
            `/subscriptions/${this.scope.azure.subscriptionId}/resourceGroups/${getResourceGroupName(props.resourceGroup)}/providers/Microsoft.Storage/storageAccounts/${getStorageAccountName(props.storageAccount)}/blobServices/default/containers/${name}?api-version=2023-01-01`
          );
          
          if (!existing.ok) {
            throw new Error(
              `Blob container "${name}" failed to create due to name conflict and could not be found for adoption.`,
              { cause: error },
            );
          }
          
          result = await existing.json();
        } else {
          throw error;
        }
      }
    }

    const storageAccountName = getStorageAccountName(props.storageAccount);
    const url = `https://${storageAccountName}.blob.core.windows.net/${name}`;

    return {
      id,
      name: result.name,
      containerId: result.id,
      url,
      resourceGroup: props.resourceGroup,
      storageAccount: props.storageAccount,
      publicAccess: result.properties.publicAccess,
      metadata: result.properties.metadata,
      type: "azure::BlobContainer",
    };
  },
);

/**
 * Type guard to check if a resource is a BlobContainer
 */
export function isBlobContainer(resource: any): resource is BlobContainer {
  return resource?.[ResourceKind] === "azure::BlobContainer";
}

/**
 * Azure API response for blob container
 * @internal
 */
interface AzureBlobContainerResponse {
  id: string;
  name: string;
  type: string;
  properties: {
    publicAccess: "blob" | "container" | "none";
    metadata?: Record<string, string>;
    leaseStatus?: string;
    leaseState?: string;
  };
}

// Helper functions
function getResourceGroupName(rg: string | ResourceGroup): string {
  return typeof rg === "string" ? rg : rg.name;
}

function getStorageAccountName(sa: string | StorageAccount): string {
  return typeof sa === "string" ? sa : sa.name;
}
```

## Authentication & API Client

**Recommendation**: Use the Official Azure SDK.
Do **not** use raw `fetch` calls. The Azure SDK (`@azure/identity`, `@azure/arm-resources`, etc.) handles:
1.  **Authentication**: `DefaultAzureCredential` supports Environment Vars, Azure CLI, Managed Identity, and Workload Identity out of the box.
2.  **Long-Running Operations**: Automatic polling for `202 Accepted` responses.
3.  **Consistency**: Aligns with the AWS implementation.

```ts
// alchemy/src/azure/client.ts
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { StorageManagementClient } from "@azure/arm-storage";

export interface AzureClients {
  resources: ResourceManagementClient;
  storage: StorageManagementClient;
}

export function createAzureClients(subscriptionId: string): AzureClients {
  const credential = new DefaultAzureCredential();

  return {
    resources: new ResourceManagementClient(credential, subscriptionId),
    storage: new StorageManagementClient(credential, subscriptionId),
  };
}
```

Example: using the storage client in the `BlobContainer` resource (conceptual shape only):

```ts
// Inside BlobContainer implementation (non-local branch)
const { storage } = createAzureClients(this.scope.azure.subscriptionId);

const result = await storage.blobContainers.beginCreateOrUpdateAndWait(
  getResourceGroupName(props.resourceGroup),
  getStorageAccountName(props.storageAccount),
  name,
  {
    publicAccess: props.publicAccess ?? "None",
    metadata: props.metadata,
  },
);

const url = `https://${getStorageAccountName(props.storageAccount)}.blob.core.windows.net/${name}`;

return {
  id,
  name: result.name!,
  containerId: result.id!,
  url,
  resourceGroup: props.resourceGroup,
  storageAccount: props.storageAccount,
  publicAccess: (result.properties?.publicAccess as "blob" | "container" | "none") ?? "none",
  metadata: result.properties?.metadata,
  type: "azure::BlobContainer",
};
```

## Testing Strategy

Follow the established testing patterns:

```ts
// alchemy/test/azure/blob-container.test.ts
import { describe, expect } from "vitest";
import { destroy } from "../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { StorageAccount } from "../../src/azure/storage-account.ts";
import { BlobContainer } from "../../src/azure/blob-container.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Blob Container", () => {
  test("create, update, and delete blob container", async (scope) => {
    const rgName = `${BRANCH_PREFIX}-rg-blob-test`;
    const storageName = `${BRANCH_PREFIX}storage`.replace(/-/g, "").toLowerCase();
    const containerName = `${BRANCH_PREFIX}-container`;

    let rg: ResourceGroup;
    let storage: StorageAccount;
    let container: BlobContainer;

    try {
      // Create resource group
      rg = await ResourceGroup("test-rg", {
        name: rgName,
        location: "eastus",
      });

      expect(rg).toMatchObject({
        name: rgName,
        location: "eastus",
      });

      // Create storage account
      storage = await StorageAccount("test-storage", {
        name: storageName,
        resourceGroup: rg,
        location: "eastus",
      });

      expect(storage).toMatchObject({
        name: storageName,
      });

      // Create blob container
      container = await BlobContainer("test-container", {
        name: containerName,
        resourceGroup: rg,
        storageAccount: storage,
        publicAccess: "none",
      });

      expect(container).toMatchObject({
        name: containerName,
        publicAccess: "none",
      });
      expect(container.url).toContain(storageName);
      expect(container.url).toContain(containerName);

      // Update container
      container = await BlobContainer("test-container", {
        name: containerName,
        resourceGroup: rg,
        storageAccount: storage,
        publicAccess: "blob",
        metadata: {
          environment: "test",
        },
      });

      expect(container).toMatchObject({
        publicAccess: "blob",
        metadata: {
          environment: "test",
        },
      });
    } finally {
      await destroy(scope);
      
      // Verify deletion
      await assertContainerDoesNotExist(
        scope.azure.subscriptionId,
        rgName,
        storageName,
        containerName
      );
    }
  });

  test("adopt existing blob container", async (scope) => {
    // Test adoption pattern
    // ... implementation
  });
});

async function assertContainerDoesNotExist(
  subscriptionId: string,
  resourceGroup: string,
  storageAccount: string,
  containerName: string
) {
  const api = await createAzureApi(/* ... */);
  const response = await api.get(
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccount}/blobServices/default/containers/${containerName}?api-version=2023-01-01`
  );
  
  if (response.ok) {
    throw new Error(`Blob container ${containerName} still exists after deletion`);
  }
  
  expect(response.status).toBe(404);
}
```

## Documentation Structure

### Provider Overview (index.md)

```markdown
# Azure

Azure is Microsoft's cloud computing platform offering a wide range of services including compute, storage, databases, AI, and more.

**Official Links:**
- [Azure Portal](https://portal.azure.com)
- [Azure Documentation](https://docs.microsoft.com/azure)
- [Azure SDK for JavaScript](https://github.com/Azure/azure-sdk-for-js)

## Resources

- [ResourceGroup](./resource-group.md) - Logical container for Azure resources
- [StorageAccount](./storage-account.md) - Storage foundation for blobs, files, queues, and tables
- [BlobContainer](./blob-container.md) - Object storage container
- [FunctionApp](./function-app.md) - Serverless compute platform
- [StaticWebApp](./static-web-app.md) - Static site hosting with CI/CD
- [CosmosDB](./cosmos-db.md) - Multi-model NoSQL database
- [SqlDatabase](./sql-database.md) - Managed SQL Server database
- [KeyVault](./key-vault.md) - Secrets and key management
- [AppService](./app-service.md) - PaaS web hosting
- [ContainerInstance](./container-instance.md) - Run containers without orchestration
- [ServiceBus](./service-bus.md) - Enterprise messaging service
- [CognitiveServices](./cognitive-services.md) - AI and ML services
- [CDN](./cdn.md) - Content delivery network

## Example Usage

\`\`\`ts
import { alchemy } from "alchemy";
import { ResourceGroup, StorageAccount, BlobContainer, FunctionApp } from "alchemy/azure";

const app = await alchemy("my-azure-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    tenantId: alchemy.secret.env.AZURE_TENANT_ID,
    clientId: alchemy.secret.env.AZURE_CLIENT_ID,
    clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET,
  }
});

// Create a resource group
const rg = await ResourceGroup("my-rg", {
  location: "eastus",
  tags: {
    environment: "production",
    project: "my-app"
  }
});

// Create storage for uploads
const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  location: "eastus",
});

const uploads = await BlobContainer("uploads", {
  resourceGroup: rg,
  storageAccount: storage,
  publicAccess: "none",
});

// Create a serverless API
const api = await FunctionApp("api", {
  resourceGroup: rg,
  location: "eastus",
  runtime: "node",
  runtimeVersion: "20",
  environmentVariables: {
    STORAGE_CONNECTION_STRING: storage.connectionString,
  },
  bindings: {
    UPLOADS: uploads,
  }
});

console.log(`API URL: ${api.url}`);
console.log(`Storage URL: ${storage.url}`);

await app.finalize();
\`\`\`
```

### Getting Started Guide

```markdown
---
order: 3
title: Azure
description: Deploy your first application to Azure using Alchemy
---

# Getting Started with Azure

This guide will walk you through deploying a serverless function with blob storage to Azure using Alchemy.

## Install

First, install the Azure CLI for local development:

::: code-group

```sh [macOS]
brew install azure-cli
```

```sh [Windows]
winget install Microsoft.AzureCLI
```

```sh [Linux]
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

:::

Then install your project dependencies:

::: code-group

```sh [bun]
bun add alchemy
```

```sh [npm]
npm install alchemy
```

```sh [pnpm]
pnpm add alchemy
```

```sh [yarn]
yarn add alchemy
```

:::

## Credentials

1. **Login to Azure CLI:**

```sh
az login
```

2. **Create a Service Principal:**

```sh
az ad sp create-for-rbac --name "alchemy-deploy" --role contributor --scopes /subscriptions/{subscription-id}
```

This will output credentials that you'll need to save.

3. **Create a `.env` file:**

```env
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

## Create an Azure Function App

Initialize a new Node.js project:

::: code-group

```sh [bun]
bun init
```

```sh [npm]
npm init -y
```

```sh [pnpm]
pnpm init
```

```sh [yarn]
yarn init -y
```

:::

## Create `alchemy.run.ts`

Create an `alchemy.run.ts` file to define your infrastructure:

```ts
import { alchemy } from "alchemy";
import { ResourceGroup, FunctionApp, StorageAccount, BlobContainer } from "alchemy/azure";

const app = await alchemy("my-azure-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    tenantId: alchemy.secret.env.AZURE_TENANT_ID,
    clientId: alchemy.secret.env.AZURE_CLIENT_ID,
    clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET,
  }
});

// Create resource group in East US
const rg = await ResourceGroup("my-rg", {
  location: "eastus"
});

// Create storage account
const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  location: "eastus",
});

// Create blob container for uploads
const uploads = await BlobContainer("uploads", {
  resourceGroup: rg,
  storageAccount: storage,
});

// Create Function App
const api = await FunctionApp("api", {
  resourceGroup: rg,
  location: "eastus",
  runtime: "node",
  runtimeVersion: "20",
  functions: {
    hello: {
      handler: "./src/hello.ts",
      trigger: "http",
      methods: ["GET", "POST"]
    }
  },
  bindings: {
    STORAGE: storage,
    UPLOADS: uploads,
  }
});

console.log(`Function App URL: ${api.url}`);
console.log(`Storage Account: ${storage.name}`);

await app.finalize();
```

Create your function handler in `src/hello.ts`:

```ts
import { app } from "@azure/functions";

app.http("hello", {
  methods: ["GET", "POST"],
  handler: async (request, context) => {
    const name = request.query.get("name") || "World";
    
    return {
      status: 200,
      body: `Hello, ${name}!`
    };
  }
});
```

## Deploy

Run `alchemy.run.ts` to deploy your infrastructure:

::: code-group

```sh [bun]
bun ./alchemy.run.ts
```

```sh [npm]
npx tsx ./alchemy.run.ts
```

```sh [pnpm]
pnpm tsx ./alchemy.run.ts
```

```sh [yarn]
yarn tsx ./alchemy.run.ts
```

:::

You should see output like:

```sh
✓ Created resource group my-rg in eastus
✓ Created storage account mystorage123
✓ Created blob container uploads
✓ Deployed function app my-api
Function App URL: https://my-api.azurewebsites.net
Storage Account: mystorage123
```

Visit the URL to see your function in action:

```sh
curl https://my-api.azurewebsites.net/api/hello?name=Azure
# Hello, Azure!
```

## Tear Down

When you're done, tear down your infrastructure:

::: code-group

```sh [bun]
bun ./alchemy.run.ts --destroy
```

```sh [npm]
npx tsx ./alchemy.run.ts --destroy
```

```sh [pnpm]
pnpm tsx ./alchemy.run.ts --destroy
```

```sh [yarn]
yarn tsx ./alchemy.run.ts --destroy
```

:::

All resources will be deleted, including the resource group and everything in it.
```

## Key Differences from Existing Providers

### 1. Hierarchical Organization

Azure requires explicit resource groups, unlike Cloudflare's flat structure:

```ts
// Azure (hierarchical)
const rg = await ResourceGroup("rg", { location: "eastus" });
const storage = await StorageAccount("storage", { resourceGroup: rg });

// Cloudflare (flat)
const bucket = await R2Bucket("bucket", { name: "my-bucket" });
```

### 2. Regional Pairs

Azure has paired regions for redundancy. Resources should support this:

```ts
const rg = await ResourceGroup("rg", {
  location: "eastus",
  pairedRegion: "westus" // Optional but recommended
});
```

### 3. ARM Templates

Consider supporting ARM template export for complex scenarios:

```ts
const template = app.toARMTemplate(); // Export entire app as ARM template
await writeFile("template.json", JSON.stringify(template, null, 2));
```

### 4. Managed Identities

Azure has native identity management that should be supported:

```ts
const functionApp = await FunctionApp("api", {
  resourceGroup: rg,
  identity: {
    type: "SystemAssigned" // Creates a managed identity
  }
});

// Grant the function app access to Key Vault
await KeyVaultAccessPolicy("policy", {
  keyVault: vault,
  objectId: functionApp.identity.principalId,
  permissions: {
    secrets: ["get", "list"]
  }
});
```

### 5. Naming Constraints

Azure has stricter naming rules that vary by resource type:

| Resource | Length | Characters | Case | Uniqueness |
|----------|--------|------------|------|------------|
| Storage Account | 3-24 | Lowercase letters, numbers | Lowercase | Global |
| Resource Group | 1-90 | Letters, numbers, periods, underscores, hyphens, parentheses | Mixed | Subscription |
| Blob Container | 3-63 | Lowercase letters, numbers, hyphens | Lowercase | Storage Account |
| Function App | 2-60 | Letters, numbers, hyphens | Mixed | Global |

The implementation should validate and handle these constraints automatically.

## Integration Benefits

### Multi-Cloud Deployment

Enable users to deploy across multiple clouds:

```ts
// Deploy edge compute to Cloudflare, backend to Azure
const edgeWorker = await Worker("edge", {
  script: "./src/edge.ts"
});

const rg = await ResourceGroup("backend-rg", {
  location: "eastus"
});

const api = await FunctionApp("backend-api", {
  resourceGroup: rg,
  // ... config
});

// Edge worker proxies to Azure backend
```

### Hybrid Scenarios

Combine Azure services with Cloudflare edge:

```ts
// Azure Cosmos DB with Cloudflare Workers edge cache
const cosmos = await CosmosDB("db", {
  resourceGroup: rg,
  location: "eastus"
});

const worker = await Worker("api", {
  bindings: {
    COSMOS_ENDPOINT: cosmos.endpoint,
    COSMOS_KEY: cosmos.primaryKey,
  },
  script: "./src/worker.ts"
});
```

### Enterprise Adoption

Many enterprises standardize on Azure. Alchemy support enables:

- Existing Azure customers to adopt Infrastructure-as-Code
- Gradual migration from ARM/Bicep templates to TypeScript
- Integration with existing Azure DevOps pipelines
- Compliance with enterprise Azure policies

### Unique Azure Services

Access to Azure-specific services:

- **Cognitive Services**: Vision, Speech, Language AI
- **Azure AD B2C**: Customer identity management
- **Azure DevOps**: Integrated CI/CD
- **Synapse Analytics**: Big data analytics
- **Azure Quantum**: Quantum computing (experimental)

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up Azure provider structure
- [ ] Implement authentication using `@azure/identity`
- [ ] Create Azure Client factory using `@azure/arm-*` SDKs
- [ ] Implement ResourceGroup
- [ ] Implement UserAssignedIdentity (Managed Identity)
- [ ] Write comprehensive tests for ResourceGroup
- [ ] Document ResourceGroup and Identity

### Phase 2: Storage (Weeks 3-4)
- [ ] Implement StorageAccount
- [ ] Implement BlobContainer
- [ ] Add support for blob operations in bindings
- [ ] Write tests for storage resources
- [ ] Create storage example project
- [ ] Document storage resources

### Phase 3: Compute (Weeks 5-7)
- [ ] Implement FunctionApp
- [ ] Implement StaticWebApp
- [ ] Implement AppService
- [ ] Add support for deployment slots
- [ ] Write tests for compute resources
- [ ] Create function app example
- [ ] Create static web app example
- [ ] Document compute resources

### Phase 4: Databases (Weeks 8-9)
- [ ] Implement CosmosDB
- [ ] Implement SqlDatabase
- [ ] Add support for database bindings
- [ ] Write tests for database resources
- [ ] Create database example
- [ ] Document database resources

### Phase 5: Security & Advanced (Weeks 10-12)
- [ ] Implement KeyVault
- [ ] Implement ContainerInstance
- [ ] Implement ServiceBus
- [ ] Implement CognitiveServices
- [ ] Implement CDN
- [ ] Write tests for all resources
- [ ] Create advanced examples
- [ ] Write comprehensive guides
- [ ] Performance optimization
- [ ] Final documentation review

### Phase 6: Polish & Release (Week 13)
- [ ] End-to-end integration tests
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] Documentation review
- [ ] Example project review
- [ ] Beta release
- [ ] Gather feedback
- [ ] Stable release

## Open Questions

1. **ARM Template Interop**: Should we support importing existing ARM templates?
2. **Azure DevOps Integration**: Should we provide native Azure DevOps pipeline support?
3. **Managed Identity**: How should we handle managed identity assignment across resources?
4. **Cost Estimation**: Should we provide cost estimation before deployment?
5. **Azure Policy**: How should we handle Azure Policy compliance?
6. **Bicep Support**: Should we support Bicep template export?

## References

- [Azure REST API Documentation](https://docs.microsoft.com/rest/api/azure/)
- [Azure SDK for JavaScript](https://github.com/Azure/azure-sdk-for-js)
- [Azure Resource Manager](https://docs.microsoft.com/azure/azure-resource-manager/)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure/)
- [Azure Naming Conventions](https://docs.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming)

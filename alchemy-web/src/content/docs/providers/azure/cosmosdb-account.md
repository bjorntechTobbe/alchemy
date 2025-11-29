---
title: CosmosDBAccount
description: Azure Cosmos DB Account - globally distributed, multi-model NoSQL database
---

# CosmosDBAccount

Azure Cosmos DB is a globally distributed, multi-model database service designed for building highly responsive and highly available applications. It provides turnkey global distribution, elastic scaling, and multiple API compatibility.

Key features:
- **Multi-model support** - SQL (Core), MongoDB, Cassandra, Gremlin, and Table APIs
- **Global distribution** - Multi-region writes and automatic failover
- **Multiple consistency levels** - From eventual to strong consistency
- **Serverless option** - Pay per request with no provisioned throughput
- **Free tier available** - 400 RU/s and 5GB storage free (one per subscription)
- **Automatic indexing** - All data automatically indexed
- **Low latency** - Single-digit millisecond reads and writes

Equivalent to AWS DynamoDB or MongoDB Atlas.

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the Cosmos DB account. Must be 3-44 characters, lowercase letters, numbers, and hyphens only. Must be globally unique across all of Azure. Defaults to `${app}-${stage}-${id}` (lowercase, alphanumeric + hyphens) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this account in |
| `location` | `string` | No | Azure region for the account. Defaults to the resource group's location |
| `kind` | `string` | No | The API to use. Options: `GlobalDocumentDB` (SQL), `MongoDB`, `Cassandra`, `Gremlin`, `Table`. Defaults to `GlobalDocumentDB` |
| `consistencyLevel` | `string` | No | Default consistency level. Options: `Eventual`, `ConsistentPrefix`, `Session`, `BoundedStaleness`, `Strong`. Defaults to `Session` |
| `enableAutomaticFailover` | `boolean` | No | Enable automatic failover for multi-region accounts. Defaults to `false` |
| `enableMultipleWriteLocations` | `boolean` | No | Enable multiple write locations (multi-master). Defaults to `false` |
| `locations` | `string[]` | No | Additional regions to replicate data to. Example: `["westus", "eastus", "northeurope"]` |
| `enableFreeTier` | `boolean` | No | Enable free tier (400 RU/s and 5GB storage free). Can only be enabled on one account per subscription. Defaults to `false` |
| `serverless` | `boolean` | No | Enable serverless mode (pay per request, no provisioned throughput). Cannot be used with `enableAutomaticFailover` or `locations`. Defaults to `false` |
| `publicNetworkAccess` | `string` | No | Public network access setting. Options: `Enabled`, `Disabled`. Defaults to `Enabled` |
| `minimalTlsVersion` | `string` | No | Minimum TLS version required. Options: `Tls`, `Tls11`, `Tls12`. Defaults to `Tls12` |
| `enableAnalyticalStorage` | `boolean` | No | Enable analytical storage (Azure Synapse Link). Defaults to `false` |
| `tags` | `Record<string, string>` | No | Tags to apply to the account |
| `adopt` | `boolean` | No | Whether to adopt an existing account. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the account when removed from Alchemy. **WARNING**: Deleting an account deletes ALL databases and data inside it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `cosmosDBAccountId` | `string` | The Azure resource ID |
| `connectionString` | `Secret` | Primary connection string for accessing the account |
| `primaryKey` | `Secret` | Primary master key |
| `secondaryKey` | `Secret` | Secondary master key |
| `documentEndpoint` | `string` | The document endpoint URL (e.g., `https://{accountName}.documents.azure.com:443/`) |
| `type` | `"cosmosdb-account"` | Resource type identifier |

## Usage

### Basic Cosmos DB Account

Create a basic Cosmos DB account with SQL API:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, CosmosDBAccount } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

const cosmosDB = await CosmosDBAccount("database", {
  resourceGroup: rg,
});

console.log(`Cosmos DB: ${cosmosDB.name}`);
console.log(`Endpoint: ${cosmosDB.documentEndpoint}`);
console.log(`Connection String:`, cosmosDB.connectionString);

await app.finalize();
```

### MongoDB API

Create a Cosmos DB account with MongoDB API for existing MongoDB applications:

```typescript
const cosmosDB = await CosmosDBAccount("mongo-db", {
  resourceGroup: rg,
  kind: "MongoDB",
});

// Use MongoDB connection string with MongoDB drivers
console.log(`MongoDB Connection:`, cosmosDB.connectionString);
```

### Global Distribution

Create a globally distributed Cosmos DB account with multi-region writes:

```typescript
const cosmosDB = await CosmosDBAccount("global-db", {
  resourceGroup: rg,
  location: "eastus",
  locations: ["westus", "northeurope", "southeastasia"],
  enableAutomaticFailover: true,
  enableMultipleWriteLocations: true,
  consistencyLevel: "Session",
  tags: {
    environment: "production",
    criticality: "high"
  }
});
```

### Serverless Mode

Create a serverless Cosmos DB account (pay per request):

```typescript
const cosmosDB = await CosmosDBAccount("serverless-db", {
  resourceGroup: rg,
  serverless: true,
});

// Ideal for:
// - Development and testing
// - Sporadic or unpredictable traffic
// - Applications with low average throughput
```

### Free Tier

Enable free tier for development (400 RU/s and 5GB storage free):

```typescript
const cosmosDB = await CosmosDBAccount("dev-db", {
  resourceGroup: rg,
  enableFreeTier: true,
  tags: {
    environment: "development"
  }
});

// Note: Only one free tier account allowed per subscription
```

### Strong Consistency

Create a Cosmos DB account with strong consistency for financial applications:

```typescript
const cosmosDB = await CosmosDBAccount("financial-db", {
  resourceGroup: rg,
  consistencyLevel: "Strong",
  tags: {
    purpose: "financial-transactions"
  }
});

// Strong consistency guarantees:
// - Reads always return the most recent committed write
// - Highest consistency, but lowest performance
```

### Cassandra API

Create a Cosmos DB account with Cassandra API:

```typescript
const cosmosDB = await CosmosDBAccount("cassandra-db", {
  resourceGroup: rg,
  kind: "Cassandra",
});

// Use Cassandra drivers and CQL
```

### Private Network Access

Create a Cosmos DB account with public network access disabled:

```typescript
const cosmosDB = await CosmosDBAccount("private-db", {
  resourceGroup: rg,
  publicNetworkAccess: "Disabled",
  tags: {
    security: "private-only"
  }
});

// Access via private endpoints only
```

### Adopt Existing Account

Adopt an existing Cosmos DB account:

```typescript
const cosmosDB = await CosmosDBAccount("existing-db", {
  name: "my-existing-cosmosdb",
  resourceGroup: "my-existing-rg",
  adopt: true,
});
```

## Consistency Levels

Cosmos DB offers five well-defined consistency levels:

| Level | Description | Use Case |
|-------|-------------|----------|
| **Strong** | Linearizability guarantee. Reads return the most recent committed write. | Financial systems, inventory management |
| **Bounded Staleness** | Reads lag behind writes by at most K versions or T time interval. | Social feeds, notifications |
| **Session** | Consistent within a client session. Default and recommended for most apps. | E-commerce, web applications |
| **Consistent Prefix** | Reads never see out-of-order writes. | Social media updates, comments |
| **Eventual** | No ordering guarantee. Lowest consistency, highest performance. | Non-critical data, analytics |

## API Comparison

| API | Use Case | Compatible With |
|-----|----------|-----------------|
| **SQL (GlobalDocumentDB)** | New applications, JSON documents | Cosmos DB SDK, REST API |
| **MongoDB** | Existing MongoDB apps | MongoDB drivers, tools |
| **Cassandra** | Existing Cassandra apps | Cassandra drivers, CQL |
| **Gremlin** | Graph databases | Gremlin queries, graph traversals |
| **Table** | Azure Table Storage migration | Table API SDK |

## Pricing Modes

### Provisioned Throughput
- Pre-allocated Request Units per second (RU/s)
- Predictable performance
- Best for consistent traffic
- Can scale manually or automatically

### Serverless
- Pay per request
- No capacity planning needed
- Best for sporadic traffic
- Cannot use multi-region writes or automatic failover

### Free Tier
- 400 RU/s and 5 GB storage free
- One per Azure subscription
- Great for development and testing

## Important Notes

### Naming Constraints
- Name must be 3-44 characters long
- Only lowercase letters, numbers, and hyphens allowed
- Must be globally unique across all of Azure
- Forms the endpoint: `https://{name}.documents.azure.com:443/`

### Immutable Properties
After creation, the following properties **cannot be changed**:
- `name` - requires replacement
- `kind` - requires replacement

### Multi-Region Configuration
- Primary region (specified in `location`) cannot be removed
- Additional regions can be added/removed via `locations` array
- Failover priority is automatic based on array order

### Security
- Connection strings and keys are returned as `Secret` objects
- Keys can be regenerated via Azure Portal
- Use managed identities when possible
- Enable private endpoints for production workloads

### Performance
- Request Units (RU/s) determine throughput capacity
- Indexing is automatic but can be customized
- Partition key selection is critical for performance
- Use Session consistency for best balance of consistency and performance

## Related Resources

- [ResourceGroup](./resource-group.md) - Logical container for Cosmos DB accounts
- [FunctionApp](./function-app.md) - Serverless compute that can connect to Cosmos DB

## Official Documentation

- [Azure Cosmos DB Documentation](https://docs.microsoft.com/azure/cosmos-db/)
- [Choose a consistency level](https://docs.microsoft.com/azure/cosmos-db/consistency-levels)
- [Request Units in Azure Cosmos DB](https://docs.microsoft.com/azure/cosmos-db/request-units)
- [Global distribution](https://docs.microsoft.com/azure/cosmos-db/distribute-data-globally)

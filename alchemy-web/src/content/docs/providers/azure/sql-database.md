---
title: SqlDatabase
description: Azure SQL Database - fully managed relational database service
---

# SqlDatabase

Azure SQL Database is a fully managed relational database service built on the latest stable version of Microsoft SQL Server. It provides high availability, automated backups, and intelligent performance optimization.

Key features:
- **Fully managed** - Automatic backups, patching, and monitoring
- **High availability** - 99.99% SLA with built-in redundancy
- **Elastic scaling** - Scale compute and storage independently
- **Intelligent performance** - Automatic tuning and query optimization
- **Multiple pricing tiers** - From basic development to mission-critical workloads
- **Built-in security** - Encryption, threat detection, and auditing

Equivalent to AWS RDS for SQL Server or self-hosted SQL Server databases.

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the database. Must be 1-128 characters. Cannot be special system database names. Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this database in |
| `sqlServer` | `string \| SqlServer` | Yes | The SQL server to create this database in |
| `location` | `string` | No | Azure region for the database. Defaults to the SQL server's location |
| `sku` | `string` | No | The SKU (service tier). See SKU table below. Defaults to `Basic` |
| `maxSizeBytes` | `number` | No | Maximum size of the database in bytes. Example: `10737418240` (10GB) |
| `collation` | `string` | No | Collation of the database. Defaults to `SQL_Latin1_General_CP1_CI_AS` |
| `zoneRedundant` | `boolean` | No | Enable zone redundancy. Defaults to `false` |
| `readScale` | `string` | No | Enable read scale-out (read-only replicas). Options: `Enabled`, `Disabled`. Only available on Premium and Business Critical tiers. Defaults to `Disabled` |
| `tags` | `Record<string, string>` | No | Tags to apply to the database |
| `adopt` | `boolean` | No | Whether to adopt an existing database. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the database when removed from Alchemy. **WARNING**: Deleting a database deletes ALL data in it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `databaseId` | `string` | The Azure resource ID |
| `connectionString` | `Secret` | Connection string for the database (format: `Server=tcp:{server}.database.windows.net,1433;Database={database};`) |
| `type` | `"sql-database"` | Resource type identifier |

## SKU Tiers

### DTU-Based (Database Transaction Units)

| SKU | Tier | DTUs | Max Storage | Use Case |
|-----|------|------|-------------|----------|
| `Basic` | Basic | 5 | 2 GB | Development, small apps |
| `S0` | Standard | 10 | 250 GB | Light workloads |
| `S1` | Standard | 20 | 250 GB | Small production apps |
| `S2` | Standard | 50 | 250 GB | Medium workloads |
| `S3` | Standard | 100 | 250 GB | Busy applications |
| `P1` | Premium | 125 | 1 TB | Business-critical |
| `P2` | Premium | 250 | 1 TB | High-performance |
| `P4` | Premium | 500 | 1 TB | Mission-critical |
| `P6` | Premium | 1000 | 1 TB | Enterprise-scale |

### vCore-Based (Virtual Cores)

| SKU | Tier | vCores | Use Case |
|-----|------|--------|----------|
| `GP_Gen5_2` | General Purpose | 2 | Balanced compute/memory |
| `GP_Gen5_4` | General Purpose | 4 | Standard workloads |
| `GP_Gen5_8` | General Purpose | 8 | Large applications |
| `BC_Gen5_2` | Business Critical | 2 | High IOPS, low latency |
| `BC_Gen5_4` | Business Critical | 4 | Mission-critical apps |
| `HS_Gen5_2` | Hyperscale | 2 | 100+ TB databases |

**Choosing a tier**:
- **Basic/S0-S3**: Development, testing, small production apps
- **Premium (P1-P6)**: Business-critical, read replicas, zone redundancy
- **General Purpose (GP)**: Most production workloads, predictable performance
- **Business Critical (BC)**: Highest IOPS, lowest latency, built-in read replicas
- **Hyperscale (HS)**: Very large databases (100+ TB), independent compute/storage scaling

## Usage

### Basic SQL Database

Create a basic database for development:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, SqlServer, SqlDatabase } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus"
});

const sqlServer = await SqlServer("sql-server", {
  resourceGroup: rg,
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
});

const database = await SqlDatabase("app-database", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "Basic",
});

console.log(`Database: ${database.connectionString}`);

await app.finalize();
```

### Production Database with Premium Tier

Create a production database with zone redundancy and read scale-out:

```typescript
const database = await SqlDatabase("prod-database", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "P1",
  zoneRedundant: true,
  readScale: "Enabled",
  maxSizeBytes: 107374182400, // 100 GB
  tags: {
    environment: "production",
    criticality: "high"
  }
});

// Premium tier features:
// - Built-in read replicas
// - Zone redundancy for 99.995% SLA
// - Faster performance
```

### Serverless vCore Database

Create a General Purpose serverless database (auto-pauses when inactive):

```typescript
const database = await SqlDatabase("serverless-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "GP_Gen5_2",
  maxSizeBytes: 10737418240, // 10 GB
  tags: {
    purpose: "development",
    auto-pause: "true"
  }
});

// vCore benefits:
// - More granular control over compute and storage
// - Auto-pause to save costs when not in use
// - Better for variable workloads
```

### Large Database

Create a large database with custom collation:

```typescript
const database = await SqlDatabase("large-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "S3",
  maxSizeBytes: 536870912000, // 500 GB
  collation: "SQL_Latin1_General_CP1_CI_AS",
  tags: {
    size: "large",
    retention: "7-years"
  }
});
```

### Multiple Databases on Same Server

Create multiple databases on a single SQL server:

```typescript
const sqlServer = await SqlServer("shared-server", {
  resourceGroup: rg,
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
});

// Production database
const prodDB = await SqlDatabase("prod-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "S2",
  tags: { environment: "production" }
});

// Staging database
const stagingDB = await SqlDatabase("staging-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "S1",
  tags: { environment: "staging" }
});

// Development database
const devDB = await SqlDatabase("dev-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "Basic",
  tags: { environment: "development" }
});
```

### Connect from Function App

Connect to a SQL database from an Azure Function:

```typescript
import { FunctionApp, StorageAccount } from "alchemy/azure";

const storage = await StorageAccount("func-storage", {
  resourceGroup: rg,
});

const funcApp = await FunctionApp("api", {
  resourceGroup: rg,
  storageAccount: storage,
  appSettings: {
    DATABASE_CONNECTION: database.connectionString,
  }
});

// Function code can now use process.env.DATABASE_CONNECTION
```

### Adopt Existing Database

Adopt an existing SQL database:

```typescript
const database = await SqlDatabase("existing-db", {
  name: "my-existing-database",
  resourceGroup: "my-existing-rg",
  sqlServer: "my-existing-server",
  adopt: true,
});
```

## Connection String Format

The connection string has the following format:

```
Server=tcp:{servername}.database.windows.net,1433;
Database={databasename};
User ID={username};
Password={password};
Encrypt=True;
TrustServerCertificate=False;
Connection Timeout=30;
```

**To use the connection string**:
1. Extract it from the `Secret` using `Secret.unwrap()` in your application
2. Add your SQL Server username and password
3. Use with any SQL Server client library

Example with Node.js:

```typescript
import mssql from 'mssql';
import { Secret } from 'alchemy';

const connectionString = Secret.unwrap(database.connectionString);
const config = {
  ...connectionString,
  user: 'sqladmin',
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

const pool = await mssql.connect(config);
const result = await pool.request().query('SELECT * FROM Users');
```

## Important Notes

### Database Name Restrictions
Cannot use these reserved system database names:
- `master`, `tempdb`, `model`, `msdb`

### Collation
- Determines sorting and comparison rules for text data
- Cannot be changed after database creation
- Default (`SQL_Latin1_General_CP1_CI_AS`) works for most scenarios
- Choose UTF-8 collation for international applications

### Zone Redundancy
- Available on Premium and Business Critical tiers
- Provides 99.995% SLA (vs 99.99%)
- Automatically replicates across availability zones
- Small additional cost

### Read Scale-Out
- Only available on Premium and Business Critical tiers
- Provides read-only replicas for reporting queries
- Offloads read traffic from primary database
- Connect with `ApplicationIntent=ReadOnly` in connection string

### Storage Limits
- Basic: Up to 2 GB
- Standard (S0-S3): Up to 1 TB
- Premium (P1-P15): Up to 4 TB
- General Purpose: Up to 4 TB
- Hyperscale: Up to 100 TB

### Backups
- Automatic backups included with all tiers
- Point-in-time restore available
- Retention: 7 days (Basic), 35 days (Standard/Premium)
- Long-term retention available (up to 10 years)

### Security Best Practices
1. **Use managed identity** - Avoid storing passwords in code
2. **Enable encryption** - Data encrypted at rest and in transit
3. **Firewall rules** - Configure on SQL Server
4. **Auditing** - Enable SQL auditing for compliance
5. **Threat detection** - Enable Advanced Threat Protection

## Cost Optimization Tips

1. **Right-size your tier** - Start with Basic/S0, scale up as needed
2. **Use serverless for dev/test** - Auto-pause when not in use
3. **Share servers** - Multiple databases on one server reduces overhead
4. **Elastic pools** - Share resources across multiple databases
5. **Reserved capacity** - Save up to 80% with 1 or 3-year commitments

## Related Resources

- [SqlServer](./sql-server.md) - Create a SQL server to host this database
- [ResourceGroup](./resource-group.md) - Logical container for databases
- [FunctionApp](./function-app.md) - Connect to databases from serverless functions

## Official Documentation

- [Azure SQL Database Documentation](https://docs.microsoft.com/azure/azure-sql/database/)
- [DTU-based purchasing model](https://docs.microsoft.com/azure/azure-sql/database/service-tiers-dtu)
- [vCore-based purchasing model](https://docs.microsoft.com/azure/azure-sql/database/service-tiers-vcore)
- [Backup and restore](https://docs.microsoft.com/azure/azure-sql/database/automated-backups-overview)

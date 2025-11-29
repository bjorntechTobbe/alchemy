---
title: SqlServer
description: Azure SQL Server - managed SQL Server instance for hosting databases
---

# SqlServer

Azure SQL Server is a logical server that acts as a central administrative point for multiple Azure SQL databases. It provides a fully managed platform for running SQL Server databases in the cloud.

Key features:
- **Fully managed** - Automatic patching, backups, and high availability
- **Multiple databases** - Host multiple SQL databases on one server
- **Built-in security** - Firewall rules, threat detection, and encryption
- **Azure AD integration** - Use Azure Active Directory for authentication
- **Global availability** - Deploy in any Azure region
- **No infrastructure** - No servers to manage or maintain

Equivalent to AWS RDS for SQL Server or self-hosted SQL Server instances.

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the SQL server. Must be 1-63 characters, lowercase letters, numbers, and hyphens only. Must be globally unique across all of Azure (creates `{name}.database.windows.net`). Defaults to `${app}-${stage}-${id}` (lowercase, alphanumeric + hyphens) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this server in |
| `location` | `string` | No | Azure region for the server. Defaults to the resource group's location |
| `administratorLogin` | `string` | Yes | Administrator login username. Must be 1-128 characters. Cannot be `admin`, `administrator`, `sa`, `root`, `dbmanager`, `loginmanager`, etc. |
| `administratorPassword` | `string \| Secret` | Yes | Administrator login password. Must be 8-128 characters with characters from three of: uppercase, lowercase, digits, non-alphanumeric. Use `alchemy.secret()` to securely store this value |
| `version` | `string` | No | SQL Server version. Options: `2.0`, `12.0`. Defaults to `12.0` (SQL Server 2014+) |
| `minimalTlsVersion` | `string` | No | Minimum TLS version required. Options: `1.0`, `1.1`, `1.2`. Defaults to `1.2` |
| `azureADOnlyAuthentication` | `boolean` | No | Enable Azure AD authentication only (disable SQL authentication). Defaults to `false` |
| `publicNetworkAccess` | `string` | No | Public network access setting. Options: `Enabled`, `Disabled`. Defaults to `Enabled` |
| `tags` | `Record<string, string>` | No | Tags to apply to the server |
| `adopt` | `boolean` | No | Whether to adopt an existing server. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the server when removed from Alchemy. **WARNING**: Deleting a server deletes ALL databases in it. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `sqlServerId` | `string` | The Azure resource ID |
| `fullyQualifiedDomainName` | `string` | The fully qualified domain name (e.g., `{name}.database.windows.net`) |
| `administratorPassword` | `Secret` | Administrator password (wrapped in Secret) |
| `type` | `"sql-server"` | Resource type identifier |

## Usage

### Basic SQL Server

Create a basic SQL server:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, SqlServer } from "alchemy/azure";

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

console.log(`Server: ${sqlServer.fullyQualifiedDomainName}`);

await app.finalize();
```

### SQL Server with Secure Configuration

Create a SQL server with recommended security settings:

```typescript
const sqlServer = await SqlServer("secure-sql", {
  resourceGroup: rg,
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
  minimalTlsVersion: "1.2",
  publicNetworkAccess: "Disabled", // Private endpoints only
  tags: {
    environment: "production",
    security: "high"
  }
});

// Note: With publicNetworkAccess: "Disabled", you'll need to:
// - Set up private endpoints for secure access
// - Configure VNet integration
```

### SQL Server with Azure AD Authentication

Create a SQL server with Azure AD only authentication:

```typescript
const sqlServer = await SqlServer("aad-sql", {
  resourceGroup: rg,
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
  azureADOnlyAuthentication: true,
  tags: {
    auth: "azure-ad-only"
  }
});

// Users authenticate with Azure AD credentials instead of SQL logins
```

### Multi-Region SQL Servers

Create SQL servers in multiple regions:

```typescript
const regions = ["eastus", "westus", "northeurope"];

const servers = await Promise.all(
  regions.map((location) =>
    SqlServer(`sql-server-${location}`, {
      resourceGroup: rg,
      location,
      administratorLogin: "sqladmin",
      administratorPassword: alchemy.secret.env.SQL_PASSWORD,
    })
  )
);
```

### SQL Server with Database

Create a SQL server and database together:

```typescript
import { SqlServer, SqlDatabase } from "alchemy/azure";

const sqlServer = await SqlServer("app-sql-server", {
  resourceGroup: rg,
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
});

const database = await SqlDatabase("app-database", {
  resourceGroup: rg,
  sqlServer: sqlServer,
  sku: "S1",
});

console.log(`Database: ${database.connectionString}`);
```

### Adopt Existing SQL Server

Adopt an existing SQL server:

```typescript
const sqlServer = await SqlServer("existing-sql", {
  name: "my-existing-sql-server",
  resourceGroup: "my-existing-rg",
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret.env.SQL_PASSWORD,
  adopt: true,
});
```

## SQL Server Versions

| Version | Description |
|---------|-------------|
| `12.0` | SQL Server 2014 and later (recommended) |
| `2.0` | SQL Server 2008 R2 (legacy) |

**Recommendation**: Use version `12.0` for all new deployments.

## Authentication Methods

### SQL Authentication
- Traditional username/password authentication
- Credentials specified during server creation
- Good for development and legacy applications

### Azure AD Authentication
- Use Azure Active Directory identities
- Supports Multi-Factor Authentication (MFA)
- Recommended for enterprise applications
- Can disable SQL authentication entirely with `azureADOnlyAuthentication: true`

### Managed Identity
- Azure resources (like Function Apps) can authenticate without credentials
- Most secure option for Azure-to-Azure connections
- Configure after server creation via Azure Portal

## Firewall Rules

By default, Azure SQL Server blocks all external connections. You need to configure firewall rules:

### Allow Azure Services
Allow other Azure services to connect:
- Configure via Azure Portal
- Enable "Allow Azure services and resources to access this server"

### Specific IP Addresses
Allow specific IP addresses:
- Add firewall rules via Azure Portal or Azure CLI
- Specify IP range for your office, CI/CD servers, etc.

### Private Endpoints
Most secure option for production:
- Use VNet integration
- No public internet exposure
- Set `publicNetworkAccess: "Disabled"`

## Important Notes

### Naming Constraints
- Name must be 1-63 characters long
- Only lowercase letters, numbers, and hyphens allowed
- Cannot start or end with a hyphen
- Must be globally unique across all of Azure
- Forms the FQDN: `{name}.database.windows.net`

### Administrator Login Restrictions
Cannot use these reserved names:
- `admin`, `administrator`, `sa`, `root`
- `dbmanager`, `loginmanager`
- `dbo`, `guest`, `public`

### Password Requirements
- 8-128 characters long
- Must contain characters from three of these categories:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Digits (0-9)
  - Non-alphanumeric characters (!@#$%^&*)

### Security Best Practices
1. **Use strong passwords** - Store in `alchemy.secret()` or Azure Key Vault
2. **Enable TLS 1.2** - Set `minimalTlsVersion: "1.2"`
3. **Use Azure AD** - Enable `azureADOnlyAuthentication` for production
4. **Restrict network access** - Use private endpoints when possible
5. **Enable threat detection** - Configure via Azure Portal
6. **Regular backups** - Automatic backups included, configure retention as needed

### Server vs Database
- **SQL Server** = Logical container for databases
- **SQL Database** = Actual database with tables and data
- One SQL Server can host multiple databases
- All databases on a server share the same administrator credentials

### Cost Optimization
- The SQL Server itself has no cost
- You only pay for databases created on the server
- Multiple databases can share a server to reduce management overhead

## Related Resources

- [SqlDatabase](./sql-database.md) - Create databases on this SQL server
- [ResourceGroup](./resource-group.md) - Logical container for SQL servers
- [FunctionApp](./function-app.md) - Connect to SQL databases from serverless functions

## Official Documentation

- [Azure SQL Server Documentation](https://docs.microsoft.com/azure/azure-sql/database/logical-servers)
- [Firewall rules](https://docs.microsoft.com/azure/azure-sql/database/firewall-configure)
- [Azure AD authentication](https://docs.microsoft.com/azure/azure-sql/database/authentication-aad-overview)
- [Security best practices](https://docs.microsoft.com/azure/azure-sql/database/security-best-practice)

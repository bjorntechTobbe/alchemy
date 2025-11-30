# Azure SQL Database Example

This example demonstrates how to provision an Azure SQL Database using Alchemy.

## What You'll Deploy

- **Resource Group**: Container for all resources
- **SQL Server**: Logical server for hosting databases
- **SQL Database**: Fully managed relational database (Basic tier, ~$5/month)

## Prerequisites

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up Azure credentials:
   ```bash
   az login
   az account set --subscription "your-subscription-id"
   ```

3. Set Alchemy password and SQL admin password:
   ```bash
   export ALCHEMY_PASSWORD="your-secure-password"
   export SQL_ADMIN_PASSWORD="YourSecureP@ssw0rd123"
   ```

## Deploy

Deploy the SQL Database:

```bash
bun deploy
```

## Connect to Your Database

### Connection String

```
Server=<server-name>.database.windows.net;Database=demo-db;User=sqladmin;Password=<password>;Encrypt=true;
```

### Using Node.js

```bash
npm install mssql
```

```javascript
const sql = require('mssql');

const config = {
  server: '<server-name>.database.windows.net',
  database: 'demo-db',
  user: 'sqladmin',
  password: process.env.SQL_ADMIN_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

const pool = await sql.connect(config);
const result = await pool.request().query('SELECT @@VERSION');
console.log(result);
```

### Using Azure CLI

```bash
sqlcmd -S <server-name>.database.windows.net \
  -d demo-db \
  -U sqladmin \
  -P <password> \
  -N -C
```

## Security

⚠️ **Important**: The default configuration allows Azure services access. For production:

1. Add firewall rules for specific IP addresses
2. Use Azure Key Vault for storing connection strings
3. Enable Advanced Threat Protection
4. Configure audit logging

## Clean Up

Destroy all resources:

```bash
bun destroy
```

## Cost

- **Basic Tier**: ~$5/month
  - 2 GB storage
  - 5 DTUs
  - Automatic backups included
  - 99.99% SLA

## Features

- Automatic backups (7-35 days retention)
- Point-in-time restore
- Built-in high availability
- Automatic tuning and indexing
- Query Performance Insights
- Advanced threat detection

import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { SqlServer } from "../../alchemy/src/azure/sql-server.ts";
import { SqlDatabase } from "../../alchemy/src/azure/sql-database.ts";

/**
 * Azure SQL Database Example
 *
 * This example demonstrates how to provision an Azure SQL Database:
 * - SQL Server (logical server)
 * - SQL Database with automatic backups
 * - Firewall rules for secure access
 *
 * Azure SQL Database is equivalent to:
 * - AWS RDS for SQL Server
 * - Google Cloud SQL
 * - Managed PostgreSQL/MySQL services
 *
 * Features:
 * - Fully managed relational database
 * - Automatic backups and point-in-time restore
 * - Built-in high availability (99.99% SLA)
 * - Intelligent performance optimization
 * - Advanced security features
 */

const app = await alchemy("azure-sql-database", {
  password: process.env.ALCHEMY_PASSWORD || "change-me-in-production",
});

// Create a resource group
const rg = await ResourceGroup("sql-rg", {
  location: "eastus",
  tags: {
    project: "azure-sql-database",
    environment: "demo",
  },
});

// Create a SQL Server (logical server)
const sqlServer = await SqlServer("demo-sql-server", {
  resourceGroup: rg,

  // Administrator credentials (use secrets in production!)
  administratorLogin: "sqladmin",
  administratorPassword: alchemy.secret(
    process.env.SQL_ADMIN_PASSWORD || "P@ssw0rd!123SecurePassword",
  ),

  // Version
  version: "12.0", // Latest SQL Server version

  tags: {
    purpose: "sql-server",
  },
});

// Create a SQL Database
const database = await SqlDatabase("demo-db", {
  resourceGroup: rg,
  sqlServer: sqlServer,

  // Basic tier (cheapest option, ~$5/month)
  sku: "Basic",

  // Maximum database size
  maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB

  tags: {
    purpose: "application-database",
  },
});

// Output deployment information
console.log("\n✅ Azure SQL Database Deployed!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);
console.log(`   SQL Server: ${sqlServer.name}`);
console.log(`   Database: ${database.name}`);

console.log("\n🔐 Server Configuration:");
console.log(`   Server FQDN: ${sqlServer.fullyQualifiedDomainName}`);
console.log(`   Admin Login: ${sqlServer.administratorLogin}`);
console.log(`   Version: ${sqlServer.version}`);

console.log("\n💾 Database Configuration:");
console.log(`   SKU: ${database.sku}`);
if (database.maxSizeBytes) {
  console.log(`   Max Size: ${database.maxSizeBytes / (1024 * 1024 * 1024)} GB`);
}

console.log("\n🔌 Connection String:");
console.log(
  `   Server=${sqlServer.fullyQualifiedDomainName};Database=${database.name};User=${sqlServer.administratorLogin};Password=<your-password>;Encrypt=true;`,
);

console.log("\n📝 Connection Examples:");
console.log("\n   Node.js (mssql package):");
console.log(`   npm install mssql`);
console.log(`   const sql = require('mssql');`);
console.log(`   const config = {`);
console.log(`     server: '${sqlServer.fullyQualifiedDomainName}',`);
console.log(`     database: '${database.name}',`);
console.log(`     user: '${sqlServer.administratorLogin}',`);
console.log(`     password: process.env.SQL_PASSWORD,`);
console.log(`     options: { encrypt: true }`);
console.log(`   };`);
console.log(`   const pool = await sql.connect(config);`);

console.log("\n   Azure CLI:");
console.log(
  `   sqlcmd -S ${sqlServer.fullyQualifiedDomainName} -d ${database.name} -U ${sqlServer.administratorLogin} -P <password> -N -C`,
);

console.log("\n🔒 Security Notes:");
console.log("   ⚠️  Current firewall allows Azure services (0.0.0.0)");
console.log(
  "   ⚠️  For production, add specific IP ranges and remove 0.0.0.0",
);
console.log("   ✓ SSL/TLS encryption is enabled by default");
console.log("   ✓ Use Azure Key Vault for storing connection strings");

console.log("\n🛠️  Next Steps:");
console.log(`   1. Connect to your database using the connection string above`);
console.log(`   2. Create tables and schemas`);
console.log(`   3. Configure automatic backups (enabled by default)`);
console.log(`   4. Set up monitoring and alerts`);
console.log(`   5. Destroy infrastructure: bun ./alchemy.run --destroy`);

console.log("\n💡 Advanced Features:");
console.log("   - Automatic tuning and indexing");
console.log("   - Point-in-time restore (up to 35 days)");
console.log("   - Geo-replication for disaster recovery");
console.log("   - Query Performance Insights");
console.log("   - Automatic threat detection");

console.log("\n💰 Cost Estimate:");
console.log("   Basic Tier: ~$5/month");
console.log("   - 2 GB storage");
console.log("   - 5 DTUs (Database Transaction Units)");
console.log("   - Automatic backups included");

await app.finalize();

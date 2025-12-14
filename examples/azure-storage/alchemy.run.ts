import alchemy from "alchemy";
import {
  ResourceGroup,
  StorageAccount,
  BlobContainer,
  UserAssignedIdentity,
} from "alchemy/azure";

const app = await alchemy("azure-storage-example", {
  password: process.env.ALCHEMY_PASSWORD || "change-me-in-production",
});

const rg = await ResourceGroup("storage-demo", {
  location: "eastus",
  tags: {
    purpose: "storage-demo",
    environment: "development",
  },
});

console.log(`✓ Resource Group: ${rg.name}`);

const identity = await UserAssignedIdentity("storage-identity", {
  resourceGroup: rg,
  tags: {
    purpose: "storage-access",
  },
});

console.log(`✓ Managed Identity: ${identity.name}`);
console.log(`  Principal ID: ${identity.principalId}`);

const storage = await StorageAccount("storage", {
  resourceGroup: rg,
  sku: "Standard_LRS",
  accessTier: "Hot",
  allowBlobPublicAccess: false, // Public access disabled (default for security)
  minimumTlsVersion: "TLS1_2",
  tags: {
    purpose: "demo-storage",
  },
});

console.log(`✓ Storage Account: ${storage.name}`);
console.log(`  Blob Endpoint: ${storage.primaryBlobEndpoint}`);
console.log(`  File Endpoint: ${storage.primaryFileEndpoint}`);
console.log(`  Queue Endpoint: ${storage.primaryQueueEndpoint}`);
console.log(`  Table Endpoint: ${storage.primaryTableEndpoint}`);

const privateContainer = await BlobContainer("uploads", {
  storageAccount: storage,
  publicAccess: "None", // Private - no anonymous access
  metadata: {
    purpose: "user-uploads",
    retention: "30-days",
  },
});

console.log(`✓ Private Container: ${privateContainer.name}`);
console.log(`  URL: ${privateContainer.url}`);
console.log(`  Public Access: ${privateContainer.publicAccess}`);

// Note: Public blob access is often disabled at the subscription level for security
// If you need public access, you may need to request an exception from your Azure admin
const assetsContainer = await BlobContainer("assets", {
  storageAccount: storage,
  publicAccess: "None", // Private access (use SAS tokens or CDN for public serving)
  metadata: {
    purpose: "static-assets",
    cdn: "enabled",
  },
});

console.log(`✓ Assets Container: ${assetsContainer.name}`);
console.log(`  URL: ${assetsContainer.url}`);
console.log(`  Public Access: ${assetsContainer.publicAccess} (use SAS tokens for sharing)`);

const backupContainer = await BlobContainer("backups", {
  storageAccount: storage,
  publicAccess: "None",
  delete: false, // Don't delete this container when removed from Alchemy
  metadata: {
    purpose: "backups",
    retention: "90-days",
  },
});

console.log(`✓ Backup Container: ${backupContainer.name}`);
console.log(`  URL: ${backupContainer.url}`);
console.log(`  Preserved: true (delete: false)`);

const geoStorage = await StorageAccount("geo-storage", {
  resourceGroup: rg,
  sku: "Standard_GRS", // Geo-redundant storage
  accessTier: "Cool", // Cool tier for infrequently accessed data
  tags: {
    purpose: "critical-data",
    backup: "enabled",
  },
});

console.log(`✓ Geo-Redundant Storage: ${geoStorage.name}`);
console.log(`  SKU: ${geoStorage.sku}`);
console.log(`  Access Tier: ${geoStorage.accessTier}`);

const criticalContainer = await BlobContainer("critical", {
  storageAccount: geoStorage,
  publicAccess: "None",
  metadata: {
    criticality: "high",
    compliance: "required",
  },
});

console.log(`✓ Critical Container: ${criticalContainer.name}`);

console.log("\n" + "=".repeat(60));
console.log("Azure Storage Demo Deployed Successfully!");
console.log("=".repeat(60));
console.log(`\nResource Group: ${rg.name}`);
console.log(`Location: ${rg.location}`);
console.log(`\nStorage Accounts:`);
console.log(`  1. ${storage.name} (Standard_LRS, Hot)`);
console.log(`  2. ${geoStorage.name} (Standard_GRS, Cool)`);
console.log(`\nContainers:`);
console.log(`  - ${privateContainer.name} (Private)`);
console.log(`  - ${assetsContainer.name} (Private - use SAS tokens)`);
console.log(`  - ${backupContainer.name} (Private, Preserved)`);
console.log(`  - ${criticalContainer.name} (Private, Geo-redundant)`);
console.log(`\nTo upload files, run: bun run upload`);
console.log(`To destroy resources, run: bun alchemy.run.ts --destroy`);
console.log("=".repeat(60) + "\n");

await app.finalize();

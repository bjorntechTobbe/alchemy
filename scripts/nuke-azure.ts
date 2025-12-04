#!/usr/bin/env bun
/**
 * Azure Resource Nuke Script
 *
 * Cleans up all Azure resources created by Alchemy tests.
 * This script will delete all resource groups matching the BRANCH_PREFIX pattern.
 *
 * Usage:
 *   bun scripts/nuke-azure.ts              # Dry run - shows what would be deleted
 *   bun scripts/nuke-azure.ts --delete     # Actually delete resources
 *   bun scripts/nuke-azure.ts --prefix XXX # Use custom prefix (default: from BRANCH_PREFIX env var)
 *
 * Environment Variables:
 *   BRANCH_PREFIX - Prefix used for test resources (e.g., "tobbe")
 *   AZURE_SUBSCRIPTION_ID - Azure subscription ID
 *   AZURE_TENANT_ID - Azure tenant ID
 *   AZURE_CLIENT_ID - Azure client ID (for service principal)
 *   AZURE_CLIENT_SECRET - Azure client secret (for service principal)
 */

import { createAzureClients } from "../alchemy/src/azure/client.ts";

// Get configuration from environment or arguments
const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const prefixIndex = args.indexOf("--prefix");
const prefix =
  prefixIndex !== -1 && args[prefixIndex + 1]
    ? args[prefixIndex + 1]
    : process.env.BRANCH_PREFIX || process.env.USER || "test";

console.log("=".repeat(80));
console.log("Azure Resource Nuke Script");
console.log("=".repeat(80));
console.log(`Prefix: ${prefix}`);
console.log(`Mode: ${shouldDelete ? "DELETE" : "DRY RUN"}`);
console.log("=".repeat(80));
console.log("");

interface ResourceSummary {
  resourceGroups: string[];
  softDeletedCognitiveServices: Array<{
    name: string;
    location: string;
    deletionDate: string;
    resourceGroup?: string;
  }>;
  softDeletedKeyVaults: Array<{
    name: string;
    location: string;
    deletionDate: string;
  }>;
}

async function listResources(): Promise<ResourceSummary> {
  const clients = await createAzureClients();

  // 1. List all resource groups matching the prefix
  const resourceGroups: string[] = [];
  console.log("Scanning for resource groups...");
  for await (const rg of clients.resources.resourceGroups.list()) {
    if (rg.name && rg.name.startsWith(prefix)) {
      resourceGroups.push(rg.name);
    }
  }

  // 2. List soft-deleted Cognitive Services accounts
  const softDeletedCognitiveServices: Array<{
    name: string;
    location: string;
    deletionDate: string;
    resourceGroup?: string;
  }> = [];
  console.log("Scanning for soft-deleted Cognitive Services...");
  try {
    for await (const account of clients.cognitiveServices.deletedAccounts.list()) {
      if (account.name && account.name.startsWith(prefix)) {
        // Extract resource group from ID if available
        // Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}
        let resourceGroup: string | undefined;
        if (account.id) {
          const match = account.id.match(/resourceGroups\/([^\/]+)/i);
          if (match) {
            resourceGroup = match[1];
          }
        }
        
        softDeletedCognitiveServices.push({
          name: account.name,
          location: account.location || "unknown",
          deletionDate: account.properties?.deletionDate || "unknown",
          resourceGroup,
        });
      }
    }
  } catch (error: any) {
    // Some subscriptions may not have access to list deleted accounts
    console.log(
      `  ⚠️  Cannot list deleted Cognitive Services: ${error.message}`,
    );
  }

  // 3. List soft-deleted Key Vaults
  const softDeletedKeyVaults: Array<{
    name: string;
    location: string;
    deletionDate: string;
  }> = [];
  console.log("Scanning for soft-deleted Key Vaults...");
  try {
    for await (const vault of clients.keyVault.vaults.listDeleted()) {
      if (vault.name && vault.name.startsWith(prefix)) {
        softDeletedKeyVaults.push({
          name: vault.name,
          location: vault.properties?.location || "unknown",
          deletionDate: vault.properties?.deletionDate?.toString() || "unknown",
        });
      }
    }
  } catch (error: any) {
    console.log(`  ⚠️  Cannot list deleted Key Vaults: ${error.message}`);
  }

  return {
    resourceGroups,
    softDeletedCognitiveServices,
    softDeletedKeyVaults,
  };
}

async function deleteResources(summary: ResourceSummary) {
  const clients = await createAzureClients();

  console.log("\n" + "=".repeat(80));
  console.log("DELETING RESOURCES");
  console.log("=".repeat(80));

  // 1. Delete resource groups (this will cascade delete all contained resources)
  if (summary.resourceGroups.length > 0) {
    console.log(
      `\nDeleting ${summary.resourceGroups.length} resource groups...`,
    );
    const deletionPromises = summary.resourceGroups.map(async (rgName) => {
      try {
        console.log(`  🗑️  Deleting resource group: ${rgName}`);
        const poller =
          await clients.resources.resourceGroups.beginDelete(rgName);
        await poller.pollUntilDone();
        console.log(`  ✅ Deleted: ${rgName}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.log(`  ⚠️  Already deleted: ${rgName}`);
        } else {
          console.error(`  ❌ Error deleting ${rgName}: ${error.message}`);
        }
      }
    });

    await Promise.all(deletionPromises);
  }

  // 2. Purge soft-deleted Cognitive Services
  if (summary.softDeletedCognitiveServices.length > 0) {
    console.log(
      `\nPurging ${summary.softDeletedCognitiveServices.length} soft-deleted Cognitive Services...`,
    );
    const purgePromises = summary.softDeletedCognitiveServices.map(
      async (account) => {
        try {
          if (!account.resourceGroup) {
            console.log(
              `  ⚠️  Skipping ${account.name}: resource group not found (already purged?)`,
            );
            return;
          }
          
          console.log(
            `  🗑️  Purging Cognitive Service: ${account.name} (${account.location}, rg: ${account.resourceGroup})`,
          );
          const poller =
            await clients.cognitiveServices.deletedAccounts.beginPurge(
              account.location,
              account.resourceGroup,
              account.name,
            );
          await poller.pollUntilDone();
          console.log(`  ✅ Purged: ${account.name}`);
        } catch (error: any) {
          if (error.statusCode === 404) {
            console.log(`  ⚠️  Already purged: ${account.name}`);
          } else {
            console.error(
              `  ❌ Error purging ${account.name}: ${error.message}`,
            );
          }
        }
      },
    );

    await Promise.all(purgePromises);
  }

  // 3. Purge soft-deleted Key Vaults
  if (summary.softDeletedKeyVaults.length > 0) {
    console.log(
      `\nPurging ${summary.softDeletedKeyVaults.length} soft-deleted Key Vaults...`,
    );
    const purgePromises = summary.softDeletedKeyVaults.map(async (vault) => {
      try {
        console.log(
          `  🗑️  Purging Key Vault: ${vault.name} (${vault.location})`,
        );
        const poller = await clients.keyVault.vaults.beginPurgeDeleted(
          vault.name,
          vault.location,
        );
        await poller.pollUntilDone();
        console.log(`  ✅ Purged: ${vault.name}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.log(`  ⚠️  Already purged: ${vault.name}`);
        } else {
          console.error(`  ❌ Error purging ${vault.name}: ${error.message}`);
        }
      }
    });

    await Promise.all(purgePromises);
  }
}

function printSummary(summary: ResourceSummary) {
  console.log("\n" + "=".repeat(80));
  console.log("RESOURCE SUMMARY");
  console.log("=".repeat(80));

  // Resource Groups
  console.log(`\n📦 Resource Groups (${summary.resourceGroups.length}):`);
  if (summary.resourceGroups.length === 0) {
    console.log("  (none found)");
  } else {
    summary.resourceGroups.sort().forEach((rg) => {
      console.log(`  - ${rg}`);
    });
  }

  // Soft-deleted Cognitive Services
  console.log(
    `\n🧠 Soft-Deleted Cognitive Services (${summary.softDeletedCognitiveServices.length}):`,
  );
  if (summary.softDeletedCognitiveServices.length === 0) {
    console.log("  (none found)");
  } else {
    summary.softDeletedCognitiveServices.forEach((account) => {
      const rgInfo = account.resourceGroup ? `, rg: ${account.resourceGroup}` : ", rg: unknown";
      console.log(
        `  - ${account.name} (${account.location}${rgInfo}) - deleted: ${account.deletionDate}`,
      );
    });
  }

  // Soft-deleted Key Vaults
  console.log(
    `\n🔐 Soft-Deleted Key Vaults (${summary.softDeletedKeyVaults.length}):`,
  );
  if (summary.softDeletedKeyVaults.length === 0) {
    console.log("  (none found)");
  } else {
    summary.softDeletedKeyVaults.forEach((vault) => {
      console.log(
        `  - ${vault.name} (${vault.location}) - deleted: ${vault.deletionDate}`,
      );
    });
  }

  const totalResources =
    summary.resourceGroups.length +
    summary.softDeletedCognitiveServices.length +
    summary.softDeletedKeyVaults.length;

  console.log("\n" + "=".repeat(80));
  console.log(`Total resources to clean: ${totalResources}`);
  console.log("=".repeat(80));
}

// Main execution
async function main() {
  try {
    const summary = await listResources();
    printSummary(summary);

    const totalResources =
      summary.resourceGroups.length +
      summary.softDeletedCognitiveServices.length +
      summary.softDeletedKeyVaults.length;

    if (totalResources === 0) {
      console.log("\n✨ No resources found to clean!");
      return;
    }

    if (shouldDelete) {
      console.log("\n⚠️  WARNING: This will DELETE all listed resources!");
      console.log("⚠️  Press Ctrl+C within 5 seconds to cancel...\n");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await deleteResources(summary);

      console.log("\n" + "=".repeat(80));
      console.log("✅ CLEANUP COMPLETE");
      console.log("=".repeat(80));
    } else {
      console.log(
        "\n💡 This was a dry run. Use --delete flag to actually delete resources.",
      );
      console.log("   Example: bun scripts/nuke-azure.ts --delete\n");
    }
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ ERROR");
    console.error("=".repeat(80));
    console.error(error);
    process.exit(1);
  }
}

main();

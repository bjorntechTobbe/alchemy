# Azure Resource Cleanup (Nuke Script)

The `nuke-azure.ts` script provides automated cleanup of Azure resources created during Alchemy testing and development.

## Features

- **Resource Group Cleanup**: Deletes all resource groups matching your prefix (cascades to all contained resources)
- **Soft-Delete Purging**: Purges soft-deleted Cognitive Services accounts and Key Vaults
- **Dry Run Mode**: Preview what will be deleted before actually deleting
- **Parallel Deletion**: Efficiently deletes multiple resources concurrently
- **Safety Countdown**: 5-second countdown before actual deletion

## Usage

### 1. Dry Run (Preview)

See what resources would be deleted without actually deleting them:

```bash
bun run nuke:azure
```

Or directly:

```bash
bun scripts/nuke-azure.ts
```

### 2. Delete Resources

Actually delete the resources:

```bash
bun run nuke:azure -- --delete
```

Or directly:

```bash
bun scripts/nuke-azure.ts --delete
```

### 3. Custom Prefix

Use a custom prefix instead of the default `BRANCH_PREFIX`:

```bash
bun scripts/nuke-azure.ts --prefix my-custom-prefix
```

Or with deletion:

```bash
bun scripts/nuke-azure.ts --prefix my-custom-prefix --delete
```

## Environment Variables

The script requires Azure authentication. Set these environment variables:

```bash
# Required
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Optional - defaults to $USER if not set
BRANCH_PREFIX=tobbe
```

## What Gets Deleted

The script will clean up:

1. **Resource Groups** matching the prefix
   - All resources within these groups are automatically deleted (cascade deletion)
   - Includes: VMs, Storage Accounts, Networks, App Services, Databases, etc.

2. **Soft-Deleted Cognitive Services** accounts
   - Azure keeps deleted Cognitive Services for 48 hours
   - Script purges them permanently

3. **Soft-Deleted Key Vaults**
   - Azure keeps deleted Key Vaults for 90 days
   - Script purges them permanently

## Example Output

### Dry Run

```
================================================================================
Azure Resource Nuke Script
================================================================================
Prefix: tobbe
Mode: DRY RUN
================================================================================

Scanning for resource groups...
Scanning for soft-deleted Cognitive Services...
Scanning for soft-deleted Key Vaults...

================================================================================
RESOURCE SUMMARY
================================================================================

📦 Resource Groups (6):
  - tobbe-cdn-std-rg
  - tobbe-cdn-update-rg
  - tobbe-cosmos-create-rg
  - tobbe-cosmos-update-rg
  - tobbe-sa-create-rg
  - tobbe-sa-update-rg

🧠 Soft-Deleted Cognitive Services (3):
  - tobbe-cs-multi (eastus) - deleted: 2025-12-04T07:32:05Z
  - tobbe-cs-network (eastus) - deleted: 2025-12-04T07:32:05Z
  - tobbe-cs-update (eastus) - deleted: 2025-12-04T07:32:09Z

🔐 Soft-Deleted Key Vaults (5):
  - tobbe-kv-std (eastus) - deleted: Thu Dec 04 2025 08:38:57 GMT+0100
  - tobbe-kv-update (eastus) - deleted: Thu Dec 04 2025 08:38:57 GMT+0100
  - tobbe-kv-net (eastus) - deleted: Thu Dec 04 2025 08:38:56 GMT+0100
  - tobbe-kv-rbac (eastus) - deleted: Thu Dec 04 2025 08:38:55 GMT+0100
  - tobbe-kv-azure (eastus) - deleted: Thu Dec 04 2025 08:38:38 GMT+0100

================================================================================
Total resources to clean: 14
================================================================================

💡 This was a dry run. Use --delete flag to actually delete resources.
   Example: bun scripts/nuke-azure.ts --delete
```

### Actual Deletion

```
================================================================================
DELETING RESOURCES
================================================================================

Deleting 6 resource groups...
  🗑️  Deleting resource group: tobbe-cdn-std-rg
  🗑️  Deleting resource group: tobbe-cdn-update-rg
  🗑️  Deleting resource group: tobbe-cosmos-create-rg
  ✅ Deleted: tobbe-cdn-std-rg
  ✅ Deleted: tobbe-cdn-update-rg
  ✅ Deleted: tobbe-cosmos-create-rg
  ...

Purging 3 soft-deleted Cognitive Services...
  🗑️  Purging Cognitive Service: tobbe-cs-multi (eastus)
  🗑️  Purging Cognitive Service: tobbe-cs-network (eastus)
  ✅ Purged: tobbe-cs-multi
  ✅ Purged: tobbe-cs-network
  ...

Purging 5 soft-deleted Key Vaults...
  🗑️  Purging Key Vault: tobbe-kv-std (eastus)
  ✅ Purged: tobbe-kv-std
  ...

================================================================================
✅ CLEANUP COMPLETE
================================================================================
```

## Safety Features

1. **Dry Run by Default**: Must explicitly use `--delete` flag
2. **5-Second Countdown**: Time to cancel before deletion starts
3. **Error Handling**: Continues even if individual deletions fail
4. **Already Deleted Detection**: Handles 404 errors gracefully

## When to Use

- **After Testing**: Clean up test resources to avoid Azure charges
- **Before Testing**: Clear stale resources that might cause conflicts
- **Soft-Delete Issues**: Purge soft-deleted resources blocking new creation
- **Cost Management**: Regular cleanup to prevent resource accumulation

## Common Issues

### Cognitive Services "Already Exists" Error

If tests fail with "resource has been soft-deleted", run:

```bash
bun scripts/nuke-azure.ts --delete
```

This will purge the soft-deleted accounts so you can recreate them.

### Key Vault "Already Exists" Error

Same solution as Cognitive Services - purge soft-deleted Key Vaults:

```bash
bun scripts/nuke-azure.ts --delete
```

### CosmosDB "Exclusive Lock" Error

If CosmosDB tests fail with exclusive lock errors, delete the resource groups:

```bash
bun scripts/nuke-azure.ts --delete
```

Wait a few minutes for Azure to fully release the locks before retesting.

## Best Practices

1. **Run Dry Run First**: Always check what will be deleted
2. **Use Consistent Prefixes**: Stick to one prefix (e.g., your username)
3. **Clean Regularly**: Run after each test session to avoid accumulation
4. **Check Azure Portal**: Verify cleanup completed successfully
5. **Wait for Completion**: Give Azure a few minutes to fully delete resources

## Troubleshooting

### "Cannot list deleted accounts" Warning

Some Azure subscriptions don't have permission to list soft-deleted resources. This is normal and won't prevent cleanup of resource groups.

### Deletion Takes Long Time

Azure resource deletion is asynchronous and can take several minutes:
- Resource Groups: 2-5 minutes
- CosmosDB: 5-10 minutes  
- Key Vaults (purge): 1-2 minutes

### "Provisioning State" Errors

If resources are in a transitioning state, wait a few minutes and try again.

## Related Scripts

- `scripts/nuke.ts` - Cloudflare resource cleanup
- `scripts/nuke-azure.ts` - This script (Azure resource cleanup)

## Technical Details

The script uses the Azure SDK to:

1. List all resource groups matching the prefix
2. List all soft-deleted Cognitive Services
3. List all soft-deleted Key Vaults
4. Delete resource groups (cascade deletes all contained resources)
5. Purge soft-deleted resources to free up names

All deletions run in parallel for efficiency.

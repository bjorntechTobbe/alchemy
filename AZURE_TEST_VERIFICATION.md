# Azure Provider Test Verification

This document tracks end-to-end testing of the Azure provider following the Getting Started Guide.

**Test Date**: December 14, 2025  
**Tester**: bjorntechTobbe  
**Branch**: `azure-provider-implementation`

## Testing Methodology

For each resource:
1. ✅ Run the existing vitest test: `bun vitest alchemy/test/azure/{resource}.test.ts --run`
2. ✅ Verify resources exist in Azure Portal or via Azure CLI during test execution
3. ✅ Verify the test cleans up resources (tests use try/finally with destroy)
4. ✅ Double-check cleanup with Azure CLI after test completes
5. ✅ Document any issues, orphaned resources, or observations

## Prerequisites Verification

- [ ] Azure CLI installed (`az --version`)
- [ ] Azure CLI logged in (`az login`)
- [ ] Service Principal created
- [ ] `.env` file configured with:
  - `AZURE_SUBSCRIPTION_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
- [ ] Resource providers registered:
  - `Microsoft.Sql`
  - `Microsoft.CognitiveServices`

## Test Status Legend

- ✅ **Passed** - Resource creates, updates (if tested), deletes, and cleanup verified
- ⚠️ **Warning** - Works but has minor issues (documented below)
- ❌ **Failed** - Does not work as expected
- ⏸️ **Skipped** - Not tested yet
- 🚧 **In Progress** - Currently testing

---

## Infrastructure Resources

### ResourceGroup
**Status**: ✅ Passed  
**Priority**: High  
**Test File**: `alchemy/test/azure/resource-group.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/resource-group.test.ts --run
```

**Verify Cleanup**:
```bash
# Check for any orphaned resource groups with BRANCH_PREFIX
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 3/3 tests passed (30.9s)
  - create resource group
  - update resource group tags
  - resource group with default name
- Cleanup Verified: ✅ No orphaned resources
- Notes: All tests passed successfully. Resources were created, updated, and cleaned up properly. 

---

### StorageAccount
**Status**: ✅ Passed  
**Priority**: High  
**Test File**: `alchemy/test/azure/storage-account.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/storage-account.test.ts --run
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 5/5 tests passed (59.5s)
  - create storage account
  - update storage account tags
  - storage account with ZRS replication
  - storage account with GRS replication
  - storage account with access tier
- Cleanup Verified: ✅ No orphaned resources
- Notes: All tests passed. Storage accounts with different replication types and access tiers work correctly.

---

### BlobContainer
**Status**: ✅ Passed  
**Priority**: High  
**Test File**: `alchemy/test/azure/blob-container.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/blob-container.test.ts --run
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 2/2 tests passed (59.1s)
  - create blob container
  - update blob container metadata
- Cleanup Verified: ✅ No orphaned resources
- Notes: Blob containers create and update successfully. Metadata updates work as expected.

---

## Networking Resources

### VirtualNetwork
**Status**: ✅ Passed  
**Priority**: Medium  
**Test File**: `alchemy/test/azure/virtual-network.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/virtual-network.test.ts --run --test-timeout=300000
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 5/5 tests passed (56.8s)
  - create virtual network
  - update virtual network tags
  - virtual network with multiple subnets
  - virtual network with multiple address spaces
  - virtual network with subnet delegation
- Cleanup Verified: ✅ No orphaned resources
- Notes: Fixed bug where resourceGroup was stored as object instead of string in output.

---

### NetworkSecurityGroup
**Status**: ✅ Passed  
**Priority**: Medium  
**Test File**: `alchemy/test/azure/network-security-group.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/network-security-group.test.ts --run --test-timeout=300000
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 3/3 tests passed (41.9s)
  - create network security group
  - update network security group rules
  - network security group with security rules
- Cleanup Verified: ✅ No orphaned resources
- Notes: Fixed resourceGroup object storage bug.

---

### PublicIPAddress
**Status**: ✅ Passed  
**Priority**: Medium  
**Test File**: `alchemy/test/azure/public-ip-address.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/public-ip-address.test.ts --run --test-timeout=300000
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 3/3 tests passed (53.7s)
  - create public IP address
  - public IP address with DNS label
  - update public IP address tags
- Cleanup Verified: ✅ No orphaned resources
- Notes: Fixed resourceGroup object storage bug.

---

## Compute Resources

### AppService
**Status**: ⏸️  
**Priority**: High  
**Test Script**: `test-scripts/azure/07-app-service.ts`

**Verify in Azure**:
```bash
az webapp show --name <app-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### FunctionApp
**Status**: ⏸️  
**Priority**: High  
**Test Script**: `test-scripts/azure/08-function-app.ts`

**Verify in Azure**:
```bash
az functionapp show --name <function-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### StaticWebApp
**Status**: ✅ Passed  
**Priority**: High  
**Test File**: `alchemy/test/azure/static-web-app.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/static-web-app.test.ts --run --test-timeout=600000
```

**Verify Cleanup**:
```bash
az staticwebapp list --query "[?starts_with(name, '${BRANCH_PREFIX}')]" -o table
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
```

**Results**:
- Tests Passed: ✅ 3/3 tests passed (106.9s)
  - create static web app
  - update static web app tags
  - static web app with app settings
- Cleanup Verified: ✅ No orphaned resources
- Notes: Fixed to include buildProperties in envelope and handle 404 errors during deletion. Region must be eastus2 or other supported region (not eastus).

---

### ContainerInstance
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/10-container-instance.ts`

**Verify in Azure**:
```bash
az container show --name <container-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

## Database Resources

### CosmosDBAccount
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/11-cosmosdb-account.ts`

**Verify in Azure**:
```bash
az cosmosdb show --name <cosmos-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### SqlServer
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/12-sql-server.ts`

**Verify in Azure**:
```bash
az sql server show --name <server-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### SqlDatabase
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/13-sql-database.ts`

**Verify in Azure**:
```bash
az sql db show --name <db-name> --server <server-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

## Security & Identity Resources

### KeyVault
**Status**: ✅ Passed  
**Priority**: High  
**Test File**: `alchemy/test/azure/key-vault.test.ts`

**Run Test**:
```bash
bun vitest alchemy/test/azure/key-vault.test.ts --run --test-timeout=300000
```

**Verify Cleanup**:
```bash
az group list --query "[?starts_with(name, '${BRANCH_PREFIX}')].name" -o tsv
# Also check for soft-deleted vaults
bun run nuke:azure -- --delete
```

**Results**:
- Tests Passed: ✅ 5/5 tests passed (58.9s)
  - create key vault with standard SKU
  - update key vault tags
  - create key vault with RBAC authorization
  - create key vault with network restrictions
  - create key vault for Azure resources
- Cleanup Verified: ✅ No orphaned resources
- Notes: Fixed resourceGroup object storage bug. KeyVaults support soft-delete by default.

---

### UserAssignedIdentity
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/15-user-assigned-identity.ts`

**Verify in Azure**:
```bash
az identity show --name <identity-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

## AI & Messaging Resources

### CognitiveServices
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/16-cognitive-services.ts`

**Verify in Azure**:
```bash
az cognitiveservices account show --name <account-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### ServiceBus
**Status**: ⏸️  
**Priority**: Medium  
**Test Script**: `test-scripts/azure/17-service-bus.ts`

**Verify in Azure**:
```bash
az servicebus namespace show --name <namespace-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

## CDN Resources

### CDNProfile
**Status**: ⏸️  
**Priority**: Low  
**Test Script**: `test-scripts/azure/18-cdn-profile.ts`

**Verify in Azure**:
```bash
az cdn profile show --name <profile-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

### CDNEndpoint
**Status**: ⏸️  
**Priority**: Low  
**Test Script**: `test-scripts/azure/19-cdn-endpoint.ts`

**Verify in Azure**:
```bash
az cdn endpoint show --name <endpoint-name> --profile-name <profile-name> --resource-group <rg-name>
```

**Results**:
- Create: N/A
- Delete: N/A
- Cleanup Verified: N/A
- Notes:

---

## Example Projects

### azure-app-service
**Status**: ⏸️  
**Location**: `examples/azure-app-service/`

**Test**:
```bash
cd examples/azure-app-service
bun install
bun run alchemy.run.ts
```

**Results**:
- Deploy: N/A
- Access URL: N/A
- Cleanup: N/A
- Notes:

---

### azure-ai-services
**Status**: ⏸️  
**Location**: `examples/azure-ai-services/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

### azure-container-firewall
**Status**: ⏸️  
**Location**: `examples/azure-container-firewall/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

### azure-function-app
**Status**: ⏸️  
**Location**: `examples/azure-function-app/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

### azure-sql-database
**Status**: ⏸️  
**Location**: `examples/azure-sql-database/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

### azure-static-web-app
**Status**: ⏸️  
**Location**: `examples/azure-static-web-app/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

### azure-storage
**Status**: ⏸️  
**Location**: `examples/azure-storage/`

**Results**:
- Deploy: N/A
- Cleanup: N/A
- Notes:

---

## Summary

**Total Resources**: 20  
**Tested**: 0  
**Passed**: 0  
**Failed**: 0  
**Warnings**: 0  
**Skipped**: 20

**Example Projects**: 8  
**Tested**: 0  
**Working**: 0  
**Failed**: 0

---

## Known Issues

*None yet - will document as we test*

---

## Testing Notes

*Will document observations, gotchas, and improvements as we test*

---

## Next Steps

1. Create test scripts directory structure
2. Start with high-priority resources (Infrastructure & Compute)
3. Test each resource one by one
4. Update this document after each test
5. Fix any issues found
6. Verify all example projects
7. Create Pull Request once all tests pass

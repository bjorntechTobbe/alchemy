# Azure Test Guide: Cost & Cleanup Analysis

## ✅ Safe & Low-Cost Tests (Recommended for CI/CD)

These tests are **safe to run**, have **minimal costs**, and **clean up automatically**:

### 1. Foundation Tests (FREE - No ongoing costs)
- ✅ **ResourceGroup** - Free resource, easy cleanup
- ✅ **UserAssignedIdentity** - Free resource, easy cleanup

**Cost:** $0  
**Cleanup:** Automatic via `destroy(scope)`, no soft-delete complications  
**Risk:** None

### 2. Networking Tests (FREE - No data transfer)
- ✅ **VirtualNetwork** - Free resource (no VMs attached)
- ✅ **NetworkSecurityGroup** - Free resource (no traffic)
- ✅ **PublicIPAddress** - **~$0.004/hour** ($0.10/day), only when allocated

**Cost:** ~$0.10/day max  
**Cleanup:** Automatic, no dependencies  
**Risk:** Low - NSGs and VNets are easy to delete

### 3. Storage Tests (Very Low Cost)
- ✅ **StorageAccount** - ~$0.02/month for LRS
- ✅ **BlobContainer** - No additional cost (storage account cost only)

**Cost:** ~$0.02/month (negligible for test duration)  
**Cleanup:** Automatic, deletes all blobs inside  
**Risk:** Low - storage accounts delete cleanly

**Note:** Avoid creating large blobs during tests to keep costs minimal.

---

## ⚠️ Medium Cost Tests (Run with Caution)

These have **moderate costs** but **clean up properly**:

### 4. Compute Tests (Consumption Tier = Pay-per-use)
- ⚠️ **FunctionApp** (Consumption plan) - ~$0.20/million executions + ~$0.016/GB-s
- ⚠️ **StaticWebApp** (Free tier) - Free for first app, $0.10/app/day after
- ⚠️ **AppService** (Free/Basic tier) - Free tier available, Basic ~$13/month

**Cost:** 
- FunctionApp Consumption: ~$0.01-0.10/day (if minimal invocations)
- StaticWebApp Free: $0
- AppService Free: $0

**Cleanup:** Automatic  
**Recommendation:** 
- ✅ Use **Consumption plan** for FunctionApp (pay-per-use)
- ✅ Use **Free tier** for StaticWebApp (first one is free)
- ✅ Use **Free tier (F1)** for AppService
- ⚠️ Avoid Premium plans in tests

### 5. Database Tests (Depends on Tier)
- ⚠️ **CosmosDB** - **Serverless mode**: ~$0.25/million RUs + $0.25/GB/month
- ⚠️ **SqlServer + SqlDatabase** - Basic tier ~$5/month, serverless vCore available

**Cost:**
- CosmosDB Serverless: ~$0.01/day (if no queries)
- SQL Basic: ~$0.17/day (~$5/month)

**Cleanup:** Automatic  
**Recommendation:**
- ✅ Use **serverless mode** for CosmosDB (pay-per-request)
- ✅ Use **Basic tier** for SQL Database (S0 is ~$15/month, avoid in CI)
- ⚠️ SQL Database tests should be **optional** or **run manually**

---

## ❌ High Cost / Difficult Cleanup Tests (Avoid in CI)

These tests should be **run manually** or **skipped** in automated testing:

### 6. CDN Tests (Expensive & Global Distribution)
- ❌ **CDN Profile** - Standard_Microsoft ~$0.081/GB + $0.0075/10k requests
- ❌ **CDN Endpoint** - Same as profile

**Cost:** ~$0.10-1.00/day depending on traffic  
**Cleanup:** Automatic but slow (can take 5-10 minutes)  
**Recommendation:** ⚠️ **Skip in CI** - run manually for release testing only

### 7. Cognitive Services Tests (Charged per API call)
- ❌ **CognitiveServices** - Free tier available but limited (5,000 transactions/month)
- Standard tier: $1-15 per 1,000 transactions depending on service

**Cost:** $0 with F0 tier, but quota limited  
**Cleanup:** Automatic  
**Recommendation:** 
- ✅ Use **F0 (free tier)** for testing
- ⚠️ Be careful not to exceed free tier limits
- ⚠️ **Skip in CI** or use mock tests

### 8. Service Bus Tests (Depends on Tier)
- ⚠️ **ServiceBus** - Basic tier ~$0.05/million operations
- Standard tier ~$0.10 base + $0.80/million operations
- Premium tier ~$667/month (dedicated)

**Cost:** 
- Basic: ~$0.01/day (if minimal operations)
- Standard: ~$0.10/day
- Premium: **Very expensive** - avoid!

**Cleanup:** Automatic  
**Recommendation:**
- ✅ Use **Basic tier** for tests
- ❌ **Never use Premium tier** in automated tests

### 9. Key Vault Tests (Low cost but soft-delete complication)
- ⚠️ **KeyVault** - ~$0.03/10k operations, very low cost
- **Problem:** Soft-delete means deleted vaults are retained for 7-90 days
- Can hit quota limits (default: 25 vaults per region per subscription)

**Cost:** ~$0.01/day  
**Cleanup:** ⚠️ **Requires purge** after soft-delete  
**Recommendation:**
- ✅ Safe to run, but monitor vault quota
- ⚠️ May need manual purge: `az keyvault purge --name vault-name`
- ⚠️ Tests should disable soft-delete or purge in cleanup

### 10. Container Instance Tests (Per-second billing)
- ⚠️ **ContainerInstance** - ~$0.0000125/vCPU-second + $0.0000014/GB-second
- Example: 1 vCPU, 1.5GB for 1 hour = ~$0.05

**Cost:** ~$0.05-0.10/hour (only while running)  
**Cleanup:** Automatic  
**Recommendation:**
- ✅ Safe if containers are **deleted quickly** (< 5 minutes)
- ⚠️ Ensure tests complete and cleanup within 5-10 minutes

---

## 📋 Recommended Test Strategy

### CI/CD Pipeline (Automated)

**Always Run (FREE or < $0.10/day):**
```bash
# Foundation (FREE)
bun vitest alchemy/test/azure/resource-group.test.ts
bun vitest alchemy/test/azure/user-assigned-identity.test.ts

# Networking (FREE to $0.10/day)
bun vitest alchemy/test/azure/virtual-network.test.ts
bun vitest alchemy/test/azure/network-security-group.test.ts
bun vitest alchemy/test/azure/public-ip-address.test.ts

# Storage (< $0.01/day)
bun vitest alchemy/test/azure/storage-account.test.ts
bun vitest alchemy/test/azure/blob-container.test.ts
```

**Optional (< $0.50/day if consumption/free tiers):**
```bash
# Compute - Free/Consumption tiers only
bun vitest alchemy/test/azure/function-app.test.ts
bun vitest alchemy/test/azure/static-web-app.test.ts
bun vitest alchemy/test/azure/app-service.test.ts  # Use F1 Free tier

# Container - Fast cleanup
bun vitest alchemy/test/azure/container-instance.test.ts
```

### Manual/Release Testing Only

**Expensive or Complex Cleanup:**
```bash
# Database tests (run manually before release)
bun vitest alchemy/test/azure/cosmosdb-account.test.ts      # Use serverless
bun vitest alchemy/test/azure/sql-database.test.ts          # Expensive

# CDN tests (slow cleanup, moderate cost)
bun vitest alchemy/test/azure/cdn-profile.test.ts
bun vitest alchemy/test/azure/cdn-endpoint.test.ts

# AI/Messaging tests (quota limits or cost)
bun vitest alchemy/test/azure/cognitive-services.test.ts    # Free tier limits
bun vitest alchemy/test/azure/service-bus.test.ts           # Use Basic tier
bun vitest alchemy/test/azure/key-vault.test.ts             # Soft-delete quota
```

---

## 🛡️ Safety Checklist

Before running tests:

1. **Set Test Timeout** - Ensure tests timeout and cleanup runs:
   ```typescript
   test.setTimeout(600000); // 10 minutes max per test
   ```

2. **Verify Cleanup in Finally Block** - All tests use:
   ```typescript
   try {
     // test logic
   } finally {
     await destroy(scope); // Always runs
     await assertResourceDoesNotExist(); // Verify cleanup
   }
   ```

3. **Use Unique Prefixes** - Tests use `BRANCH_PREFIX` to avoid conflicts:
   ```typescript
   const BRANCH_PREFIX = "test-main"; // Different per branch
   ```

4. **Monitor Costs** - Set up Azure Cost Management alerts:
   - Alert when daily cost > $1
   - Alert when monthly cost > $10

5. **Resource Quotas** - Be aware of limits:
   - Key Vaults: 25 per region (soft-delete quota)
   - Storage Accounts: 250 per subscription
   - CDN: 25 profiles per subscription

---

## 💰 Cost Estimates

### Safe Daily Test Run (All safe tests):
- Resource Groups: $0
- Identities: $0
- Networking: $0.10
- Storage: $0.01
- **Total: ~$0.11/day** ✅

### Full Test Run (Including expensive tests):
- Safe tests: $0.11
- Compute (Consumption): $0.10
- Databases (Serverless/Basic): $0.20
- CDN: $0.50
- AI/Messaging: $0.10
- Containers: $0.05
- **Total: ~$1.06/day** ⚠️

### Recommendation:
- **CI/CD**: Run only safe tests (~$0.11/day = ~$3/month)
- **Pre-release**: Run all tests manually (~$1/day when needed)
- **Cost Savings**: ~$30/month by avoiding expensive tests in CI

---

## 🧹 Cleanup Best Practices

### Automatic Cleanup (Built-in to tests)
All tests use this pattern:
```typescript
try {
  // Create resources
} finally {
  await destroy(scope); // Automatic cleanup
  await assertResourceDoesNotExist(); // Verification
}
```

### Manual Cleanup (If tests fail)

**List all test resource groups:**
```bash
az group list --query "[?starts_with(name, 'test-')]" -o table
```

**Delete all test resource groups:**
```bash
az group list --query "[?starts_with(name, 'test-')].name" -o tsv | \
  xargs -I {} az group delete --name {} --yes --no-wait
```

**Purge soft-deleted Key Vaults:**
```bash
az keyvault list-deleted --query "[?starts_with(name, 'test-')].name" -o tsv | \
  xargs -I {} az keyvault purge --name {}
```

**Check for orphaned resources:**
```bash
# List all resources with test prefix
az resource list --query "[?starts_with(name, 'test-')]" -o table
```

---

## 🎯 Recommended Test Commands

### Safe CI/CD Tests (< $0.15/day)
```bash
# Run only safe, free/low-cost tests
bun vitest alchemy/test/azure/resource-group.test.ts \
           alchemy/test/azure/user-assigned-identity.test.ts \
           alchemy/test/azure/virtual-network.test.ts \
           alchemy/test/azure/network-security-group.test.ts \
           alchemy/test/azure/public-ip-address.test.ts \
           alchemy/test/azure/storage-account.test.ts \
           alchemy/test/azure/blob-container.test.ts
```

### Full Test Suite (Manual - ~$1/day)
```bash
# Run all tests (only before releases)
bun vitest alchemy/test/azure/
```

### Specific Resource Test
```bash
# Test a single resource
bun vitest alchemy/test/azure/function-app.test.ts
```

---

## Summary

**✅ Safe for CI/CD (7 test suites):**
- ResourceGroup, UserAssignedIdentity
- VirtualNetwork, NetworkSecurityGroup, PublicIPAddress
- StorageAccount, BlobContainer

**⚠️ Optional/Manual (11 test suites):**
- FunctionApp, StaticWebApp, AppService (use free tiers)
- CosmosDB, SqlDatabase (use serverless/basic)
- CDN, CognitiveServices, ServiceBus, KeyVault, ContainerInstance

**Cost:** $0.11/day for safe tests, ~$1/day for all tests

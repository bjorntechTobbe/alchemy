import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { StorageAccount } from "../../alchemy/src/azure/storage-account.ts";
import { FunctionApp } from "../../alchemy/src/azure/function-app.ts";

/**
 * Azure Function App Example
 * 
 * This example demonstrates how to deploy a serverless Azure Function App with:
 * - A storage account (required for Azure Functions)
 * - A consumption-based function app (serverless, pay-per-execution)
 * - An HTTP-triggered function that responds to requests
 * 
 * The function responds to HTTP GET/POST requests at:
 * https://{function-app-name}.azurewebsites.net/api/httpTrigger
 * 
 * Try it with:
 * - curl https://{url}/api/httpTrigger?name=Alchemy
 * - curl -X POST https://{url}/api/httpTrigger -d "Azure"
 */

const app = await alchemy("azure-function-app");

// Create a resource group to contain all resources
const rg = await ResourceGroup("function-rg", {
  location: "eastus",
  tags: {
    project: "azure-function-app",
    environment: "demo",
  },
});

// Create a storage account (required for Azure Functions)
const storage = await StorageAccount("functionstorage", {
  resourceGroup: rg,
  sku: "Standard_LRS", // Locally redundant storage
  kind: "StorageV2",
  tags: {
    purpose: "function-storage",
  },
});

// Deploy the Function App infrastructure
const functionApp = await FunctionApp("my-function", {
  resourceGroup: rg,
  storageAccount: storage,
  
  // Runtime configuration
  runtime: "node",
  runtimeVersion: "20",
  
  // Consumption plan (serverless, pay-per-execution)
  sku: "Y1",
  
  // HTTPS only for security
  httpsOnly: true,
  
  tags: {
    app: "http-function",
    purpose: "serverless-api",
  },
});

// Output deployment information
console.log("\n✅ Function App Infrastructure Deployed!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);
console.log(`   Storage Account: ${storage.name}`);
console.log(`   Function App: ${functionApp.name}`);

console.log("\n🌐 Function URL:");
console.log(`   ${functionApp.url}`);
console.log(`   Hostname: ${functionApp.defaultHostname}`);

console.log("\n⚙️  Function Details:");
console.log(`   Runtime: Node.js ${functionApp.runtimeVersion || "20"}`);
console.log(`   Plan: ${functionApp.sku} (Consumption/Serverless)`);
console.log(`   HTTPS Only: ${functionApp.httpsOnly}`);

console.log("\n📦 Deploy Your Function Code:");
console.log("   Option 1 - Azure CLI:");
console.log(`   cd examples/azure-function-app`);
console.log(`   az functionapp deployment source config-zip --resource-group ${rg.name} --name ${functionApp.name} --src <zip-file>`);
console.log("\n   Option 2 - Azure Functions Core Tools:");
console.log(`   cd examples/azure-function-app`);
console.log(`   func azure functionapp publish ${functionApp.name}`);
console.log("\n   Option 3 - VS Code:");
console.log(`   Use the Azure Functions extension to deploy`);

console.log("\n🧪 After Deployment, Test With:");
console.log(`   curl "https://${functionApp.defaultHostname}/api/httpTrigger?name=Alchemy"`);
console.log(`   curl -X POST "https://${functionApp.defaultHostname}/api/httpTrigger" -d "Azure"`);

console.log("\n💡 Next Steps:");
console.log(`   1. Deploy your function code using one of the methods above`);
console.log(`   2. View logs: az functionapp log tail --name ${functionApp.name} --resource-group ${rg.name}`);
console.log(`   3. Destroy infrastructure: bun ./alchemy.run --destroy`);

await app.finalize();

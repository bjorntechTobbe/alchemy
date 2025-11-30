import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { AppService } from "../../alchemy/src/azure/app-service.ts";

/**
 * Azure App Service Example
 *
 * This example demonstrates how to deploy a web application to Azure App Service:
 * - Managed web hosting platform (PaaS)
 * - Automatic scaling and load balancing
 * - Built-in CI/CD integration
 * - Custom domains and SSL certificates
 * - Application insights and monitoring
 *
 * Azure App Service is equivalent to:
 * - AWS Elastic Beanstalk
 * - Google App Engine
 * - Heroku
 *
 * Perfect for:
 * - Web applications (Node.js, Python, .NET, Java, PHP)
 * - RESTful APIs
 * - Mobile backends
 * - Microservices
 */

const app = await alchemy("azure-app-service", {
  password: process.env.ALCHEMY_PASSWORD || "change-me-in-production",
});

const rg = await ResourceGroup("webapp-rg", {
  location: "eastus",
  tags: {
    project: "azure-app-service",
    environment: "demo",
  },
});

// Deploy a Node.js web application
const webApp = await AppService("my-webapp", {
  resourceGroup: rg,

  // Runtime configuration
  runtime: "node",
  runtimeVersion: "20-lts",

  // App Service Plan (pricing tier)
  sku: "F1", // Free tier - perfect for development and testing

  // Enable HTTPS only for security
  httpsOnly: true,

  // Application settings (environment variables)
  appSettings: {
    NODE_ENV: "production",
    WEBSITE_NODE_DEFAULT_VERSION: "~20",
  },

  tags: {
    app: "web-application",
    purpose: "demo",
  },
});

console.log("\n✅ App Service Deployed!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);
console.log(`   App Service: ${webApp.name}`);

console.log("\n🌐 URLs:");
console.log(`   Default URL: https://${webApp.defaultHostname}`);
if (webApp.url) {
  console.log(`   App URL: ${webApp.url}`);
}

console.log("\n⚙️  Configuration:");
console.log(`   Runtime: Node.js ${webApp.runtimeVersion || "20-lts"}`);
console.log(`   Plan: ${webApp.sku} (Free Tier)`);
console.log(`   HTTPS Only: ${webApp.httpsOnly}`);

console.log("\n📦 Deploy Your Application:");
console.log("   Option 1 - Azure CLI (from a local directory):");
console.log(`   cd your-app-directory`);
console.log(
  `   az webapp up --resource-group ${rg.name} --name ${webApp.name} --runtime "NODE:20-lts"`,
);

console.log("\n   Option 2 - Git deployment:");
console.log(`   cd your-app-directory`);
console.log(`   git init`);
console.log(
  `   az webapp deployment source config-local-git --resource-group ${rg.name} --name ${webApp.name}`,
);
console.log(`   git remote add azure <git-url-from-above-command>`);
console.log(`   git add . && git commit -m "Initial commit"`);
console.log(`   git push azure main`);

console.log("\n   Option 3 - ZIP deployment:");
console.log(`   cd your-app-directory`);
console.log(`   zip -r app.zip .`);
console.log(
  `   az webapp deployment source config-zip --resource-group ${rg.name} --name ${webApp.name} --src app.zip`,
);

console.log("\n   Option 4 - GitHub Actions (Recommended for CI/CD):");
console.log(`   1. Connect your GitHub repository in Azure Portal`);
console.log(`   2. Azure will generate a GitHub Actions workflow`);
console.log(`   3. Push code to trigger automatic deployments`);

console.log("\n✨ App Service Features:");
console.log("   ✓ Automatic scaling");
console.log("   ✓ Built-in load balancing");
console.log("   ✓ Custom domains and SSL");
console.log("   ✓ Deployment slots (staging/production)");
console.log("   ✓ Application Insights monitoring");
console.log("   ✓ Authentication/Authorization");
console.log("   ✓ Virtual Network integration");

console.log("\n💰 Pricing:");
console.log("   Free (F1) Tier:");
console.log("   - 1 GB RAM, 1 GB storage");
console.log("   - 60 minutes/day compute");
console.log("   - Perfect for development and testing");
console.log("\n   Production tiers: Basic (B1), Standard (S1), Premium (P1V2)");

console.log("\n💡 Next Steps:");
console.log(`   1. Deploy your application using one of the methods above`);
console.log(
  `   2. View logs: az webapp log tail --resource-group ${rg.name} --name ${webApp.name}`,
);
console.log(
  `   3. Configure custom domain (optional): az webapp config hostname add`,
);
console.log(`   4. Destroy infrastructure: bun ./alchemy.run --destroy`);

console.log("\n🧪 Example Application:");
console.log("   Create a simple Node.js app:");
console.log("   1. mkdir my-app && cd my-app");
console.log("   2. npm init -y");
console.log("   3. npm install express");
console.log("   4. Create index.js:");
console.log(`      const express = require('express');`);
console.log(`      const app = express();`);
console.log(`      app.get('/', (req, res) => res.send('Hello from Azure!'));`);
console.log(`      app.listen(process.env.PORT || 3000);`);
console.log("   5. Deploy using one of the methods above");

await app.finalize();

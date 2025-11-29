import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { StaticWebApp } from "../../alchemy/src/azure/static-web-app.ts";

/**
 * Azure Static Web App Example
 * 
 * This example demonstrates how to deploy a static website to Azure with:
 * - Global CDN distribution
 * - Automatic HTTPS
 * - Custom domains support
 * - Built-in authentication
 * 
 * Azure Static Web Apps is perfect for:
 * - Static sites (HTML, CSS, JS)
 * - Single Page Applications (React, Vue, Angular)
 * - Jamstack applications
 * - Documentation sites
 * 
 * Equivalent to Cloudflare Pages, Vercel, Netlify
 */

const app = await alchemy("azure-static-web-app", {
  password: process.env.ALCHEMY_PASSWORD || "change-me-in-production",
});

// Create a resource group
const rg = await ResourceGroup("webapp-rg", {
  location: "eastus2",
  tags: {
    project: "azure-static-web-app",
    environment: "demo",
  },
});

// Deploy the static web app
const webapp = await StaticWebApp("my-site", {
  resourceGroup: rg,
  
  // Free tier (perfect for getting started)
  sku: "Free",
  
  // Optional: Configure branch for deployment
  // repositoryUrl: "https://github.com/yourusername/your-repo",
  // branch: "main",
  
  tags: {
    app: "static-site",
    purpose: "demo",
  },
});

// Output deployment information
console.log("\n✅ Static Web App Deployed!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);
console.log(`   Static Web App: ${webapp.name}`);

console.log("\n🌐 URL:");
console.log(`   ${webapp.defaultHostname}`);

console.log("\n📦 Deploy Your Site Content:");
console.log("   Azure Static Web Apps can be deployed in two ways:");
console.log("\n   Option 1 - GitHub Actions (Recommended):");
console.log("   1. Push your code to GitHub");
console.log("   2. Configure repository in Azure Portal:");
console.log(`      - Go to ${webapp.defaultHostname}`);
console.log("      - Navigate to 'Deployment' → 'GitHub Actions'");
console.log("      - Authorize and select your repository");
console.log("   3. Azure will automatically set up CI/CD with GitHub Actions");
console.log("\n   Option 2 - Azure CLI:");
console.log(`   az staticwebapp create \\`);
console.log(`     --name ${webapp.name} \\`);
console.log(`     --resource-group ${rg.name} \\`);
console.log(`     --source ./public \\`);
console.log(`     --location ${rg.location}`);
console.log("\n   Option 3 - Static Web Apps CLI:");
console.log("   npm install -g @azure/static-web-apps-cli");
console.log(`   swa deploy ./public --deployment-token <token>`);

console.log("\n✨ Features:");
console.log("   ✓ Global CDN distribution");
console.log("   ✓ Automatic HTTPS");
console.log("   ✓ Custom domains");
console.log("   ✓ Built-in authentication");
console.log("   ✓ Serverless API functions");
console.log("   ✓ Staging environments");

console.log("\n💰 Pricing:");
console.log("   Free Tier:");
console.log("   - 100GB bandwidth/month");
console.log("   - Custom domains");
console.log("   - Automatic SSL");
console.log("   - Perfect for personal projects and demos");

console.log("\n💡 Next Steps:");
console.log("   1. Get deployment token from Azure Portal");
console.log("   2. Deploy your site content using one of the methods above");
console.log("   3. Configure custom domain (optional)");
console.log("   4. Destroy infrastructure: bun ./alchemy.run --destroy");

await app.finalize();

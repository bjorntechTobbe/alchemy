# Azure Static Web App Example

This example demonstrates how to deploy a static website to Azure Static Web Apps using Alchemy.

## What This Example Shows

- **Static Web App**: Globally distributed static site hosting
- **Free Tier**: 100GB bandwidth/month at no cost
- **Global CDN**: Content delivered from Azure's worldwide network
- **Automatic HTTPS**: SSL certificates automatically provisioned

## Architecture

```
User → Azure CDN (Global) → Static Web App → Static Content
                                          ↓
                                   Optional API Functions
```

## Prerequisites

- Azure CLI installed and logged in (`az login`)
- Node.js or Bun installed
- (Optional) GitHub account for continuous deployment

## Quick Start

### 1. Deploy Infrastructure

```bash
cd examples/azure-static-web-app
bun install
bun ./alchemy.run.ts
```

This creates:
- Resource Group
- Static Web App (with global CDN)

### 2. Deploy Your Site Content

Azure Static Web Apps supports multiple deployment methods:

#### Option A: GitHub Actions (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo
   git push -u origin main
   ```

2. **Configure in Azure Portal**:
   - Navigate to your Static Web App in Azure Portal
   - Go to "Deployment" → "GitHub Actions"
   - Authorize Azure to access your GitHub
   - Select your repository and branch
   - Azure automatically creates a GitHub Actions workflow

3. **Automatic deployments**:
   - Every push to your branch triggers a new deployment
   - Pull requests get staging environments automatically

#### Option B: Azure CLI

```bash
az staticwebapp create \
  --name <your-app-name> \
  --resource-group <your-rg-name> \
  --source ./public \
  --location eastus2
```

#### Option C: Static Web Apps CLI

```bash
# Install the CLI
npm install -g @azure/static-web-apps-cli

# Get deployment token from Azure Portal
# Navigate to: Static Web App → Manage deployment token

# Deploy
swa deploy ./public --deployment-token <your-token>
```

### 3. Visit Your Site

After deployment, your site will be available at:
```
https://<your-app-name>.azurestaticapps.net
```

## Included Example Site

The `public/index.html` file contains a beautiful example landing page showcasing:
- Responsive design
- Modern CSS with gradients
- Feature highlights
- Real-time information display

## Features

### ✅ What's Included (Free Tier)

- **100GB bandwidth/month** - Plenty for most projects
- **Global CDN** - Content distributed worldwide
- **Automatic HTTPS** - SSL certificates managed automatically
- **Custom domains** - Add your own domain for free
- **Staging environments** - Pull request previews
- **Built-in authentication** - Social login providers
- **Serverless APIs** - Add API functions with Azure Functions

### 🚀 Perfect For

- Personal websites and portfolios
- Documentation sites
- Marketing pages
- Single Page Applications (React, Vue, Angular)
- Jamstack applications
- Static site generators (Next.js, Gatsby, Hugo, etc.)

## Adding API Functions

You can add serverless API functions to your static web app:

```bash
# Create API directory
mkdir api

# Add a function (example: api/hello/index.js)
export default async function (context, req) {
  return {
    body: JSON.stringify({ message: "Hello from API!" })
  };
}
```

APIs are automatically available at:
```
https://<your-app-name>.azurestaticapps.net/api/hello
```

## Custom Domains

1. Navigate to your Static Web App in Azure Portal
2. Go to "Custom domains"
3. Click "Add" and follow the instructions
4. Add a CNAME record to your DNS:
   ```
   CNAME: www → <your-app-name>.azurestaticapps.net
   ```
5. Azure automatically provisions SSL certificate

## Authentication

Enable built-in authentication:

```json
// staticwebapp.config.json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "clientIdSettingName": "AZURE_CLIENT_ID",
          "clientSecretSettingName": "AZURE_CLIENT_SECRET"
        }
      }
    }
  },
  "routes": [
    {
      "route": "/admin/*",
      "allowedRoles": ["authenticated"]
    }
  ]
}
```

Supported providers:
- Azure Active Directory
- GitHub
- Twitter
- Google (via custom OpenID)

## Pricing

### Free Tier (Perfect for getting started)
- **Bandwidth**: 100GB/month
- **Storage**: 0.5GB
- **API Requests**: 0 (no Functions included, but APIs can be added)
- **Custom Domains**: ✅ Unlimited
- **SSL**: ✅ Automatic
- **Cost**: **$0/month**

### Standard Tier
- **Bandwidth**: $0.20 per GB
- **More resources** for larger applications
- Starting at **~$9/month**

## View Logs

```bash
# Stream deployment logs
az staticwebapp logs show \
  --name <your-app-name> \
  --resource-group <your-rg-name>
```

## Clean Up

```bash
bun ./alchemy.run.ts --destroy
```

This removes all resources and stops any charges.

## Comparison with Other Platforms

| Feature | Azure Static Web Apps | Cloudflare Pages | Vercel | Netlify |
|---------|----------------------|------------------|---------|---------|
| Free Bandwidth | 100GB | Unlimited | 100GB | 100GB |
| Free Build Minutes | Unlimited | 500/month | 6000/month | 300/month |
| Custom Domains | ✅ | ✅ | ✅ | ✅ |
| Auto SSL | ✅ | ✅ | ✅ | ✅ |
| Edge Functions | ✅ | ✅ | ✅ | ✅ |
| Built-in Auth | ✅ | ❌ | ❌ | ✅ |

## Next Steps

- Add API functions for dynamic content
- Configure custom domain
- Set up GitHub Actions CI/CD
- Enable authentication for protected pages
- Add Application Insights for monitoring

## Learn More

- [Azure Static Web Apps Documentation](https://learn.microsoft.com/azure/static-web-apps/)
- [Azure Static Web Apps Pricing](https://azure.microsoft.com/pricing/details/app-service/static/)
- [Alchemy Azure Provider](../../alchemy/src/azure/)

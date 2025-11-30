# Azure App Service Example

This example demonstrates how to deploy a web application to Azure App Service using Alchemy.

## What You'll Deploy

- **Resource Group**: Container for all resources
- **App Service**: Managed web hosting platform with Node.js runtime

## Prerequisites

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up Azure credentials:
   ```bash
   # Login to Azure CLI
   az login
   
   # Set your subscription (if you have multiple)
   az account set --subscription "your-subscription-id"
   ```

3. Set Alchemy password (for state encryption):
   ```bash
   export ALCHEMY_PASSWORD="your-secure-password"
   ```

## Deploy

Deploy the App Service infrastructure:

```bash
bun deploy
```

## Deploy Your Application

After the infrastructure is created, deploy your application code using one of these methods:

### Option 1: ZIP Deployment (Quickest)

```bash
cd your-app-directory
zip -r app.zip .
az webapp deployment source config-zip \
  --resource-group <resource-group-name> \
  --name <app-service-name> \
  --src app.zip
```

### Option 2: Git Deployment

```bash
cd your-app-directory
git init
az webapp deployment source config-local-git \
  --resource-group <resource-group-name> \
  --name <app-service-name>
git remote add azure <git-url-from-above>
git add . && git commit -m "Initial commit"
git push azure main
```

### Option 3: GitHub Actions (Best for CI/CD)

1. Go to Azure Portal → Your App Service → Deployment Center
2. Select GitHub as the source
3. Authorize and select your repository
4. Azure will create a GitHub Actions workflow automatically

## Access Your Application

Visit the URL shown in the deployment output:
```
https://<app-name>.azurewebsites.net
```

## View Logs

Stream application logs:
```bash
az webapp log tail \
  --resource-group <resource-group-name> \
  --name <app-service-name>
```

## Clean Up

Destroy all resources:

```bash
bun destroy
```

## Cost

- **Free (F1) Tier**: $0/month
  - 1 GB RAM
  - 1 GB storage
  - 60 minutes/day compute
  - Perfect for development and testing

## Next Steps

- Upgrade to production tier (Basic, Standard, or Premium)
- Configure custom domain
- Enable Application Insights for monitoring
- Set up deployment slots for staging/production
- Configure authentication and authorization

---
title: StaticWebApp
description: Azure Static Web App - static site hosting with built-in CI/CD
---

# StaticWebApp

Azure Static Web Apps is a service that automatically builds and deploys full-stack web apps to Azure from a code repository. It's equivalent to Cloudflare Pages, AWS Amplify, and Vercel.

Key features:
- **Automatic CI/CD** from GitHub or Azure DevOps
- **Global CDN** distribution for fast content delivery
- **Free SSL** certificates for custom domains
- **Built-in API** support with Azure Functions
- **Authentication** and authorization providers
- **Staging environments** from pull requests
- **Zero server management** - fully managed platform

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the static web app. Must be 2-60 characters, alphanumeric and hyphens only. Must be globally unique across all of Azure. Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this static web app in |
| `location` | `string` | No | Azure region for the static web app. Defaults to the resource group's location |
| `sku` | `string` | No | The pricing tier. Options: `Free`, `Standard`. Defaults to `Free` |
| `repositoryUrl` | `string` | No | The URL of the GitHub repository (e.g., `https://github.com/username/repo`) |
| `branch` | `string` | No | The branch name to deploy from. Defaults to `main` |
| `repositoryToken` | `string \| Secret` | No | GitHub personal access token for repository access (required if `repositoryUrl` is provided). Use `alchemy.secret()` to securely store |
| `appLocation` | `string` | No | The folder containing the app source code. Defaults to `/` |
| `apiLocation` | `string` | No | The folder containing the API source code. Defaults to `api` |
| `outputLocation` | `string` | No | The folder containing the built app artifacts. Defaults to `dist` or `build` |
| `customDomains` | `string[]` | No | Custom domains for the static web app (e.g., `["www.example.com", "example.com"]`) |
| `appSettings` | `Record<string, string \| Secret>` | No | Application settings (environment variables) |
| `tags` | `Record<string, string>` | No | Tags to apply to the static web app |
| `adopt` | `boolean` | No | Whether to adopt an existing static web app. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the static web app when removed from Alchemy. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `defaultHostname` | `string` | The default hostname (e.g., `nice-sea-123456789.azurestaticapps.net`) |
| `url` | `string` | The static web app URL (e.g., `https://nice-sea-123456789.azurestaticapps.net`) |
| `apiKey` | `Secret` | API key for deployment |
| `type` | `"azure::StaticWebApp"` | Resource type identifier |

## Usage

### Basic Static Web App

Create a static web app without repository integration:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, StaticWebApp } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("main", {
  location: "eastus2"
});

const website = await StaticWebApp("site", {
  resourceGroup: rg,
  sku: "Free"
});

console.log(`Website URL: ${website.url}`);
console.log(`API Key: ${website.apiKey}`);
console.log(`Deploy with: Azure CLI or GitHub Actions`);

await app.finalize();
```

### Static Web App with GitHub Integration

Automatically deploy from a GitHub repository:

```typescript
const website = await StaticWebApp("site", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/my-site",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "/",
  apiLocation: "api",
  outputLocation: "dist"
});

// Azure automatically sets up GitHub Actions workflow
// Pushes to main branch trigger automatic deployments
```

### Static Web App with Custom Domain

Add custom domains to your static web app:

```typescript
const website = await StaticWebApp("site", {
  resourceGroup: rg,
  sku: "Standard", // Custom domains require Standard tier
  customDomains: [
    "www.example.com",
    "example.com"
  ]
});

// Configure DNS CNAME records:
// www.example.com -> nice-sea-123456789.azurestaticapps.net
// example.com -> nice-sea-123456789.azurestaticapps.net
```

### Static Web App with Environment Variables

Configure build-time and runtime environment variables:

```typescript
const website = await StaticWebApp("site", {
  resourceGroup: rg,
  appSettings: {
    API_URL: "https://api.example.com",
    ENVIRONMENT: "production",
    SECRET_KEY: alchemy.secret.env.APP_SECRET
  }
});

// Environment variables are available during:
// - Build time (in GitHub Actions)
// - Runtime (in Azure Functions API)
```

### Static Web App with API

Deploy a static site with serverless API backend:

```typescript
const website = await StaticWebApp("fullstack-app", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/fullstack-app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "frontend",
  apiLocation: "api", // Azure Functions
  outputLocation: "dist"
});

// Project structure:
// frontend/        - React/Vue/Angular app
// api/            - Azure Functions (Node.js/Python/.NET)
// dist/           - Build output
```

### React App Example

Deploy a React application:

```typescript
const reactApp = await StaticWebApp("react-app", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/react-app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "/",
  outputLocation: "build" // React builds to "build" folder
});
```

### Vue.js App Example

Deploy a Vue.js application:

```typescript
const vueApp = await StaticWebApp("vue-app", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/vue-app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "/",
  outputLocation: "dist" // Vue builds to "dist" folder
});
```

### Next.js Static Export

Deploy a Next.js static export:

```typescript
const nextApp = await StaticWebApp("nextjs-app", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/nextjs-app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "/",
  outputLocation: "out" // Next.js exports to "out" folder
});

// In next.config.js:
// module.exports = {
//   output: 'export'
// }
```

### Adopt Existing Static Web App

Adopt and manage an existing static web app:

```typescript
const existingApp = await StaticWebApp("existing-site", {
  name: "my-existing-static-web-app",
  resourceGroup: rg,
  sku: "Free",
  adopt: true
});

// The static web app is now managed by Alchemy
// You can update settings, app settings, etc.
```

## Pricing Tiers

| Tier | Features | Use Case |
|------|----------|----------|
| **Free** | 100GB bandwidth/month, 2 custom domains, 0.5GB storage | Personal projects, prototypes, small sites |
| **Standard** | 100GB bandwidth/month (then pay-as-you-go), unlimited custom domains, 10GB storage | Production apps, commercial sites |

## Build Configuration

### Build Properties

Azure Static Web Apps uses three key folders:

1. **App Location** (`appLocation`): The folder with your app source code
   - Default: `/` (root of repository)
   - Examples: `frontend`, `client`, `app`

2. **API Location** (`apiLocation`): The folder with your Azure Functions API
   - Default: `api`
   - Set to empty string if no API

3. **Output Location** (`outputLocation`): The folder with built artifacts
   - React: `build`
   - Vue/Vite: `dist`
   - Angular: `dist/my-app`
   - Next.js: `out`

### Framework Detection

Azure automatically detects and configures builds for:
- React
- Angular
- Vue
- Svelte
- Next.js (static export)
- Gatsby
- Hugo
- Jekyll

## Important Notes

### Global Naming

Static web app names must be globally unique across all of Azure because they create an `*.azurestaticapps.net` subdomain.

### GitHub Token

If using GitHub integration, you need a personal access token with `repo` permissions:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Store securely: `alchemy.secret.env.GITHUB_TOKEN`

### Custom Domains

Custom domains require the Standard tier and DNS configuration:
- Add CNAME record pointing to your `*.azurestaticapps.net` hostname
- Azure automatically provisions SSL certificates
- Validation can take a few minutes

### Immutable Properties

The following properties cannot be changed after creation:
- `name` - changing the name creates a new static web app
- `location` - changing the location creates a new static web app

### Deployment

Azure Static Web Apps automatically deploys when:
- You push to the configured branch
- You merge a pull request
- The GitHub Actions workflow runs successfully

## Common Patterns

### Multi-Environment Setup

Deploy separate environments for dev, staging, and production:

```typescript
const devApp = await StaticWebApp("dev-site", {
  resourceGroup: devRg,
  repositoryUrl: "https://github.com/username/app",
  branch: "develop",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appSettings: { ENVIRONMENT: "development" }
});

const prodApp = await StaticWebApp("prod-site", {
  resourceGroup: prodRg,
  repositoryUrl: "https://github.com/username/app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appSettings: { ENVIRONMENT: "production" }
});
```

### Preview Environments from PRs

Azure automatically creates preview environments for pull requests - no extra configuration needed! Each PR gets its own unique URL.

### SPA with Backend API

```typescript
const fullstackApp = await StaticWebApp("spa-with-api", {
  resourceGroup: rg,
  repositoryUrl: "https://github.com/username/app",
  branch: "main",
  repositoryToken: alchemy.secret.env.GITHUB_TOKEN,
  appLocation: "frontend",
  apiLocation: "api",
  outputLocation: "dist",
  appSettings: {
    DATABASE_URL: alchemy.secret.env.DATABASE_URL
  }
});

// API endpoints available at:
// https://your-app.azurestaticapps.net/api/function-name
```

## Related Resources

- [ResourceGroup](./resource-group) - Logical container for Azure resources
- [FunctionApp](./function-app) - Serverless compute for backend logic

## Official Documentation

- [Azure Static Web Apps Overview](https://docs.microsoft.com/azure/static-web-apps/overview)
- [Configuration Reference](https://docs.microsoft.com/azure/static-web-apps/configuration)
- [API Support with Azure Functions](https://docs.microsoft.com/azure/static-web-apps/apis)
- [Custom Domains](https://docs.microsoft.com/azure/static-web-apps/custom-domain)
- [Authentication and Authorization](https://docs.microsoft.com/azure/static-web-apps/authentication-authorization)

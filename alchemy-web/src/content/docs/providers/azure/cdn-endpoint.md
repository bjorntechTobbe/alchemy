---
title: CDNEndpoint
description: Azure CDN Endpoint - Content delivery endpoint with caching and optimization
---

# CDNEndpoint

A CDN Endpoint is the actual delivery point for cached content. It pulls content from origin servers and caches it at edge locations worldwide. Each endpoint has a unique hostname and can serve content from one or more origins.

**AWS Equivalent**: CloudFront Distribution (behavior/origin configuration)

Key features:
- Global edge caching for fast content delivery
- Custom domains with HTTPS support
- Origin configuration with health probes
- Caching rules and query string handling
- Content compression and optimization
- Purge and pre-load content
- Real-time metrics and logging

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the CDN endpoint. Must be globally unique (forms part of hostname). Must be 1-50 characters, lowercase alphanumeric and hyphens. Defaults to `${app}-${stage}-${id}` (lowercase) |
| `profile` | `string \| CDNProfile` | Yes | The CDN profile to create this endpoint in |
| `resourceGroup` | `string` | No | The resource group containing the CDN profile (required when using string profile reference) |
| `location` | `string` | No | Azure region for the endpoint. Defaults to profile's location |
| `origins` | `Array<Origin>` | Yes | Origin servers to pull content from. At least one origin required. See origin configuration below |
| `isHttpAllowed` | `boolean` | No | Whether HTTP is allowed. Defaults to `true` |
| `isHttpsAllowed` | `boolean` | No | Whether HTTPS is allowed. Defaults to `true` |
| `queryStringCachingBehavior` | `string` | No | How to handle query strings for caching. See caching behavior below. Defaults to `IgnoreQueryString` |
| `optimizationType` | `string` | No | Optimization type for content delivery. See optimization types below. Defaults to `GeneralWebDelivery` |
| `contentTypesToCompress` | `string[]` | No | Content types to compress. Defaults to common web content types |
| `isCompressionEnabled` | `boolean` | No | Whether compression is enabled. Defaults to `true` |
| `tags` | `Record<string, string>` | No | Tags to apply to the CDN endpoint |
| `adopt` | `boolean` | No | Whether to adopt an existing CDN endpoint. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the CDN endpoint when removed from Alchemy. Defaults to `true` |

### Origin Configuration

Each origin in the `origins` array has these properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Name of the origin |
| `hostName` | `string` | Yes | Hostname of the origin server (e.g., `myapp.azurewebsites.net`) |
| `httpPort` | `number` | No | HTTP port for origin connections. Defaults to `80` |
| `httpsPort` | `number` | No | HTTPS port for origin connections. Defaults to `443` |
| `originHostHeader` | `string` | No | Host header to send to origin. Defaults to same as `hostName` |
| `priority` | `number` | No | Priority for this origin (used in origin groups). Defaults to `1` |
| `weight` | `number` | No | Weight for load balancing. Defaults to `1000` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `cdnEndpointId` | `string` | The Azure resource ID |
| `hostName` | `string` | The CDN endpoint hostname (e.g., `{name}.azureedge.net`) |
| `provisioningState` | `string` | The provisioning state of the endpoint |
| `resourceState` | `string` | Resource state (Running, Creating, Deleting, Stopped) |
| `type` | `"azure::CDNEndpoint"` | Resource type identifier |

## Query String Caching Behavior

| Behavior | Description | When to Use |
|----------|-------------|-------------|
| `NotSet` | Default behavior (varies by SKU) | Let CDN decide |
| `IgnoreQueryString` | Query strings ignored for caching (default) | Static content, same content for all query strings |
| `BypassCaching` | Bypass cache for URLs with query strings | Dynamic content, personalized responses |
| `UseQueryString` | Cache every unique URL with query strings | Vary content by query parameters |

## Optimization Types

| Type | Description | Use Cases |
|------|-------------|-----------|
| `GeneralWebDelivery` | Standard web content (default) | Websites, APIs, static files |
| `GeneralMediaStreaming` | Video and audio streaming | Live streaming, media playback |
| `VideoOnDemandMediaStreaming` | On-demand video | Video libraries, courses |
| `LargeFileDownload` | Large file downloads (> 10 MB) | Software downloads, ISOs |
| `DynamicSiteAcceleration` | Dynamic content acceleration | APIs, dynamic web apps |

## Usage

### Basic CDN Endpoint for Static Website

Serve static content from Blob Storage:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, StorageAccount, CDNProfile, CDNEndpoint } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("site", {
  location: "eastus"
});

const storage = await StorageAccount("sitestorage", {
  resourceGroup: rg,
  sku: "Standard_LRS"
});

const cdn = await CDNProfile("site-cdn", {
  resourceGroup: rg,
  sku: "Standard_Microsoft"
});

const endpoint = await CDNEndpoint("site", {
  profile: cdn,
  origins: [{
    name: "storage-origin",
    hostName: storage.primaryBlobEndpoint.replace("https://", "").replace("/", "")
  }],
  isHttpAllowed: false, // HTTPS only
  isCompressionEnabled: true
});

console.log(`CDN URL: https://${endpoint.hostName}`);

await app.finalize();
```

### API CDN Endpoint with Caching

Accelerate API responses with appropriate caching:

```typescript
import { FunctionApp } from "alchemy/azure";

const api = await FunctionApp("api", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20"
});

const cdnProfile = await CDNProfile("api-cdn", {
  resourceGroup: rg,
  sku: "Standard_AzureFrontDoor"
});

const apiEndpoint = await CDNEndpoint("api", {
  profile: cdnProfile,
  origins: [{
    name: "api-origin",
    hostName: `${api.name}.azurewebsites.net`,
    originHostHeader: `${api.name}.azurewebsites.net`
  }],
  queryStringCachingBehavior: "UseQueryString", // Cache by query params
  optimizationType: "DynamicSiteAcceleration",
  isCompressionEnabled: true,
  contentTypesToCompress: [
    "application/json",
    "application/javascript",
    "text/css",
    "text/html"
  ]
});
```

### Video Streaming CDN

Optimize for video on demand:

```typescript
const mediaEndpoint = await CDNEndpoint("media", {
  profile: mediaCdn,
  origins: [{
    name: "media-origin",
    hostName: `${mediaStorage.name}.blob.core.windows.net`
  }],
  optimizationType: "VideoOnDemandMediaStreaming",
  isCompressionEnabled: false, // Video already compressed
  queryStringCachingBehavior: "IgnoreQueryString"
});
```

### Multiple Origin with Failover

Configure multiple origins for redundancy:

```typescript
const resilientEndpoint = await CDNEndpoint("resilient", {
  profile: cdn,
  origins: [
    {
      name: "primary",
      hostName: "primary.example.com",
      priority: 1, // Higher priority (lower number)
      weight: 1000
    },
    {
      name: "backup",
      hostName: "backup.example.com",
      priority: 2, // Lower priority
      weight: 1000
    }
  ]
});

// CDN will try primary first, failover to backup if primary is down
```

### Large File Downloads

Optimize for large file distribution:

```typescript
const downloadsEndpoint = await CDNEndpoint("downloads", {
  profile: cdn,
  origins: [{
    name: "files",
    hostName: `${storage.name}.blob.core.windows.net`
  }],
  optimizationType: "LargeFileDownload", // Optimized for files > 10 MB
  isCompressionEnabled: false, // Don't compress already compressed files
  queryStringCachingBehavior: "IgnoreQueryString"
});
```

### HTTPS-Only Endpoint

Force HTTPS for all content:

```typescript
const secureEndpoint = await CDNEndpoint("secure", {
  profile: cdn,
  origins: [{
    name: "app",
    hostName: "app.azurewebsites.net"
  }],
  isHttpAllowed: false, // Disable HTTP
  isHttpsAllowed: true
});
```

### Adopt Existing CDN Endpoint

Adopt an existing endpoint:

```typescript
const endpoint = await CDNEndpoint("legacy", {
  name: "existing-endpoint-name",
  profile: "existing-profile-name",
  resourceGroup: rg,
  origins: [{
    name: "origin",
    hostName: "origin.example.com"
  }],
  adopt: true // Adopt the existing endpoint
});
```

## Common Patterns

### Static Website Hosting

Full stack for static website with CDN:

```typescript
// 1. Storage account for static files
const storage = await StorageAccount("site", {
  resourceGroup: rg,
  sku: "Standard_LRS"
});

// 2. CDN profile
const cdn = await CDNProfile("site-cdn", {
  resourceGroup: rg,
  sku: "Standard_Microsoft"
});

// 3. CDN endpoint
const endpoint = await CDNEndpoint("site", {
  profile: cdn,
  origins: [{
    name: "storage",
    hostName: storage.primaryBlobEndpoint.replace("https://", "").replace("/", "")
  }],
  isHttpAllowed: false,
  isCompressionEnabled: true
});

// 4. Configure custom domain (manual DNS step)
console.log(`Add CNAME: www -> ${endpoint.hostName}`);
```

### Microservices API Gateway

CDN as API gateway with caching:

```typescript
const gatewayEndpoint = await CDNEndpoint("gateway", {
  profile: cdn,
  origins: [
    {
      name: "users-api",
      hostName: "users-api.azurewebsites.net",
      priority: 1
    },
    {
      name: "products-api",
      hostName: "products-api.azurewebsites.net",
      priority: 1
    }
  ],
  queryStringCachingBehavior: "UseQueryString",
  optimizationType: "DynamicSiteAcceleration"
});

// Use URL routing or custom domains to route to different origins
```

### Global Content Distribution

Multi-region content delivery:

```typescript
const globalEndpoint = await CDNEndpoint("global", {
  profile: cdn,
  origins: [
    {
      name: "us-east",
      hostName: "useast.blob.core.windows.net",
      priority: 1,
      weight: 2000 // Higher weight = more traffic
    },
    {
      name: "europe",
      hostName: "europe.blob.core.windows.net",
      priority: 1,
      weight: 1000
    }
  ]
});

// CDN automatically routes to closest origin
```

## Important Notes

### Global Uniqueness

Endpoint names must be globally unique across all of Azure because they form the hostname:
- Endpoint URL: `https://{name}.azureedge.net`
- Choose unique names to avoid conflicts

### Immutable Properties

These properties cannot be changed after creation (requires replacement):
- `name` - The endpoint name (impacts hostname)
- Origin `hostName` - Cannot change origin hostname (can add/remove origins)

### Caching Duration

Default caching behavior:
- No cache headers from origin: 7 days default
- Set `Cache-Control` headers on origin for precise control
- Use caching rules in CDN for override

### Content Purge

To purge cached content:
- Use Azure Portal or Azure CLI
- Purge by path pattern
- Can take up to 10 minutes to propagate globally

### Custom Domains

To use custom domains:
1. Create CNAME record: `www.example.com` → `{endpoint}.azureedge.net`
2. Add custom domain in Azure Portal
3. Enable HTTPS with managed certificate (free)

### HTTPS Certificates

- **Managed certificates**: Free, auto-renewed, supports wildcard
- **Custom certificates**: Bring your own certificate
- **HTTP to HTTPS redirect**: Configure in CDN rules

### Performance Tips

1. **Enable compression**: Reduces bandwidth and improves load times
2. **Optimize content types**: Choose correct optimization type for your content
3. **Query string caching**: Match your caching needs
4. **Origin configuration**: Set appropriate host headers
5. **Multiple origins**: Use for redundancy and load balancing

### Cost Optimization

1. **Caching**: Longer cache times reduce origin requests
2. **Compression**: Reduces data transfer costs
3. **Right-size SKU**: Premium features cost more
4. **Monitor usage**: Track data transfer and requests

## Related Resources

- [CDNProfile](./cdn-profile.md) - Required parent CDN profile
- [StorageAccount](./storage-account.md) - Common origin for static content
- [FunctionApp](./function-app.md) - Common origin for APIs
- [StaticWebApp](./static-web-app.md) - Alternative for static sites

## Official Documentation

- [CDN Endpoints Documentation](https://docs.microsoft.com/azure/cdn/cdn-create-endpoint-how-to)
- [CDN Caching Rules](https://docs.microsoft.com/azure/cdn/cdn-caching-rules)
- [CDN Custom Domains](https://docs.microsoft.com/azure/cdn/cdn-map-content-to-custom-domain)
- [CDN Performance Tips](https://docs.microsoft.com/azure/cdn/cdn-optimization-overview)

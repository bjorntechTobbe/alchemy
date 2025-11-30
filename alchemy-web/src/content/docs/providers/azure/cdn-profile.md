---
title: CDNProfile
description: Azure CDN Profile - Content Delivery Network profile container for endpoints
---

# CDNProfile

An Azure CDN Profile is a container for CDN endpoints. All endpoints in a profile share the same pricing tier (SKU) and configuration. Use CDN to accelerate content delivery globally by caching content at edge locations close to end users.

**AWS Equivalent**: CloudFront Distribution (container)
**Cloudflare Equivalent**: Zone with CDN enabled

Key features:
- Global content delivery with edge caching
- Multiple CDN providers (Microsoft, Akamai, Verizon, Azure Front Door)
- Custom domain support with HTTPS
- Caching rules and query string handling
- Compression and optimization for different content types
- Real-time analytics and monitoring
- DDoS protection and WAF (Premium tiers)

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the CDN profile. Must be 1-260 characters, alphanumeric and hyphens only. Defaults to `${app}-${stage}-${id}` |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this CDN profile in |
| `location` | `string` | No | Azure region for the CDN profile. Defaults to the resource group's location |
| `sku` | `string` | No | The pricing tier (CDN provider). See SKU comparison below. Defaults to `Standard_Microsoft` |
| `tags` | `Record<string, string>` | No | Tags to apply to the CDN profile |
| `adopt` | `boolean` | No | Whether to adopt an existing CDN profile. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the CDN profile when removed from Alchemy. **WARNING**: Deleting a profile deletes ALL endpoints. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `cdnProfileId` | `string` | The Azure resource ID |
| `provisioningState` | `string` | The provisioning state of the profile |
| `resourceState` | `string` | Resource state (Active, Creating, Deleting, Disabled) |
| `type` | `"azure::CDNProfile"` | Resource type identifier |

## SKU Comparison

| SKU | Provider | Performance | Features | Use Cases |
|-----|----------|-------------|----------|-----------|
| `Standard_Microsoft` | Microsoft | Good | Azure-native, simple | General web content, APIs |
| `Standard_Akamai` | Akamai | Excellent | Global reach, fast | High-traffic websites |
| `Standard_Verizon` | Verizon | Very good | Advanced features | Enterprise applications |
| `Premium_Verizon` | Verizon | Very good | Rules engine, analytics | Complex routing, customization |
| `Standard_AzureFrontDoor` | Microsoft | Excellent | Modern, L7 load balancing | **Recommended for new apps** |
| `Premium_AzureFrontDoor` | Microsoft | Excellent | WAF, Private Link | Secure, high-performance apps |

**Recommendation**: Use `Standard_AzureFrontDoor` for new applications. It provides the best combination of performance, features, and modern architecture.

## Usage

### Basic CDN Profile with Microsoft CDN

Create a CDN profile for content acceleration:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, CDNProfile } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("cdn", {
  location: "eastus"
});

const cdn = await CDNProfile("content-cdn", {
  resourceGroup: rg,
  sku: "Standard_Microsoft" // Azure-native CDN
});

console.log(`CDN Profile: ${cdn.name}`);
console.log(`State: ${cdn.resourceState}`);

await app.finalize();
```

### Azure Front Door Standard Profile (Recommended)

Create a modern CDN profile with Azure Front Door:

```typescript
const cdn = await CDNProfile("frontdoor", {
  resourceGroup: rg,
  sku: "Standard_AzureFrontDoor", // Modern, recommended
  tags: {
    environment: "production",
    purpose: "cdn"
  }
});

// Create endpoints using CDNEndpoint resource
```

### Premium Verizon with Advanced Features

Create a premium CDN profile with rules engine and analytics:

```typescript
const cdn = await CDNProfile("premium-cdn", {
  resourceGroup: rg,
  sku: "Premium_Verizon" // Advanced features, rules engine
});

// Access to:
// - Rules engine for complex routing
// - Real-time analytics
// - Token authentication
// - Advanced caching controls
```

### Multi-Region CDN Setup

Create CDN profiles in multiple regions for redundancy:

```typescript
const primaryCdn = await CDNProfile("primary-cdn", {
  resourceGroup: primaryRg,
  sku: "Standard_AzureFrontDoor"
});

const secondaryCdn = await CDNProfile("secondary-cdn", {
  resourceGroup: secondaryRg,
  sku: "Standard_AzureFrontDoor"
});

// Configure DNS-based failover between profiles
```

### Adopt Existing CDN Profile

Adopt an existing CDN profile:

```typescript
const cdn = await CDNProfile("legacy-cdn", {
  name: "existing-cdn-profile",
  resourceGroup: rg,
  sku: "Standard_Microsoft",
  adopt: true // Adopt the existing profile
});
```

## Common Patterns

### Static Website CDN

Serve a static website through CDN:

```typescript
import { StorageAccount, CDNProfile, CDNEndpoint } from "alchemy/azure";

// Create storage for static site
const storage = await StorageAccount("site-storage", {
  resourceGroup: rg,
  sku: "Standard_LRS"
});

// Create CDN profile
const cdn = await CDNProfile("site-cdn", {
  resourceGroup: rg,
  sku: "Standard_Microsoft"
});

// Create CDN endpoint pointing to blob storage
// (See CDNEndpoint documentation)
```

### API Acceleration

Accelerate API responses with CDN caching:

```typescript
import { FunctionApp } from "alchemy/azure";

const api = await FunctionApp("api", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20"
});

const cdn = await CDNProfile("api-cdn", {
  resourceGroup: rg,
  sku: "Standard_AzureFrontDoor" // L7 load balancing
});

// Configure CDN endpoint with caching rules for API
```

### Media Streaming

Optimize for video streaming:

```typescript
const mediaCdn = await CDNProfile("media-cdn", {
  resourceGroup: rg,
  sku: "Premium_Verizon" // Best for media
});

// Configure endpoints with:
// - VideoOnDemandMediaStreaming optimization
// - Origin streaming protocols
// - Token authentication for content protection
```

## Important Notes

### SKU Selection

Choose your SKU carefully:
- **Standard_Microsoft**: Best for general-purpose web content, Azure-integrated
- **Standard_Akamai**: Best global performance, may cost more
- **Standard_Verizon**: Good balance of features and performance
- **Premium_Verizon**: For complex scenarios requiring rules engine
- **Azure Front Door**: Modern choice, recommended for new applications
- **Premium Front Door**: Adds WAF, Private Link, advanced security

### Immutable Properties

These properties cannot be changed after creation (requires replacement):
- `name` - The profile name
- `sku` - The CDN provider (cannot switch between SKUs)

### Endpoint Management

CDN Profiles are containers for CDN Endpoints:
- One profile can have multiple endpoints
- All endpoints share the profile's SKU
- Deleting a profile deletes all endpoints
- Use separate profiles for different SKUs or billing separation

### Global Resources

CDN Profiles are global resources but require a location for deployment:
- Location determines where metadata is stored
- Content is cached globally at edge locations regardless of profile location
- Choose location close to your management location

### Pricing

CDN pricing varies by SKU:
- **Data transfer out**: Main cost component
- **Requests**: Charged per HTTP/HTTPS request
- **Premium features**: Additional costs for rules engine, WAF, etc.
- See [Azure CDN Pricing](https://azure.microsoft.com/pricing/details/cdn/)

### Migration Between SKUs

You cannot change the SKU of an existing profile:
- Create new profile with desired SKU
- Create endpoints in new profile
- Migrate traffic via DNS
- Delete old profile when migration is complete

## Related Resources

- [CDNEndpoint](./cdn-endpoint.md) - Create CDN endpoints within a profile
- [ResourceGroup](./resource-group.md) - Required parent resource
- [StorageAccount](./storage-account.md) - Common origin for static content
- [FunctionApp](./function-app.md) - Common origin for APIs

## Official Documentation

- [Azure CDN Documentation](https://docs.microsoft.com/azure/cdn/)
- [Azure Front Door Documentation](https://docs.microsoft.com/azure/frontdoor/)
- [CDN Features by SKU](https://docs.microsoft.com/azure/cdn/cdn-features)
- [CDN Pricing](https://azure.microsoft.com/pricing/details/cdn/)

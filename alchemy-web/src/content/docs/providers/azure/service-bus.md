---
title: ServiceBus
description: Azure Service Bus - Enterprise messaging service for queues and pub/sub topics
---

# ServiceBus

Azure Service Bus is a fully managed enterprise message broker with message queues and publish-subscribe topics. It decouples applications and services, provides reliable message delivery, and supports sophisticated messaging patterns.

**AWS Equivalent**: Combines features of Amazon SQS (queues) and Amazon SNS (topics/pub-sub)

Key features:
- Message queues for point-to-point communication
- Topics and subscriptions for publish-subscribe patterns
- Advanced message routing and filtering
- Dead-letter queues for failed messages
- Sessions for ordered message processing
- Transactions and duplicate detection
- Multiple pricing tiers (Basic, Standard, Premium)

## Properties

### Input Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | No | Name of the Service Bus namespace. Must be 6-50 characters, lowercase letters, numbers, and hyphens only. Must be globally unique across all of Azure. Defaults to `${app}-${stage}-${id}` (lowercase, alphanumeric + hyphens) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | The resource group to create this Service Bus namespace in |
| `location` | `string` | No | Azure region for the Service Bus namespace. Defaults to the resource group's location |
| `sku` | `"Basic" \| "Standard" \| "Premium"` | No | The messaging tier. Defaults to `Standard`. See SKU comparison below |
| `capacity` | `number` | No | Number of messaging units (Premium SKU only). Each unit provides dedicated CPU and memory. Defaults to `1` for Premium SKU |
| `zoneRedundant` | `boolean` | No | Enable zone redundancy (Premium SKU only). Replicates namespace across availability zones. Defaults to `false` |
| `disableLocalAuth` | `boolean` | No | Disable local (SAS) authentication, require Azure AD only. Defaults to `false` |
| `tags` | `Record<string, string>` | No | Tags to apply to the Service Bus namespace |
| `adopt` | `boolean` | No | Whether to adopt an existing Service Bus namespace. Defaults to `false` |
| `delete` | `boolean` | No | Whether to delete the Service Bus namespace when removed from Alchemy. **WARNING**: Deleting a namespace deletes ALL queues, topics, and messages. Defaults to `true` |

### Output Properties

All input properties plus:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | The Alchemy resource ID |
| `serviceBusId` | `string` | The Azure resource ID |
| `endpoint` | `string` | The Service Bus namespace endpoint (e.g., `https://{namespaceName}.servicebus.windows.net`) |
| `primaryConnectionString` | `Secret` | Primary connection string with Shared Access Signature credentials |
| `secondaryConnectionString` | `Secret` | Secondary connection string for key rotation |
| `primaryKey` | `Secret` | Primary access key |
| `secondaryKey` | `Secret` | Secondary access key |
| `provisioningState` | `string` | The provisioning state of the namespace |
| `type` | `"azure::ServiceBus"` | Resource type identifier |

## SKU Comparison

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| **Max message size** | 256 KB | 256 KB | 1 MB |
| **Queues** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Topics/Subscriptions** | ❌ No | ✅ Yes | ✅ Yes |
| **Transactions** | ❌ No | ✅ Yes | ✅ Yes |
| **Duplicate detection** | ❌ No | ✅ Yes | ✅ Yes |
| **Sessions** | ❌ No | ✅ Yes | ✅ Yes |
| **Dead-letter queues** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Geo-disaster recovery** | ❌ No | ✅ Yes (metadata) | ✅ Yes (messages) |
| **Availability zones** | ❌ No | ❌ No | ✅ Yes |
| **Pricing** | Pay per operation | Pay per operation | Fixed capacity |
| **Performance** | Shared resources | Shared resources | Dedicated resources |
| **Predictable latency** | ❌ No | ❌ No | ✅ Yes |

## Usage

### Basic Service Bus with Standard SKU

Create a Service Bus namespace for message queuing and pub/sub:

```typescript
import { alchemy } from "alchemy";
import { ResourceGroup, ServiceBus } from "alchemy/azure";

const app = await alchemy("my-app", {
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!
  }
});

const rg = await ResourceGroup("messaging", {
  location: "eastus"
});

const bus = await ServiceBus("orders", {
  resourceGroup: rg,
  sku: "Standard" // Supports queues and topics
});

console.log(`Endpoint: ${bus.endpoint}`);
console.log(`Connection String available as Secret`);

await app.finalize();
```

### Premium Service Bus with Zone Redundancy

Create a high-performance Service Bus with dedicated resources:

```typescript
const bus = await ServiceBus("critical-msgs", {
  resourceGroup: rg,
  sku: "Premium",
  capacity: 2, // 2 messaging units for high throughput
  zoneRedundant: true // Replicate across availability zones
});

console.log(`Premium endpoint: ${bus.endpoint}`);
```

### Service Bus with Azure AD Authentication Only

Disable SAS keys and require Azure AD authentication for enhanced security:

```typescript
const bus = await ServiceBus("secure-bus", {
  resourceGroup: rg,
  sku: "Standard",
  disableLocalAuth: true // No SAS keys, Azure AD only
});

// Use managed identity or Azure AD to authenticate
// Connection string won't be usable
```

### Message Queue Pattern

Use Service Bus with a Function App for processing messages:

```typescript
import { FunctionApp } from "alchemy/azure";

const bus = await ServiceBus("tasks", {
  resourceGroup: rg,
  sku: "Standard"
});

const processor = await FunctionApp("processor", {
  resourceGroup: rg,
  runtime: "node",
  runtimeVersion: "20",
  environmentVariables: {
    SERVICE_BUS_CONNECTION: bus.primaryConnectionString
  }
});

// Create queue and add message handler in your function code
```

### Publish-Subscribe Pattern

Create Service Bus for pub/sub messaging (requires Standard or Premium SKU):

```typescript
const bus = await ServiceBus("events", {
  resourceGroup: rg,
  sku: "Standard" // Required for topics/subscriptions
});

// Create topics and subscriptions using Azure SDK:
// - Topic: "orders"
// - Subscriptions: "inventory", "shipping", "analytics"
```

### Multi-Region Setup

Create Service Bus namespaces in multiple regions:

```typescript
const primaryBus = await ServiceBus("primary-bus", {
  resourceGroup: primaryRg,
  location: "eastus",
  sku: "Premium",
  zoneRedundant: true
});

const secondaryBus = await ServiceBus("secondary-bus", {
  resourceGroup: secondaryRg,
  location: "westus",
  sku: "Premium",
  zoneRedundant: true
});

// Implement application-level replication between namespaces
```

### Adopt Existing Service Bus

Adopt an existing Service Bus namespace:

```typescript
const bus = await ServiceBus("legacy-bus", {
  name: "existing-namespace-name",
  resourceGroup: rg,
  sku: "Standard",
  adopt: true // Adopt the existing namespace
});
```

## Common Patterns

### Background Job Processing

Use Service Bus queues for distributing work across multiple workers:

```typescript
const jobQueue = await ServiceBus("jobs", {
  resourceGroup: rg,
  sku: "Standard"
});

// Producers send jobs to queue
// Workers pull and process jobs
// Failed jobs go to dead-letter queue
```

### Event-Driven Architecture

Use Service Bus topics for event distribution:

```typescript
const eventBus = await ServiceBus("events", {
  resourceGroup: rg,
  sku: "Standard" // Required for topics
});

// Publishers send events to topic
// Multiple subscribers process events independently
```

### Microservices Communication

Decouple microservices with Service Bus:

```typescript
const bus = await ServiceBus("microservices", {
  resourceGroup: rg,
  sku: "Premium",
  capacity: 2
});

// Service A sends commands to queue "service-b-commands"
// Service B processes commands
// Service B sends responses to queue "service-a-responses"
```

## Important Notes

### Global Naming

Service Bus namespace names must be globally unique across all of Azure. The namespace becomes part of the endpoint URL: `https://{namespaceName}.servicebus.windows.net`

### Immutable Properties

These properties cannot be changed after creation (requires replacement):
- `name` - The namespace name
- `location` - The Azure region
- `sku` - Can only be upgraded from Standard to Premium (not downgraded)

### SKU Migration

You can upgrade from Standard to Premium SKU, but you cannot downgrade from Premium to Standard or Basic.

### Message Sizes

- Basic/Standard: Maximum 256 KB per message
- Premium: Maximum 1 MB per message
- For larger messages, store data in Blob Storage and send reference

### Pricing

- **Basic/Standard**: Pay per million operations (sends, receives)
- **Premium**: Fixed monthly cost based on messaging units (capacity)
- Premium provides predictable costs for high-volume scenarios

### Queues vs Topics

- **Queues**: Point-to-point communication (one sender, one receiver)
- **Topics**: Publish-subscribe (one sender, multiple subscribers)
- Topics require Standard or Premium SKU

### Security Best Practices

1. Use Azure AD authentication (`disableLocalAuth: true`) when possible
2. Rotate connection strings regularly (use `secondaryConnectionString`)
3. Use managed identities for Azure resources (Function Apps, Container Instances)
4. Store connection strings as Secrets (automatically done by Alchemy)
5. Apply network restrictions in production environments

## Related Resources

- [ResourceGroup](./resource-group.md) - Required parent resource
- [FunctionApp](./function-app.md) - Process messages with serverless functions
- [ContainerInstance](./container-instance.md) - Run message processors in containers

## Official Documentation

- [Azure Service Bus Documentation](https://docs.microsoft.com/azure/service-bus-messaging/)
- [Service Bus Queues](https://docs.microsoft.com/azure/service-bus-messaging/service-bus-queues-topics-subscriptions#queues)
- [Service Bus Topics](https://docs.microsoft.com/azure/service-bus-messaging/service-bus-queues-topics-subscriptions#topics-and-subscriptions)
- [Service Bus Pricing](https://azure.microsoft.com/pricing/details/service-bus/)

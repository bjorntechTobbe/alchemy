---
title: PublicIPAddress
description: Azure Public IP Address for external connectivity
---

# PublicIPAddress

Azure Public IP Address provides external connectivity for Azure resources, equivalent to AWS Elastic IP. They can be attached to load balancers, NAT gateways, VPN gateways, application gateways, and virtual machines.

## Properties

### Input

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | No | `${app}-${stage}-${id}` | Name of the public IP (1-80 chars) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | - | Resource group |
| `location` | `string` | No | Inherited from resource group | Azure region |
| `sku` | `"Basic" \| "Standard"` | No | `"Standard"` | SKU tier |
| `allocationMethod` | `"Static" \| "Dynamic"` | No | `"Static"` | IP allocation method |
| `ipVersion` | `"IPv4" \| "IPv6"` | No | `"IPv4"` | IP address version |
| `domainNameLabel` | `string` | No | - | DNS domain name label |
| `idleTimeoutInMinutes` | `number` | No | `4` | Idle timeout (4-30 minutes) |
| `zones` | `string[]` | No | - | Availability zones |
| `tags` | `Record<string, string>` | No | - | Resource tags |
| `adopt` | `boolean` | No | `false` | Adopt existing IP |
| `delete` | `boolean` | No | `true` | Delete when removed |

### Output

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alchemy resource ID |
| `name` | `string` | Public IP address name |
| `publicIpAddressId` | `string` | Azure resource ID |
| `location` | `string` | Azure region |
| `ipAddress` | `string` | Allocated IP address |
| `fqdn` | `string` | Fully qualified domain name |
| `provisioningState` | `string` | Provisioning state |

## Examples

### Basic Public IP Address

Create a static public IP address:

```ts
const rg = await ResourceGroup("network-rg", {
  location: "eastus"
});

const publicIp = await PublicIPAddress("app-ip", {
  resourceGroup: rg,
  location: "eastus",
  allocationMethod: "Static"
});

console.log(`IP Address: ${publicIp.ipAddress}`);
```

### Public IP with DNS Label

Create a public IP with custom DNS name:

```ts
const publicIp = await PublicIPAddress("web-ip", {
  resourceGroup: rg,
  location: "eastus",
  domainNameLabel: "myapp",
  tags: {
    purpose: "web-server"
  }
});

console.log(`FQDN: ${publicIp.fqdn}`);
// Output: myapp.eastus.cloudapp.azure.com
```

### Zone-Redundant Public IP

Create a zone-redundant public IP for high availability:

```ts
const publicIp = await PublicIPAddress("ha-ip", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  zones: ["1", "2", "3"],
  allocationMethod: "Static"
});
```

### IPv6 Public IP

Create an IPv6 public IP address:

```ts
const publicIpV6 = await PublicIPAddress("ipv6-ip", {
  resourceGroup: rg,
  location: "eastus",
  ipVersion: "IPv6",
  allocationMethod: "Static"
});
```

### Public IP for Load Balancer

Create a public IP for use with a load balancer:

```ts
const lbIp = await PublicIPAddress("lb-ip", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  allocationMethod: "Static",
  domainNameLabel: "mylb",
  idleTimeoutInMinutes: 30
});
```

### Public IP for NAT Gateway

Create a public IP for outbound internet connectivity:

```ts
const natIp = await PublicIPAddress("nat-ip", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  allocationMethod: "Static",
  tags: {
    purpose: "nat-gateway",
    tier: "infrastructure"
  }
});
```

### Adopt Existing Public IP

Adopt an existing public IP address:

```ts
const publicIp = await PublicIPAddress("existing-ip", {
  name: "my-existing-ip",
  resourceGroup: "existing-rg",
  location: "eastus",
  adopt: true
});
```

## SKU Comparison

| Feature | Basic | Standard |
|---------|-------|----------|
| **Allocation** | Static or Dynamic | Static only |
| **Zones** | Not supported | Supported |
| **Routing** | Regional | Global |
| **Security** | Open by default | Secure by default (NSG required) |
| **Availability** | 99.9% SLA | 99.99% SLA (zone-redundant) |

## Allocation Methods

### Static

- IP address is allocated immediately
- Address doesn't change when resource is stopped
- Required for Standard SKU
- Required for zone-redundant deployments
- Recommended for production workloads

### Dynamic

- IP address is allocated when resource is attached
- Address may change when resource is stopped/started
- Only available with Basic SKU
- Lower cost than Static
- Not recommended for production

## Important Notes

- **SKU Immutability**: Cannot change SKU after creation
- **IP Version**: Cannot change IP version after creation
- **Zone Configuration**: Zones can only be set during creation
- **DNS Labels**: Must be unique within the Azure region
- **Idle Timeout**: Must be between 4 and 30 minutes
- **Charges**: You are charged for Static IPs even when not attached
- **Basic SKU Deprecation**: Azure is deprecating Basic SKU (migrate to Standard)

## Common Use Cases

### Load Balancer Frontend

```ts
const lbIp = await PublicIPAddress("lb-frontend", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  allocationMethod: "Static",
  domainNameLabel: "myapp-lb"
});

// Use with Azure Load Balancer
// const lb = await LoadBalancer("web-lb", {
//   frontendIpConfiguration: lbIp
// });
```

### NAT Gateway

```ts
const natIp = await PublicIPAddress("nat-gateway-ip", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  zones: ["1", "2", "3"]
});

// Use with NAT Gateway for outbound internet
// const natGateway = await NatGateway("nat", {
//   publicIpAddresses: [natIp]
// });
```

### Application Gateway

```ts
const appGwIp = await PublicIPAddress("appgw-ip", {
  resourceGroup: rg,
  location: "eastus",
  sku: "Standard",
  allocationMethod: "Static",
  domainNameLabel: "myapp-waf"
});
```

## Related Resources

- [VirtualNetwork](/docs/providers/azure/virtual-network) - Virtual network for private connectivity
- [NetworkSecurityGroup](/docs/providers/azure/network-security-group) - Firewall rules
- [ResourceGroup](/docs/providers/azure/resource-group) - Container for resources
- [Azure Public IP Documentation](https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses)

## Official Documentation

- [Public IP Addresses Overview](https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses)
- [Create Public IP](https://learn.microsoft.com/azure/virtual-network/ip-services/create-public-ip-cli)
- [SKU Comparison](https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses#sku)

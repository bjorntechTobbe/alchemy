---
title: VirtualNetwork
description: Azure Virtual Network for isolated network environments
---

# VirtualNetwork

Azure Virtual Network (VNet) provides isolated network environments in Azure, equivalent to AWS VPC. They enable secure communication between Azure resources, on-premises networks, and the internet.

## Properties

### Input

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | No | `${app}-${stage}-${id}` | Name of the virtual network (2-64 chars) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | - | Resource group to create the VNet in |
| `location` | `string` | No | Inherited from resource group | Azure region |
| `addressSpace` | `string[]` | No | `["10.0.0.0/16"]` | Address spaces in CIDR notation |
| `subnets` | `Subnet[]` | No | `[{name: "default", addressPrefix: "10.0.0.0/24"}]` | Subnets within the VNet |
| `dnsServers` | `string[]` | No | Azure-provided DNS | Custom DNS servers |
| `tags` | `Record<string, string>` | No | - | Resource tags |
| `adopt` | `boolean` | No | `false` | Adopt existing VNet |
| `delete` | `boolean` | No | `true` | Delete when removed from Alchemy |

### Output

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alchemy resource ID |
| `name` | `string` | Virtual network name |
| `virtualNetworkId` | `string` | Azure resource ID |
| `location` | `string` | Azure region |
| `addressSpace` | `string[]` | Configured address spaces |
| `subnets` | `Subnet[]` | Configured subnets |

## Examples

### Basic Virtual Network

Create a simple virtual network with default configuration:

```ts
const rg = await ResourceGroup("network-rg", {
  location: "eastus"
});

const vnet = await VirtualNetwork("app-network", {
  resourceGroup: rg,
  location: "eastus"
});
```

### Multi-Subnet Virtual Network

Create a VNet with multiple subnets for different application tiers:

```ts
const vnet = await VirtualNetwork("app-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16"],
  subnets: [
    { name: "web", addressPrefix: "10.0.1.0/24" },
    { name: "api", addressPrefix: "10.0.2.0/24" },
    { name: "database", addressPrefix: "10.0.3.0/24" }
  ]
});
```

### Virtual Network with Custom DNS

Configure custom DNS servers:

```ts
const vnet = await VirtualNetwork("corp-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.1.0.0/16"],
  dnsServers: ["10.1.0.4", "10.1.0.5"],
  tags: {
    environment: "production",
    department: "IT"
  }
});
```

### Multi-Region Deployment

Create virtual networks in multiple regions:

```ts
const eastVnet = await VirtualNetwork("east-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16"]
});

const westVnet = await VirtualNetwork("west-network", {
  resourceGroup: rg,
  location: "westus",
  addressSpace: ["10.1.0.0/16"]
});
```

### Large Address Space

Create a VNet with multiple address prefixes:

```ts
const vnet = await VirtualNetwork("large-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16", "192.168.0.0/16"],
  subnets: [
    { name: "subnet-1", addressPrefix: "10.0.0.0/24" },
    { name: "subnet-2", addressPrefix: "192.168.0.0/24" }
  ]
});
```

### Adopt Existing Virtual Network

Adopt a virtual network created outside Alchemy:

```ts
const vnet = await VirtualNetwork("existing-network", {
  name: "my-existing-vnet",
  resourceGroup: "existing-rg",
  location: "eastus",
  addressSpace: ["10.0.0.0/16"],
  adopt: true
});
```

## Important Notes

- **Address Space Planning**: Ensure address spaces don't overlap with other VNets you plan to peer
- **Subnet Sizing**: Leave room for growth - subnets cannot be resized without recreation
- **Name Immutability**: VNet name and location cannot be changed after creation
- **Peering**: Use VNet peering to connect VNets across regions or subscriptions
- **Default Subnets**: If no subnets specified, a default subnet is created automatically
- **Azure Reserved IPs**: Azure reserves first 4 and last IP in each subnet

## Common Patterns

### Hub-and-Spoke Topology

```ts
// Hub VNet for shared services
const hubVnet = await VirtualNetwork("hub", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16"],
  subnets: [
    { name: "firewall", addressPrefix: "10.0.1.0/24" },
    { name: "gateway", addressPrefix: "10.0.2.0/24" }
  ]
});

// Spoke VNets for workloads
const spoke1 = await VirtualNetwork("spoke-1", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.1.0.0/16"]
});

const spoke2 = await VirtualNetwork("spoke-2", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.2.0.0/16"]
});
```

### Preserve Network

Keep VNet when removing from Alchemy:

```ts
const criticalVnet = await VirtualNetwork("critical-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16"],
  delete: false,
  tags: {
    critical: "true",
    preserve: "true"
  }
});
```

## Related Resources

- [NetworkSecurityGroup](/docs/providers/azure/network-security-group) - Firewall rules for VNet
- [ResourceGroup](/docs/providers/azure/resource-group) - Container for VNet
- [Azure Virtual Network Documentation](https://learn.microsoft.com/azure/virtual-network/)

## Official Documentation

- [Azure Virtual Network Overview](https://learn.microsoft.com/azure/virtual-network/virtual-networks-overview)
- [Plan Virtual Networks](https://learn.microsoft.com/azure/virtual-network/virtual-network-vnet-plan-design-arm)
- [VNet Peering](https://learn.microsoft.com/azure/virtual-network/virtual-network-peering-overview)

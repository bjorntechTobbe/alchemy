---
title: NetworkSecurityGroup
description: Azure Network Security Group for firewall rules
---

# NetworkSecurityGroup

Azure Network Security Group (NSG) contains security rules that allow or deny network traffic to Azure resources, equivalent to AWS Security Groups. NSGs can be associated with subnets or individual network interfaces.

## Properties

### Input

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | No | `${app}-${stage}-${id}` | Name of the NSG (1-80 chars) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | - | Resource group to create the NSG in |
| `location` | `string` | No | Inherited from resource group | Azure region |
| `securityRules` | `SecurityRule[]` | No | `[]` | Security rules for the NSG |
| `tags` | `Record<string, string>` | No | - | Resource tags |
| `adopt` | `boolean` | No | `false` | Adopt existing NSG |
| `delete` | `boolean` | No | `true` | Delete when removed from Alchemy |

### Security Rule Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Name of the rule |
| `priority` | `number` | Yes | Priority (100-4096, lower is higher) |
| `direction` | `"Inbound" \| "Outbound"` | Yes | Traffic direction |
| `access` | `"Allow" \| "Deny"` | Yes | Allow or deny traffic |
| `protocol` | `"Tcp" \| "Udp" \| "Icmp" \| "*"` | Yes | Protocol |
| `sourceAddressPrefix` | `string` | No | Source address/CIDR/tag |
| `sourcePortRange` | `string` | No | Source port(s) |
| `destinationAddressPrefix` | `string` | No | Destination address/CIDR/tag |
| `destinationPortRange` | `string` | No | Destination port(s) |
| `description` | `string` | No | Rule description |

### Output

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alchemy resource ID |
| `name` | `string` | NSG name |
| `networkSecurityGroupId` | `string` | Azure resource ID |
| `location` | `string` | Azure region |
| `securityRules` | `SecurityRule[]` | Configured security rules |

## Examples

### Basic Web NSG

Create an NSG allowing HTTP and HTTPS traffic:

```ts
const rg = await ResourceGroup("network-rg", {
  location: "eastus"
});

const webNsg = await NetworkSecurityGroup("web-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-http",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "80"
    },
    {
      name: "allow-https",
      priority: 110,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "443"
    }
  ]
});
```

### Database NSG

Restrict access to internal network only:

```ts
const dbNsg = await NetworkSecurityGroup("db-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-sql-internal",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "10.0.0.0/16",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "1433",
      description: "Allow SQL Server from internal network"
    },
    {
      name: "deny-internet",
      priority: 200,
      direction: "Inbound",
      access: "Deny",
      protocol: "*",
      sourceAddressPrefix: "Internet",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "*",
      description: "Deny all traffic from internet"
    }
  ]
});
```

### SSH Access from Specific IP

Allow SSH only from office network:

```ts
const sshNsg = await NetworkSecurityGroup("ssh-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-ssh",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "203.0.113.0/24",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "22",
      description: "Allow SSH from office network"
    }
  ]
});
```

### Outbound Traffic Control

Control outbound traffic with deny-all:

```ts
const restrictiveNsg = await NetworkSecurityGroup("restrictive-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-outbound-https",
      priority: 100,
      direction: "Outbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "Internet",
      destinationPortRange: "443",
      description: "Allow HTTPS to internet"
    },
    {
      name: "allow-outbound-dns",
      priority: 110,
      direction: "Outbound",
      access: "Allow",
      protocol: "Udp",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "53",
      description: "Allow DNS queries"
    },
    {
      name: "deny-outbound-all",
      priority: 4000,
      direction: "Outbound",
      access: "Deny",
      protocol: "*",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "*",
      description: "Deny all other outbound traffic"
    }
  ]
});
```

### Service Tags

Use Azure service tags for simplified rules:

```ts
const apiNsg = await NetworkSecurityGroup("api-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-api-management",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "ApiManagement",
      sourcePortRange: "*",
      destinationAddressPrefix: "VirtualNetwork",
      destinationPortRange: "443"
    }
  ]
});
```

### Adopt Existing NSG

Adopt an NSG created outside Alchemy:

```ts
const nsg = await NetworkSecurityGroup("existing-nsg", {
  name: "my-existing-nsg",
  resourceGroup: "existing-rg",
  location: "eastus",
  adopt: true
});
```

## Priority Guidelines

- **100-199**: Critical allow rules (SSH, RDP from specific IPs)
- **200-999**: Application-specific rules (HTTP, HTTPS, database)
- **1000-3999**: General rules
- **4000-4096**: Deny rules (should have lowest priority)

## Service Tags

Azure provides service tags to simplify NSG rules:

- `Internet` - Public internet addresses
- `VirtualNetwork` - All addresses in the virtual network
- `AzureLoadBalancer` - Azure load balancer
- `ApiManagement` - Azure API Management
- `Storage` - Azure Storage
- `Sql` - Azure SQL Database
- `AzureCloud` - All Azure datacenters

## Important Notes

- **Default Rules**: Azure adds default rules that cannot be deleted
- **Priority Conflicts**: Rules with same priority will fail creation
- **Rule Limits**: Maximum 1000 rules per NSG
- **Association**: NSGs can be associated with subnets or network interfaces
- **Name Immutability**: NSG name and location cannot be changed after creation
- **Evaluation Order**: Rules evaluated by priority, processing stops at first match

## Common Patterns

### Three-Tier Application

```ts
// Web tier NSG
const webNsg = await NetworkSecurityGroup("web-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-http-https",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "80,443"
    }
  ]
});

// App tier NSG
const appNsg = await NetworkSecurityGroup("app-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-from-web",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "10.0.1.0/24", // Web subnet
      destinationAddressPrefix: "*",
      destinationPortRange: "8080"
    }
  ]
});

// Database tier NSG
const dbNsg = await NetworkSecurityGroup("db-nsg", {
  resourceGroup: rg,
  location: "eastus",
  securityRules: [
    {
      name: "allow-from-app",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "10.0.2.0/24", // App subnet
      destinationAddressPrefix: "*",
      destinationPortRange: "1433"
    }
  ]
});
```

## Related Resources

- [VirtualNetwork](/docs/providers/azure/virtual-network) - Virtual network for NSG association
- [ResourceGroup](/docs/providers/azure/resource-group) - Container for NSG
- [Azure NSG Documentation](https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview)

## Official Documentation

- [Network Security Groups Overview](https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview)
- [Security Rules](https://learn.microsoft.com/azure/virtual-network/network-security-group-how-it-works)
- [Service Tags](https://learn.microsoft.com/azure/virtual-network/service-tags-overview)

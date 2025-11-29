---
title: ContainerInstance
description: Azure Container Instance for serverless Docker containers
---

# ContainerInstance

Azure Container Instance provides serverless container hosting in Azure, equivalent to AWS ECS Fargate. They offer fast startup times (< 1 second), per-second billing, and support for public IPs, virtual network integration, and environment variables with secrets.

## Properties

### Input

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | No | `${app}-${stage}-${id}` | Container group name (1-63 chars, lowercase, alphanumeric, hyphens) |
| `resourceGroup` | `string \| ResourceGroup` | Yes | - | Resource group to create the container in |
| `location` | `string` | No | Inherited from resource group | Azure region |
| `image` | `string` | Yes | - | Docker image to run |
| `cpu` | `number` | No | `1` | Number of CPU cores (can be fractional: 0.5, 1.5) |
| `memoryInGB` | `number` | No | `1.5` | Memory in GB (can be fractional) |
| `osType` | `"Linux" \| "Windows"` | No | `"Linux"` | Operating system type |
| `restartPolicy` | `"Always" \| "OnFailure" \| "Never"` | No | `"Always"` | Container restart policy |
| `command` | `string[]` | No | - | Command to run (overrides ENTRYPOINT) |
| `environmentVariables` | `Record<string, string \| Secret>` | No | - | Environment variables |
| `ipAddress` | `ContainerIPAddress` | No | - | Public or private IP configuration |
| `subnet` | `SubnetConfig` | No | - | Deploy into VNet subnet |
| `tags` | `Record<string, string>` | No | - | Resource tags |
| `adopt` | `boolean` | No | `false` | Adopt existing container instance |
| `delete` | `boolean` | No | `true` | Delete when removed from Alchemy |

### IP Address Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `"Public" \| "Private"` | Yes | IP address type |
| `ports` | `ContainerPort[]` | Yes | Ports to expose |
| `dnsNameLabel` | `string` | No | DNS label (creates `<label>.<region>.azurecontainer.io`) |

### Container Port

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `port` | `number` | Yes | - | Port number |
| `protocol` | `"TCP" \| "UDP"` | No | `"TCP"` | Protocol |

### Output

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alchemy resource ID |
| `name` | `string` | Container group name |
| `containerGroupId` | `string` | Azure resource ID |
| `location` | `string` | Azure region |
| `ipAddress` | `string` | Allocated IP address |
| `fqdn` | `string` | Fully qualified domain name (if DNS label specified) |
| `provisioningState` | `string` | Provisioning state |
| `instanceState` | `string` | Container instance state |

## Examples

### Basic Web Server

Run an NGINX container with a public IP:

```ts
const rg = await ResourceGroup("container-rg", {
  location: "eastus"
});

const web = await ContainerInstance("web", {
  resourceGroup: rg,
  image: "nginx:latest",
  cpu: 1,
  memoryInGB: 1.5,
  ipAddress: {
    type: "Public",
    ports: [{ port: 80 }],
    dnsNameLabel: "my-nginx-app"
  }
});

console.log(`Access at: http://${web.fqdn}`);
```

### Container with Environment Variables

Deploy a container with configuration:

```ts
const api = await ContainerInstance("api", {
  resourceGroup: rg,
  image: "myregistry.azurecr.io/api:v1",
  cpu: 2,
  memoryInGB: 4,
  environmentVariables: {
    NODE_ENV: "production",
    PORT: "3000",
    API_KEY: alchemy.secret.env.API_KEY,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL
  },
  ipAddress: {
    type: "Public",
    ports: [{ port: 3000 }],
    dnsNameLabel: "my-api"
  }
});
```

### Container in Virtual Network

Deploy a container into a VNet with network security:

```ts
const vnet = await VirtualNetwork("app-network", {
  resourceGroup: rg,
  location: "eastus",
  addressSpace: ["10.0.0.0/16"],
  subnets: [
    { name: "containers", addressPrefix: "10.0.1.0/24" }
  ]
});

const nsg = await NetworkSecurityGroup("container-nsg", {
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
    }
  ]
});

const container = await ContainerInstance("app", {
  resourceGroup: rg,
  image: "mcr.microsoft.com/azuredocs/aci-helloworld",
  cpu: 1,
  memoryInGB: 1.5,
  subnet: {
    virtualNetwork: vnet,
    subnetName: "containers"
  },
  ipAddress: {
    type: "Private",
    ports: [{ port: 80 }]
  }
});
```

### Multi-Port Container

Expose multiple ports (e.g., app + metrics):

```ts
const app = await ContainerInstance("app", {
  resourceGroup: rg,
  image: "myapp:latest",
  cpu: 1,
  memoryInGB: 2,
  ipAddress: {
    type: "Public",
    ports: [
      { port: 8080, protocol: "TCP" },  // Application
      { port: 9090, protocol: "TCP" }   // Metrics
    ],
    dnsNameLabel: "my-app-with-metrics"
  }
});

console.log(`App: http://${app.fqdn}:8080`);
console.log(`Metrics: http://${app.fqdn}:9090`);
```

### Custom Command

Override the container's default command:

```ts
const job = await ContainerInstance("batch-job", {
  resourceGroup: rg,
  image: "python:3.11",
  cpu: 2,
  memoryInGB: 4,
  restartPolicy: "OnFailure",
  command: [
    "python",
    "-c",
    "import time; print('Processing...'); time.sleep(30); print('Done!')"
  ],
  environmentVariables: {
    JOB_ID: "job-123",
    OUTPUT_BUCKET: "s3://results"
  }
});
```

### High CPU Container

Run compute-intensive workloads:

```ts
const compute = await ContainerInstance("compute", {
  resourceGroup: rg,
  image: "mycompute:latest",
  cpu: 4,
  memoryInGB: 16,
  restartPolicy: "Never",
  environmentVariables: {
    THREADS: "4",
    MEMORY_LIMIT: "16GB"
  }
});
```

### Adopt Existing Container

Adopt a container instance created outside Alchemy:

```ts
const existing = await ContainerInstance("existing-container", {
  name: "my-existing-container",
  resourceGroup: "existing-rg",
  location: "eastus",
  image: "nginx:latest",
  adopt: true
});
```

## Resource Limits

Azure Container Instances support the following limits:

### Linux Containers

| CPU | Memory (GB) |
|-----|-------------|
| 0.5 - 4 | 0.5 - 16 |

### Windows Containers

| CPU | Memory (GB) |
|-----|-------------|
| 1 - 4 | 1 - 16 |

CPU and memory can be fractional (e.g., 1.5 cores, 2.5 GB).

## Restart Policies

| Policy | Description | Use Case |
|--------|-------------|----------|
| `Always` | Always restart on failure | Long-running services, web apps |
| `OnFailure` | Restart only on failure | Retry-able jobs, batch processing |
| `Never` | Never restart | One-time jobs, data migrations |

## Important Notes

- **Billing**: Charged per second for CPU and memory allocation
- **Startup Time**: Typically < 1 second for Linux containers
- **Public IPs**: Each container group can have one public IP
- **DNS Names**: Auto-generated FQDN: `<label>.<region>.azurecontainer.io`
- **Secrets**: Use `alchemy.secret()` for sensitive environment variables
- **VNet Integration**: Private IPs require VNet and subnet configuration
- **Name Immutability**: Container group name and location cannot be changed
- **State Persistence**: Containers are stateless - use Azure Files for persistence

## Common Patterns

### Microservice with Database

```ts
const db = await PostgreSQLFlexibleServer("db", {
  resourceGroup: rg,
  location: "eastus",
  administratorLogin: "adminuser",
  administratorPassword: alchemy.secret.env.DB_PASSWORD,
  sku: "B_Standard_B1ms",
  storageSizeGB: 32
});

const api = await ContainerInstance("api", {
  resourceGroup: rg,
  image: "myapi:latest",
  cpu: 2,
  memoryInGB: 4,
  environmentVariables: {
    DATABASE_HOST: db.fullyQualifiedDomainName,
    DATABASE_USER: "adminuser",
    DATABASE_PASSWORD: alchemy.secret.env.DB_PASSWORD,
    DATABASE_NAME: "mydb"
  },
  ipAddress: {
    type: "Public",
    ports: [{ port: 3000 }],
    dnsNameLabel: "my-api"
  }
});
```

### Worker Container

```ts
const worker = await ContainerInstance("worker", {
  resourceGroup: rg,
  image: "myworker:latest",
  cpu: 1,
  memoryInGB: 2,
  restartPolicy: "Always",
  environmentVariables: {
    QUEUE_URL: alchemy.secret.env.QUEUE_URL,
    WORKER_ID: "worker-1"
  },
  // No public IP - internal worker
});
```

### Scheduled Job

```ts
const job = await ContainerInstance("nightly-backup", {
  resourceGroup: rg,
  image: "backup-tool:latest",
  cpu: 2,
  memoryInGB: 4,
  restartPolicy: "Never",
  command: ["/app/backup.sh", "--full"],
  environmentVariables: {
    BACKUP_DESTINATION: alchemy.secret.env.BACKUP_URL,
    RETENTION_DAYS: "30"
  }
});
```

### Preserve Container

Keep container when removing from Alchemy (useful for stateful workloads):

```ts
const stateful = await ContainerInstance("stateful-app", {
  resourceGroup: rg,
  image: "myapp:latest",
  cpu: 2,
  memoryInGB: 4,
  delete: false,
  ipAddress: {
    type: "Public",
    ports: [{ port: 8080 }]
  },
  tags: {
    preserve: "true",
    critical: "true"
  }
});
```

## Related Resources

- [VirtualNetwork](/docs/providers/azure/virtual-network) - Deploy containers in isolated networks
- [NetworkSecurityGroup](/docs/providers/azure/network-security-group) - Control container network access
- [ResourceGroup](/docs/providers/azure/resource-group) - Container for container instances
- [Azure Container Instances Documentation](https://learn.microsoft.com/azure/container-instances/)

## Official Documentation

- [Container Instances Overview](https://learn.microsoft.com/azure/container-instances/container-instances-overview)
- [Container Groups](https://learn.microsoft.com/azure/container-instances/container-instances-container-groups)
- [Virtual Network Deployment](https://learn.microsoft.com/azure/container-instances/container-instances-vnet)
- [Environment Variables](https://learn.microsoft.com/azure/container-instances/container-instances-environment-variables)

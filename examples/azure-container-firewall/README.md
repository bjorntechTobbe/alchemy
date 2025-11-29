# Azure Container with Firewall Example

This example demonstrates how to deploy a Docker container to Azure with a public IP address and network security controls (firewall).

## Architecture

```
Internet → Public IP Address → Network Security Group (Firewall) → Virtual Network → Container Instance
```

### Components

1. **Resource Group** - Logical container for all resources
2. **Virtual Network** - Provides network isolation (10.0.0.0/16)
3. **Network Security Group (NSG)** - Firewall that controls inbound/outbound traffic
4. **Public IP Address** - Static IP with DNS name for external access
5. **Container Instance** - Runs NGINX web server in a Docker container

## What This Example Shows

- ✅ How to deploy a Docker container to Azure
- ✅ How to assign a public IP address to a container
- ✅ How to configure firewall rules with Network Security Groups
- ✅ How to connect containers to a virtual network
- ✅ How to set environment variables for containers
- ✅ How to get a publicly accessible DNS name

## Prerequisites

1. **Azure Account** - You need an active Azure subscription
2. **Azure CLI** - Install from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
3. **Bun** - Install from https://bun.sh

## Setup

### 1. Login to Azure

```bash
az login
```

### 2. Set Your Subscription

```bash
# List available subscriptions
az account list --output table

# Set the subscription you want to use
az account set --subscription "Your Subscription Name"

# Verify the current subscription
az account show
```

### 3. Export Subscription ID

```bash
export AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
```

## Deploy

Run the deployment script:

```bash
bun ./alchemy.run.ts
```

Or use the npm script:

```bash
bun run deploy
```

### What Gets Deployed

The script will create:
- 1 Resource Group in East US
- 1 Virtual Network with a /16 address space
- 1 Subnet (/24) for containers
- 1 Network Security Group with 3 firewall rules:
  - Allow HTTP (port 80)
  - Allow HTTPS (port 443)
  - Deny all other inbound traffic
- 1 Public IP Address with DNS name
- 1 Container Instance running NGINX

### Expected Output

```
✅ Deployment Complete!

📊 Resource Details:
   Resource Group: azure-container-firewall-prod-container-rg
   Location: eastus
   Virtual Network: azure-container-firewall-prod-container-vnet (10.0.0.0/16)
   Network Security Group: azure-container-firewall-prod-container-nsg
   Public IP: 20.xxx.xxx.xxx
   DNS Name: container-1234567890.eastus.cloudapp.azure.com

🌐 Access Your Container:
   HTTP:  http://container-1234567890.eastus.cloudapp.azure.com
   HTTPS: https://container-1234567890.eastus.cloudapp.azure.com

🔒 Firewall Rules:
   ✓ Allow HTTP (port 80) from anywhere
   ✓ Allow HTTPS (port 443) from anywhere
   ✗ Deny all other inbound traffic

🐳 Container Details:
   Name: azure-container-firewall-prod-nginx-container
   Image: nginx:alpine
   CPU: 1.0 cores
   Memory: 1.5 GB
   State: Running
   IP Address: 20.xxx.xxx.xxx
```

## Test the Deployment

Once deployed, visit the HTTP URL shown in the output. You should see the NGINX welcome page.

```bash
# Using curl
curl http://<your-dns-name>

# Or open in browser
open http://<your-dns-name>
```

## View Container Logs

```bash
# Replace with your actual resource group and container name
az container logs \
  --resource-group azure-container-firewall-prod-container-rg \
  --name azure-container-firewall-prod-nginx-container
```

## Firewall Configuration

The Network Security Group is configured with the following rules:

| Priority | Name | Direction | Access | Protocol | Source | Destination | Port |
|----------|------|-----------|--------|----------|--------|-------------|------|
| 100 | allow-http | Inbound | Allow | TCP | * | * | 80 |
| 110 | allow-https | Inbound | Allow | TCP | * | * | 443 |
| 4000 | deny-all-inbound | Inbound | Deny | * | * | * | * |

### Customize Firewall Rules

To restrict access to specific IP addresses, modify the `sourceAddressPrefix` in `alchemy.run.ts`:

```typescript
{
  name: "allow-http",
  priority: 100,
  direction: "Inbound",
  access: "Allow",
  protocol: "Tcp",
  sourceAddressPrefix: "1.2.3.4/32", // Your IP address
  // ... rest of config
}
```

## Destroy

To tear down all resources:

```bash
bun ./alchemy.run.ts --destroy
```

Or use the npm script:

```bash
bun run destroy
```

## Cost

This example uses the following Azure resources:

- **Container Instance**: ~$0.04/hour (1 vCPU, 1.5 GB memory)
- **Public IP Address (Static)**: ~$0.004/hour
- **Virtual Network**: Free
- **Network Security Group**: Free

**Estimated Total**: ~$0.044/hour (~$32/month if left running)

> 💡 **Tip**: Always destroy resources when you're done testing to avoid unnecessary costs!

## Customization

### Use a Different Container Image

Replace the `image` property in `alchemy.run.ts`:

```typescript
const container = await ContainerInstance("my-container", {
  image: "your-registry.azurecr.io/your-image:tag",
  // ... rest of config
});
```

### Add More Resources

You can adjust CPU and memory:

```typescript
const container = await ContainerInstance("my-container", {
  cpu: 2.0,        // 2 vCPUs
  memoryInGB: 4.0, // 4 GB RAM
  // ... rest of config
});
```

### Add HTTPS with a Custom Certificate

For production, you'll want to:
1. Use Azure Front Door or Application Gateway for SSL termination
2. Bring your own certificate
3. Configure the container to use HTTPS

## Troubleshooting

### Container Won't Start

Check the container logs:
```bash
az container logs --resource-group <rg-name> --name <container-name>
```

### Can't Access the Container

1. Check the NSG rules allow your traffic
2. Verify the container is running: `az container show --resource-group <rg-name> --name <container-name>`
3. Wait a few minutes for DNS propagation

### Authentication Errors

Make sure you're logged in to Azure:
```bash
az login
az account show
```

## Learn More

- [Azure Container Instances Documentation](https://docs.microsoft.com/en-us/azure/container-instances/)
- [Azure Virtual Networks](https://docs.microsoft.com/en-us/azure/virtual-network/)
- [Network Security Groups](https://docs.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview)
- [Alchemy Documentation](https://alchemy.run)

## License

This example is part of the Alchemy project and is licensed under the same terms.

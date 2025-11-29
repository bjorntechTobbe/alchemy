import { alchemy } from "../../alchemy/src/alchemy.ts";
import { ResourceGroup } from "../../alchemy/src/azure/resource-group.ts";
import { VirtualNetwork } from "../../alchemy/src/azure/virtual-network.ts";
import { NetworkSecurityGroup } from "../../alchemy/src/azure/network-security-group.ts";
import { PublicIPAddress } from "../../alchemy/src/azure/public-ip-address.ts";
import { ContainerInstance } from "../../alchemy/src/azure/container-instance.ts";

/**
 * Azure Container with Firewall Example
 * 
 * This example demonstrates how to deploy a Docker container to Azure with:
 * - A public IP address for external access
 * - A Network Security Group (firewall) to control inbound/outbound traffic
 * - A Virtual Network for network isolation
 * - An NGINX web server running in the container
 * 
 * Architecture:
 * Internet → Public IP → NSG (Firewall) → VNet → Container Instance (NGINX)
 */

const app = await alchemy("azure-container-firewall");

// Create a resource group to contain all resources
const rg = await ResourceGroup("container-rg", {
  location: "eastus",
  tags: {
    project: "azure-container-firewall",
    environment: "demo",
  },
});

// Create a virtual network for network isolation
const vnet = await VirtualNetwork("container-vnet", {
  resourceGroup: rg,
  addressSpace: ["10.0.0.0/16"],
  subnets: [
    {
      name: "container-subnet",
      addressPrefix: "10.0.1.0/24",
    },
  ],
  tags: {
    purpose: "container-isolation",
  },
});

// Create a Network Security Group (firewall)
const nsg = await NetworkSecurityGroup("container-nsg", {
  resourceGroup: rg,
  securityRules: [
    {
      name: "allow-http",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourceAddressPrefix: "*", // Allow from anywhere (use specific IPs in production)
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "80",
      description: "Allow HTTP traffic to the web server",
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
      destinationPortRange: "443",
      description: "Allow HTTPS traffic to the web server",
    },
    {
      name: "deny-all-inbound",
      priority: 4000,
      direction: "Inbound",
      access: "Deny",
      protocol: "*",
      sourceAddressPrefix: "*",
      sourcePortRange: "*",
      destinationAddressPrefix: "*",
      destinationPortRange: "*",
      description: "Deny all other inbound traffic (default deny)",
    },
  ],
  tags: {
    purpose: "firewall",
  },
});

// Create a public IP address for external access
const publicIp = await PublicIPAddress("container-ip", {
  resourceGroup: rg,
  allocationMethod: "Static",
  sku: "Standard",
  domainNameLabel: `container-${Date.now()}`, // Globally unique DNS name
  tags: {
    purpose: "container-access",
  },
});

// Deploy a container instance with NGINX web server
const container = await ContainerInstance("nginx-container", {
  resourceGroup: rg,
  
  // Container configuration
  image: "nginx:alpine",
  cpu: 1.0,
  memoryInGB: 1.5,
  osType: "Linux",
  
  // Network configuration with public IP
  ipAddress: {
    type: "Public",
    ports: [
      { port: 80, protocol: "TCP" },
      { port: 443, protocol: "TCP" },
    ],
  },
  
  // Connect to virtual network
  subnet: {
    virtualNetwork: vnet,
    subnetName: "container-subnet",
  },
  
  // Environment variables for the container
  environmentVariables: {
    NGINX_HOST: publicIp.fqdn || publicIp.ipAddress || "localhost",
    NGINX_PORT: "80",
  },
  
  // Restart policy
  restartPolicy: "Always",
  
  tags: {
    app: "nginx",
    purpose: "web-server",
  },
});

// Output the connection details
console.log("\n✅ Deployment Complete!");
console.log("\n📊 Resource Details:");
console.log(`   Resource Group: ${rg.name}`);
console.log(`   Location: ${rg.location}`);
console.log(`   Virtual Network: ${vnet.name} (${vnet.addressSpace.join(", ")})`);
console.log(`   Network Security Group: ${nsg.name}`);
console.log(`   Public IP: ${publicIp.ipAddress}`);
console.log(`   DNS Name: ${publicIp.fqdn}`);

console.log("\n🌐 Access Your Container:");
console.log(`   HTTP:  http://${publicIp.fqdn}`);
console.log(`   HTTPS: https://${publicIp.fqdn}`);

console.log("\n🔒 Firewall Rules:");
console.log(`   ✓ Allow HTTP (port 80) from anywhere`);
console.log(`   ✓ Allow HTTPS (port 443) from anywhere`);
console.log(`   ✗ Deny all other inbound traffic`);

console.log("\n🐳 Container Details:");
console.log(`   Name: ${container.name}`);
console.log(`   Image: nginx:alpine`);
console.log(`   CPU: 1.0 cores`);
console.log(`   Memory: 1.5 GB`);
console.log(`   State: ${container.instanceState}`);
console.log(`   IP Address: ${container.ipAddress}`);

console.log("\n💡 Next Steps:");
console.log(`   1. Visit http://${publicIp.fqdn} to see the NGINX welcome page`);
console.log(`   2. Check container logs: az container logs --resource-group ${rg.name} --name ${container.name}`);
console.log(`   3. Destroy resources: bun ./alchemy.run --destroy`);

await app.finalize();

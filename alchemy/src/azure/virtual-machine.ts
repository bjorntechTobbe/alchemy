import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { VirtualNetwork } from "./virtual-network.ts";
import type { NetworkSecurityGroup } from "./network-security-group.ts";
import type { PublicIPAddress } from "./public-ip-address.ts";
import type { VirtualMachine as AzureVirtualMachine, VirtualMachineUpdate } from "@azure/arm-compute";
import { isNotFoundError } from "./error.ts";
import * as crypto from "crypto";

export interface VirtualMachineProps extends AzureClientProps {
  /**
   * Name of the virtual machine
   * Must be 1-64 characters for Linux, 1-15 characters for Windows
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this virtual machine in
   * Can be a ResourceGroup object or the name of an existing resource group
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this virtual machine
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * VM size (SKU)
   * @default "Standard_B1s" (cheapest option ~$4/month)
   * @example "Standard_B1s", "Standard_B2s", "Standard_D2s_v3"
   */
  vmSize?: string;

  /**
   * Operating system type
   * @default "Linux"
   */
  osType?: "Linux" | "Windows";

  /**
   * Image reference for the VM
   * @default Ubuntu 22.04 LTS
   */
  imageReference?: {
    publisher?: string;
    offer?: string;
    sku?: string;
    version?: string;
  };

  /**
   * Admin username for the VM
   * @default "azureuser"
   */
  adminUsername?: string;

  /**
   * SSH public key for Linux VMs (required for Linux)
   * Can be the key content or a path to a public key file
   */
  sshPublicKey?: string;

  /**
   * Admin password for Windows VMs or Linux VMs without SSH
   * Must meet Azure password requirements
   */
  adminPassword?: string;

  /**
   * Virtual network to attach the VM to
   * Can be a VirtualNetwork object or the name of an existing virtual network
   */
  virtualNetwork?: string | VirtualNetwork;

  /**
   * Subnet name within the virtual network
   * @default "default"
   */
  subnetName?: string;

  /**
   * Network security group to associate with the VM's network interface
   * Can be a NetworkSecurityGroup object or the resource ID
   */
  networkSecurityGroup?: string | NetworkSecurityGroup;

  /**
   * Public IP address to attach to the VM
   * Can be a PublicIPAddress object or the resource ID
   */
  publicIPAddress?: string | PublicIPAddress;

  /**
   * Whether to enable IP forwarding on the network interface
   * Required for NAT/routing scenarios
   * @default false
   */
  enableIPForwarding?: boolean;

  /**
   * OS disk size in GB
   * @default 30 (minimum for most images)
   */
  osDiskSizeGB?: number;

  /**
   * OS disk storage account type
   * @default "Standard_LRS"
   */
  osDiskStorageAccountType?: "Standard_LRS" | "Premium_LRS" | "StandardSSD_LRS";

  /**
   * Custom data (cloud-init) script to run on first boot
   * Must be base64 encoded or will be encoded automatically
   */
  customData?: string;

  /**
   * User data script that persists and can be retrieved later
   * Must be base64 encoded or will be encoded automatically
   */
  userData?: string;

  /**
   * Tags to apply to the virtual machine and associated resources
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing virtual machine
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the virtual machine when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal virtual machine ID for lifecycle management
   * @internal
   */
  virtualMachineId?: string;

  /**
   * Internal hash of customData for change detection
   * @internal
   */
  customDataHash?: string;

  /**
   * Internal network interface ID for lifecycle management
   * @internal
   */
  networkInterfaceId?: string;
}

export type VirtualMachine = Omit<VirtualMachineProps, "delete" | "adopt"> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The virtual machine name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID of the VM
   */
  virtualMachineId: string;

  /**
   * The Azure resource ID of the network interface
   */
  networkInterfaceId: string;

  /**
   * The private IP address of the VM
   */
  privateIPAddress?: string;

  /**
   * The public IP address of the VM (if attached)
   */
  publicIPAddress?: string;

  /**
   * Provisioning state
   */
  provisioningState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::VirtualMachine";
};

/**
 * Azure Virtual Machine for compute workloads
 *
 * Virtual Machines provide full control over the operating system and networking,
 * making them ideal for workloads that require specific port configurations,
 * IP forwarding, or custom networking setups like SIP/RTP traffic.
 *
 * @example
 * ## Basic Linux VM with SSH
 *
 * Create a simple Linux VM:
 *
 * ```ts
 * const rg = await ResourceGroup("vm-rg", {
 *   location: "eastus"
 * });
 *
 * const vm = await VirtualMachine("my-vm", {
 *   resourceGroup: rg,
 *   vmSize: "Standard_B1s",
 *   sshPublicKey: "ssh-rsa AAAA...",
 * });
 * ```
 *
 * @example
 * ## VM with Public IP and NSG
 *
 * Create a VM with public IP and network security group:
 *
 * ```ts
 * const publicIp = await PublicIPAddress("vm-ip", {
 *   resourceGroup: rg,
 *   allocationMethod: "Static",
 *   sku: "Standard"
 * });
 *
 * const nsg = await NetworkSecurityGroup("vm-nsg", {
 *   resourceGroup: rg,
 *   securityRules: [{
 *     name: "allow-ssh",
 *     priority: 100,
 *     direction: "Inbound",
 *     access: "Allow",
 *     protocol: "Tcp",
 *     destinationPortRange: "22"
 *   }]
 * });
 *
 * const vm = await VirtualMachine("secure-vm", {
 *   resourceGroup: rg,
 *   publicIPAddress: publicIp,
 *   networkSecurityGroup: nsg,
 *   sshPublicKey: "ssh-rsa AAAA..."
 * });
 * ```
 *
 * @example
 * ## VM with IP Forwarding for NAT/SIP Gateway
 *
 * Create a VM configured as a NAT gateway or SIP proxy:
 *
 * ```ts
 * const vm = await VirtualMachine("sip-gateway", {
 *   resourceGroup: rg,
 *   vmSize: "Standard_B2s",
 *   enableIPForwarding: true,
 *   publicIPAddress: publicIp,
 *   networkSecurityGroup: sipNsg,
 *   customData: `#!/bin/bash
 *     # Enable IP forwarding
 *     echo 1 > /proc/sys/net/ipv4/ip_forward
 *     # Configure iptables for NAT
 *     iptables -t nat -A POSTROUTING -j MASQUERADE
 *   `,
 *   sshPublicKey: "ssh-rsa AAAA..."
 * });
 * ```
 *
 * @example
 * ## VM with Docker for Container Workloads
 *
 * Create a VM with Docker pre-installed:
 *
 * ```ts
 * const vm = await VirtualMachine("docker-host", {
 *   resourceGroup: rg,
 *   vmSize: "Standard_B2s",
 *   customData: `#!/bin/bash
 *     apt-get update
 *     apt-get install -y docker.io
 *     systemctl enable docker
 *     systemctl start docker
 *     docker run -d --restart=always -p 5060:5060/udp -p 5061:5061/tcp my-sip-image
 *   `,
 *   sshPublicKey: "ssh-rsa AAAA..."
 * });
 * ```
 */
export const VirtualMachine = Resource(
  "azure::VirtualMachine",
  async function (
    this: Context<VirtualMachine>,
    id: string,
    props: VirtualMachineProps,
  ): Promise<VirtualMachine> {
    const virtualMachineId =
      props.virtualMachineId || this.output?.virtualMachineId;
    const networkInterfaceId =
      props.networkInterfaceId || this.output?.networkInterfaceId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (this.scope.local) {
      return {
        id,
        name,
        virtualMachineId: virtualMachineId || `local-vm-${id}`,
        networkInterfaceId: networkInterfaceId || `local-nic-${id}`,
        location: props.location || "eastus",
        privateIPAddress: "10.0.0.4",
        publicIPAddress: "203.0.113.1",
        provisioningState: "Succeeded",
        resourceGroup: props.resourceGroup,
        vmSize: props.vmSize || "Standard_B1s",
        osType: props.osType || "Linux",
        adminUsername: props.adminUsername || "azureuser",
        tags: props.tags,
        type: "azure::VirtualMachine",
      };
    }

    const clients = await createAzureClients(props);
    const resourceGroupName: string =
      typeof this.output?.resourceGroup === "string"
        ? this.output.resourceGroup
        : typeof props.resourceGroup === "string"
          ? props.resourceGroup
          : props.resourceGroup.name;

    // Get resource group for location inheritance
    let location = this.output?.location ?? props.location;
    if (!location) {
      const rg = await clients.resources.resourceGroups.get(resourceGroupName);
      location = rg.location!;
    }

    const nicName = `${name}-nic`;
    const osDiskName = `${name}-osdisk`;

    if (this.phase === "delete") {
      if (props.delete !== false) {
        // Delete VM first
        if (virtualMachineId) {
          try {
            await clients.compute.virtualMachines.beginDeleteAndWait(
              resourceGroupName,
              name,
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }
        }

        // Delete NIC
        if (networkInterfaceId) {
          try {
            await clients.network.networkInterfaces.beginDeleteAndWait(
              resourceGroupName,
              nicName,
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }
        }

        // Delete OS disk
        try {
          await clients.compute.disks.beginDeleteAndWait(
            resourceGroupName,
            osDiskName,
          );
        } catch (error) {
          if (!isNotFoundError(error)) {
            // Ignore disk deletion errors
          }
        }
      }
      return this.destroy();
    }

    // Validate name format
    const maxLength = (props.osType || "Linux") === "Linux" ? 64 : 15;
    if (name.length > maxLength) {
      throw new Error(
        `Virtual machine name "${name}" is too long. Maximum ${maxLength} characters for ${props.osType || "Linux"}.`,
      );
    }

    // Calculate customData hash for change detection
    const customDataHash = props.customData 
      ? crypto.createHash('sha256').update(props.customData).digest('hex').substring(0, 16)
      : undefined;

    if (this.phase === "update" && this.output) {
      // Check for changes that require VM replacement (cannot update in-place)
      const replaceReasons: string[] = [];

      if (this.output.name !== name) {
        replaceReasons.push(`name: ${this.output.name} → ${name}`);
      }
      if (this.output.location !== location) {
        replaceReasons.push(`location: ${this.output.location} → ${location}`);
      }
      if (customDataHash !== this.output.customDataHash) {
        replaceReasons.push(`customData changed (hash: ${this.output.customDataHash} → ${customDataHash})`);
      }
      if (this.output.vmSize !== props.vmSize) {
        replaceReasons.push(`vmSize: ${this.output.vmSize} → ${props.vmSize}`);
      }
      if (this.output.osType !== (props.osType || "Linux")) {
        replaceReasons.push(`osType: ${this.output.osType} → ${props.osType || "Linux"}`);
      }
      // Check imageReference changes
      const currentImage = this.output.imageReference;
      const newImage = props.imageReference || {
        publisher: "Canonical",
        offer: "0001-com-ubuntu-server-jammy",
        sku: "22_04-lts-gen2",
        version: "latest",
      };
      if (currentImage && (
        currentImage.publisher !== newImage.publisher ||
        currentImage.offer !== newImage.offer ||
        currentImage.sku !== newImage.sku
      )) {
        replaceReasons.push(`imageReference changed`);
      }
      // Check network changes (VNet/subnet)
      const currentVnet = typeof this.output.virtualNetwork === 'string' 
        ? this.output.virtualNetwork 
        : this.output.virtualNetwork?.name;
      const newVnet = typeof props.virtualNetwork === 'string'
        ? props.virtualNetwork
        : props.virtualNetwork?.name;
      if (currentVnet !== newVnet) {
        replaceReasons.push(`virtualNetwork: ${currentVnet} → ${newVnet}`);
      }
      if (this.output.subnetName !== props.subnetName) {
        replaceReasons.push(`subnetName: ${this.output.subnetName} → ${props.subnetName}`);
      }

      if (replaceReasons.length > 0) {
        console.log(`[VirtualMachine] Replacing VM due to:\n  - ${replaceReasons.join('\n  - ')}`);
        // Use force=true to delete old VM immediately before creating new one
        // This is required because Azure VMs with the same name in the same resource group
        // cannot coexist, and we need to ensure the old one is gone before creating the new one
        return this.replace(true);
      }
    }

    // Resolve virtual network
    let vnetName: string | undefined;
    let subnetId: string | undefined;

    if (props.virtualNetwork) {
      vnetName =
        typeof props.virtualNetwork === "string"
          ? props.virtualNetwork
          : props.virtualNetwork.name;

      const subnetName = props.subnetName || "default";
      const vnet = await clients.network.virtualNetworks.get(
        resourceGroupName,
        vnetName,
      );
      const subnet = vnet.subnets?.find((s) => s.name === subnetName);
      if (!subnet) {
        throw new Error(
          `Subnet "${subnetName}" not found in virtual network "${vnetName}"`,
        );
      }
      subnetId = subnet.id;
    }

    // Resolve NSG
    let nsgId: string | undefined;
    if (props.networkSecurityGroup) {
      nsgId =
        typeof props.networkSecurityGroup === "string"
          ? props.networkSecurityGroup
          : props.networkSecurityGroup.networkSecurityGroupId;
    }

    // Resolve Public IP
    let publicIpId: string | undefined;
    if (props.publicIPAddress) {
      publicIpId =
        typeof props.publicIPAddress === "string"
          ? props.publicIPAddress
          : props.publicIPAddress.publicIpAddressId;
    }

    // Create or update Network Interface
    const nicParams: any = {
      location,
      tags: props.tags,
      enableIPForwarding: props.enableIPForwarding || false,
      ipConfigurations: [
        {
          name: "ipconfig1",
          privateIPAllocationMethod: "Dynamic",
          subnet: subnetId ? { id: subnetId } : undefined,
          publicIPAddress: publicIpId ? { id: publicIpId } : undefined,
        },
      ],
    };

    if (nsgId) {
      nicParams.networkSecurityGroup = { id: nsgId };
    }

    // If no subnet specified, we need a default subnet
    if (!subnetId) {
      // Create a default VNet and subnet if none provided
      const defaultVnetName = `${name}-vnet`;
      const defaultSubnetName = "default";

      try {
        await clients.network.virtualNetworks.get(
          resourceGroupName,
          defaultVnetName,
        );
      } catch (error) {
        if (isNotFoundError(error)) {
          // Create default VNet
          await clients.network.virtualNetworks.beginCreateOrUpdateAndWait(
            resourceGroupName,
            defaultVnetName,
            {
              location,
              addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
              subnets: [{ name: defaultSubnetName, addressPrefix: "10.0.0.0/24" }],
            },
          );
        } else {
          throw error;
        }
      }

      const vnet = await clients.network.virtualNetworks.get(
        resourceGroupName,
        defaultVnetName,
      );
      subnetId = vnet.subnets?.[0]?.id;
      nicParams.ipConfigurations[0].subnet = { id: subnetId };
    }

    const nic = await clients.network.networkInterfaces.beginCreateOrUpdateAndWait(
      resourceGroupName,
      nicName,
      nicParams,
    );

    // Prepare VM parameters
    const vmSize = props.vmSize || "Standard_B1s";
    const osType = props.osType || "Linux";
    const adminUsername = props.adminUsername || "azureuser";

    const imageReference = props.imageReference || {
      publisher: "Canonical",
      offer: "0001-com-ubuntu-server-jammy",
      sku: "22_04-lts-gen2",
      version: "latest",
    };

    const vmParams: AzureVirtualMachine = {
      location,
      tags: props.tags,
      hardwareProfile: {
        vmSize,
      },
      storageProfile: {
        imageReference,
        osDisk: {
          name: osDiskName,
          createOption: "FromImage",
          diskSizeGB: props.osDiskSizeGB || 30,
          managedDisk: {
            storageAccountType: props.osDiskStorageAccountType || "Standard_LRS",
          },
        },
      },
      osProfile: {
        computerName: name.substring(0, 15).replace(/[^a-zA-Z0-9-]/g, ""),
        adminUsername,
      },
      networkProfile: {
        networkInterfaces: [{ id: nic.id, primary: true }],
      },
    };

    // Configure authentication
    if (osType === "Linux") {
      if (props.sshPublicKey) {
        vmParams.osProfile!.linuxConfiguration = {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [
              {
                path: `/home/${adminUsername}/.ssh/authorized_keys`,
                keyData: props.sshPublicKey,
              },
            ],
          },
        };
      } else if (props.adminPassword) {
        vmParams.osProfile!.adminPassword = props.adminPassword;
        vmParams.osProfile!.linuxConfiguration = {
          disablePasswordAuthentication: false,
        };
      } else {
        throw new Error(
          "Either sshPublicKey or adminPassword is required for Linux VMs",
        );
      }
    } else {
      // Windows
      if (!props.adminPassword) {
        throw new Error("adminPassword is required for Windows VMs");
      }
      vmParams.osProfile!.adminPassword = props.adminPassword;
      vmParams.osProfile!.windowsConfiguration = {
        provisionVMAgent: true,
      };
    }

    // Add custom data (cloud-init) - runs on first boot
    if (props.customData) {
      // Check if already base64 encoded
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(props.customData);
      vmParams.osProfile!.customData = isBase64
        ? props.customData
        : Buffer.from(props.customData).toString("base64");
    }

    // Add user data
    if (props.userData) {
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(props.userData);
      vmParams.userData = isBase64
        ? props.userData
        : Buffer.from(props.userData).toString("base64");
    }

    // Check if VM exists in Azure and handle replacement for immutable properties
    let existingVm: AzureVirtualMachine | undefined;
    try {
      existingVm = await clients.compute.virtualMachines.get(
        resourceGroupName,
        name,
      );
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    if (existingVm) {
      // VM exists in Azure - check if we need to replace it due to immutable property changes
      // This handles the case where state was lost (new state store) but VM still exists
      const replaceReasons: string[] = [];

      // Check customData - Azure stores it but we can compare hashes
      // If we have customData and the VM exists, we need to check if it matches
      // Since Azure doesn't return customData, we compare against stored hash or assume change
      if (props.customData && !this.output?.customDataHash) {
        // No stored hash means we can't verify - assume replacement needed if customData is provided
        // This is conservative but safe - better to replace than fail
        replaceReasons.push(`customData provided but no previous hash in state (state may have been reset)`);
      }

      // Check vmSize
      if (props.vmSize && existingVm.hardwareProfile?.vmSize !== props.vmSize) {
        replaceReasons.push(`vmSize: ${existingVm.hardwareProfile?.vmSize} → ${props.vmSize}`);
      }

      // Check location
      if (existingVm.location?.toLowerCase() !== location.toLowerCase()) {
        replaceReasons.push(`location: ${existingVm.location} → ${location}`);
      }

      // Check OS type via image
      const existingPublisher = existingVm.storageProfile?.imageReference?.publisher;
      const newImage = props.imageReference || {
        publisher: "Canonical",
        offer: "0001-com-ubuntu-server-jammy",
        sku: "22_04-lts-gen2",
        version: "latest",
      };
      if (existingPublisher && existingPublisher !== newImage.publisher) {
        replaceReasons.push(`imageReference.publisher: ${existingPublisher} → ${newImage.publisher}`);
      }

      if (replaceReasons.length > 0) {
        if (!adopt) {
          console.log(`[VirtualMachine] VM "${name}" exists with incompatible properties. Replacing due to:\n  - ${replaceReasons.join('\n  - ')}`);
          
          // Delete existing VM and its resources before creating new one
          console.log(`[VirtualMachine] Deleting existing VM "${name}"...`);
          await clients.compute.virtualMachines.beginDeleteAndWait(
            resourceGroupName,
            name,
          );
          
          // Delete the old NIC if it exists
          try {
            await clients.network.networkInterfaces.beginDeleteAndWait(
              resourceGroupName,
              nicName,
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              console.warn(`[VirtualMachine] Warning: Could not delete old NIC: ${error}`);
            }
          }
          
          // Delete the old OS disk if it exists
          try {
            await clients.compute.disks.beginDeleteAndWait(
              resourceGroupName,
              osDiskName,
            );
          } catch (error) {
            if (!isNotFoundError(error)) {
              console.warn(`[VirtualMachine] Warning: Could not delete old OS disk: ${error}`);
            }
          }
          
          console.log(`[VirtualMachine] Old VM deleted. Creating new VM...`);
          
          // Re-create the NIC since we deleted it
          const newNic = await clients.network.networkInterfaces.beginCreateOrUpdateAndWait(
            resourceGroupName,
            nicName,
            nicParams,
          );
          vmParams.networkProfile!.networkInterfaces = [{ id: newNic.id, primary: true }];
          
          existingVm = undefined; // Clear so we create fresh
        } else {
          console.log(`[VirtualMachine] Adopting existing VM "${name}" (adopt: true). Skipping property validation.`);
        }
      } else if (!adopt && !virtualMachineId && !this.output) {
        // VM exists but we don't have it in state and not adopting
        throw new Error(
          `Virtual machine "${name}" already exists. Use adopt: true to adopt it.`,
        );
      }
    }

    // Create or update the VM
    const result = await clients.compute.virtualMachines.beginCreateOrUpdateAndWait(
      resourceGroupName,
      name,
      vmParams,
    );

    // Get the NIC to find the private IP
    const nicResult = await clients.network.networkInterfaces.get(
      resourceGroupName,
      nicName,
    );

    const privateIP = nicResult.ipConfigurations?.[0]?.privateIPAddress;

    // Get public IP if attached
    let publicIP: string | undefined;
    if (publicIpId) {
      const publicIpResource = await clients.network.publicIPAddresses.get(
        resourceGroupName,
        publicIpId.split("/").pop()!,
      );
      publicIP = publicIpResource.ipAddress;
    }

    return {
      id,
      name: result.name!,
      virtualMachineId: result.id!,
      networkInterfaceId: nic.id!,
      location: result.location!,
      privateIPAddress: privateIP,
      publicIPAddress: publicIP,
      provisioningState: result.provisioningState,
      resourceGroup: resourceGroupName,
      vmSize: result.hardwareProfile?.vmSize,
      osType,
      adminUsername,
      imageReference: result.storageProfile?.imageReference as any,
      virtualNetwork: props.virtualNetwork,
      subnetName: props.subnetName,
      networkSecurityGroup: props.networkSecurityGroup,
      enableIPForwarding: props.enableIPForwarding,
      osDiskSizeGB: props.osDiskSizeGB,
      osDiskStorageAccountType: props.osDiskStorageAccountType,
      customData: props.customData,
      customDataHash,
      userData: props.userData,
      tags: result.tags,
      sshPublicKey: props.sshPublicKey,
      adminPassword: props.adminPassword,
      type: "azure::VirtualMachine",
    };
  },
);

/**
 * Type guard to check if a resource is a VirtualMachine
 */
export function isVirtualMachine(
  resource: unknown,
): resource is VirtualMachine {
  return (
    typeof resource === "object" &&
    resource !== null &&
    ResourceKind in resource &&
    resource[ResourceKind] === "azure::VirtualMachine"
  );
}

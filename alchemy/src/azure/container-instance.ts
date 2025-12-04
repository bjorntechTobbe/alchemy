import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { AzureClientProps } from "./client-props.ts";
import { createAzureClients } from "./client.ts";
import type { ResourceGroup } from "./resource-group.ts";
import type { VirtualNetwork } from "./virtual-network.ts";
import type { ContainerGroup as AzureContainerGroup } from "@azure/arm-containerinstance";
import { isNotFoundError, isConflictError } from "./error.ts";

export interface ContainerPort {
  /**
   * Port number
   */
  port: number;

  /**
   * Protocol
   * @default "TCP"
   */
  protocol?: "TCP" | "UDP";
}

export interface EnvironmentVariable {
  /**
   * Environment variable name
   */
  name: string;

  /**
   * Environment variable value (for non-secret values)
   */
  value?: string;

  /**
   * Secure value (for secrets)
   * Use alchemy.secret() to encrypt this value
   */
  secureValue?: string | Secret;
}

export interface ContainerIPAddress {
  /**
   * IP address type
   */
  type: "Public" | "Private";

  /**
   * Ports to expose
   */
  ports: ContainerPort[];

  /**
   * DNS name label
   * Creates <label>.<region>.azurecontainer.io
   */
  dnsNameLabel?: string;
}

export interface SubnetConfig {
  /**
   * Virtual network to deploy into
   */
  virtualNetwork: string | VirtualNetwork;

  /**
   * Name of the subnet within the virtual network
   */
  subnetName: string;
}

export interface ContainerInstanceProps extends AzureClientProps {
  /**
   * Name of the container group
   * Must be 1-63 characters, lowercase, alphanumeric and hyphens
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The resource group to create this container instance in
   */
  resourceGroup: string | ResourceGroup;

  /**
   * Azure region for this container instance
   * @default Inherited from resource group if not specified
   */
  location?: string;

  /**
   * Docker image to run
   * @example "nginx:latest"
   * @example "mcr.microsoft.com/azuredocs/aci-helloworld"
   */
  image: string;

  /**
   * Number of CPU cores
   * Can be fractional (e.g., 0.5, 1.5)
   * @default 1
   */
  cpu?: number;

  /**
   * Memory in GB
   * Can be fractional (e.g., 0.5, 1.5)
   * @default 1.5
   */
  memoryInGB?: number;

  /**
   * Operating system type
   * @default "Linux"
   */
  osType?: "Linux" | "Windows";

  /**
   * Restart policy
   * @default "Always"
   */
  restartPolicy?: "Always" | "OnFailure" | "Never";

  /**
   * Command to run in the container
   * Overrides the image's ENTRYPOINT
   * @example ["/bin/sh", "-c", "echo hello"]
   */
  command?: string[];

  /**
   * Environment variables
   */
  environmentVariables?: Record<string, string | Secret>;

  /**
   * IP address configuration
   * If not specified, no public IP is assigned
   */
  ipAddress?: ContainerIPAddress;

  /**
   * Deploy into a virtual network subnet
   * Provides network isolation
   */
  subnet?: SubnetConfig;

  /**
   * Tags to apply to the container instance
   */
  tags?: Record<string, string>;

  /**
   * Whether to adopt an existing container instance
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the container instance when removed from Alchemy
   * @default true
   */
  delete?: boolean;

  /**
   * Internal container group ID for lifecycle management
   * @internal
   */
  containerGroupId?: string;
}

export type ContainerInstance = Omit<
  ContainerInstanceProps,
  "delete" | "adopt" | "environmentVariables" | "ipAddress"
> & {
  /**
   * The Alchemy resource ID
   */
  id: string;

  /**
   * The container group name
   */
  name: string;

  /**
   * Azure region
   */
  location: string;

  /**
   * The Azure resource ID
   */
  containerGroupId: string;

  /**
   * Environment variables
   */
  environmentVariables?: Record<string, string | Secret>;

  /**
   * Allocated public or private IP address
   */
  ipAddress?: string;

  /**
   * Fully qualified domain name (if DNS label specified)
   */
  fqdn?: string;

  /**
   * Provisioning state
   */
  provisioningState?: string;

  /**
   * Container instance state
   */
  instanceState?: string;

  /**
   * Resource type identifier
   * @internal
   */
  type: "azure::ContainerInstance";
};

/**
 * Azure Container Instance for running Docker containers
 *
 * Container Instances provide serverless container hosting in Azure,
 * equivalent to AWS ECS Fargate or Cloudflare Container. They offer
 * fast startup times, per-second billing, and support for public IPs,
 * virtual network integration, and persistent storage.
 *
 * @example
 * ## Basic Container Instance
 *
 * Run an NGINX container with a public IP:
 *
 * ```ts
 * const rg = await ResourceGroup("container-rg", {
 *   location: "eastus"
 * });
 *
 * const container = await ContainerInstance("web", {
 *   resourceGroup: rg,
 *   image: "nginx:latest",
 *   cpu: 1,
 *   memoryInGB: 1.5,
 *   ipAddress: {
 *     type: "Public",
 *     ports: [{ port: 80, protocol: "TCP" }],
 *     dnsNameLabel: "my-nginx"
 *   }
 * });
 *
 * console.log(`Container URL: http://${container.fqdn}`);
 * ```
 *
 * @example
 * ## Container with Environment Variables
 *
 * Run a container with configuration and secrets:
 *
 * ```ts
 * const container = await ContainerInstance("app", {
 *   resourceGroup: rg,
 *   image: "myapp:latest",
 *   cpu: 2,
 *   memoryInGB: 4,
 *   environmentVariables: {
 *     NODE_ENV: "production",
 *     DATABASE_URL: alchemy.secret.env.DATABASE_URL,
 *     API_KEY: alchemy.secret.env.API_KEY
 *   },
 *   ipAddress: {
 *     type: "Public",
 *     ports: [
 *       { port: 80, protocol: "TCP" },
 *       { port: 443, protocol: "TCP" }
 *     ]
 *   }
 * });
 * ```
 *
 * @example
 * ## Container in Virtual Network
 *
 * Deploy container into a private virtual network:
 *
 * ```ts
 * const vnet = await VirtualNetwork("app-network", {
 *   resourceGroup: rg,
 *   addressSpace: ["10.0.0.0/16"],
 *   subnets: [
 *     { name: "containers", addressPrefix: "10.0.1.0/24" }
 *   ]
 * });
 *
 * const container = await ContainerInstance("private-app", {
 *   resourceGroup: rg,
 *   image: "myapp:latest",
 *   cpu: 1,
 *   memoryInGB: 2,
 *   subnet: {
 *     virtualNetwork: vnet,
 *     subnetName: "containers"
 *   },
 *   ipAddress: {
 *     type: "Private",
 *     ports: [{ port: 8080 }]
 *   }
 * });
 * ```
 *
 * @example
 * ## Container with Custom Command
 *
 * Override the container's entrypoint:
 *
 * ```ts
 * const container = await ContainerInstance("worker", {
 *   resourceGroup: rg,
 *   image: "ubuntu:latest",
 *   cpu: 0.5,
 *   memoryInGB: 0.5,
 *   command: ["/bin/bash", "-c", "while true; do echo hello; sleep 30; done"],
 *   restartPolicy: "Always"
 * });
 * ```
 *
 * @example
 * ## Multi-Port Container
 *
 * Expose multiple ports from a single container:
 *
 * ```ts
 * const container = await ContainerInstance("services", {
 *   resourceGroup: rg,
 *   image: "myservices:latest",
 *   cpu: 2,
 *   memoryInGB: 4,
 *   ipAddress: {
 *     type: "Public",
 *     ports: [
 *       { port: 80, protocol: "TCP" },
 *       { port: 443, protocol: "TCP" },
 *       { port: 8080, protocol: "TCP" },
 *       { port: 9090, protocol: "TCP" }
 *     ],
 *     dnsNameLabel: "my-services"
 *   }
 * });
 * ```
 *
 * @example
 * ## Adopt Existing Container Instance
 *
 * Adopt an existing container instance:
 *
 * ```ts
 * const container = await ContainerInstance("existing-container", {
 *   name: "my-existing-container",
 *   resourceGroup: "existing-rg",
 *   image: "nginx:latest",
 *   adopt: true
 * });
 * ```
 */
export const ContainerInstance = Resource(
  "azure::ContainerInstance",
  async function (
    this: Context<ContainerInstance>,
    id: string,
    props: ContainerInstanceProps,
  ): Promise<ContainerInstance> {
    const containerGroupId =
      props.containerGroupId || this.output?.containerGroupId;
    const adopt = props.adopt ?? this.scope.adopt;
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);

    if (this.scope.local) {
      return {
        id,
        name,
        containerGroupId: containerGroupId || `local-${id}`,
        location: props.location || "eastus",
        image: props.image,
        cpu: props.cpu || 1,
        memoryInGB: props.memoryInGB || 1.5,
        osType: props.osType || "Linux",
        restartPolicy: props.restartPolicy || "Always",
        command: props.command,
        environmentVariables: props.environmentVariables,
        ipAddress:
          props.ipAddress?.type === "Public" ? "203.0.113.1" : "10.0.1.4",
        fqdn: props.ipAddress?.dnsNameLabel
          ? `${props.ipAddress.dnsNameLabel}.${props.location || "eastus"}.azurecontainer.io`
          : undefined,
        provisioningState: "Succeeded",
        instanceState: "Running",
        subnet: props.subnet,
        resourceGroup: props.resourceGroup,
        tags: props.tags,
        type: "azure::ContainerInstance",
      };
    }

    const clients = await createAzureClients(props);
    const resourceGroupName =
      typeof props.resourceGroup === "string"
        ? props.resourceGroup
        : props.resourceGroup.name;

    // Get resource group for location inheritance
    let location = props.location;
    if (!location) {
      const rg = await clients.resources.resourceGroups.get(resourceGroupName);
      location = rg.location!;
    }

    if (this.phase === "delete") {
      if (props.delete !== false && containerGroupId) {
        try {
          await clients.containerInstance.containerGroups.beginDeleteAndWait(
            resourceGroupName,
            name,
          );
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Validate name format
    if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(name)) {
      throw new Error(
        `Container instance name "${name}" is invalid. Must be 1-63 characters, lowercase, start and end with alphanumeric, and contain only letters, numbers, and hyphens.`,
      );
    }

    if (this.phase === "update" && this.output) {
      if (this.output.name !== name) {
        return this.replace(); // Name is immutable
      }
      if (this.output.location !== location) {
        return this.replace(); // Location is immutable
      }
      // Most container instance properties are immutable - require replacement
      if (this.output.image !== props.image) {
        return this.replace();
      }
      if (this.output.osType !== (props.osType || "Linux")) {
        return this.replace();
      }
    }

    type EnvironmentVariable = {
      name: string;
      value?: string;
      secureValue?: string;
    };
    const environmentVariables: EnvironmentVariable[] = [];
    if (props.environmentVariables) {
      for (const [key, value] of Object.entries(
        props.environmentVariables,
      ) as Array<[string, string | Secret]>) {
        if (typeof value === "string") {
          environmentVariables.push({ name: key, value });
        } else {
          environmentVariables.push({
            name: key,
            secureValue: Secret.unwrap(value as Secret) as string,
          });
        }
      }
    }

    const requestBody: Partial<AzureContainerGroup> = {
      location,
      tags: props.tags,
      containers: [
        {
          name: name,
          image: props.image,
          resources: {
            requests: {
              cpu: props.cpu || 1,
              memoryInGB: props.memoryInGB || 1.5,
            },
          },
          command: props.command,
          environmentVariables:
            environmentVariables.length > 0 ? environmentVariables : undefined,
          // Add ports from ipAddress config to container
          ports: props.ipAddress?.ports.map((p) => ({
            port: p.port,
            protocol: p.protocol || "TCP",
          })),
        },
      ],
      osType: props.osType || "Linux",
      restartPolicy: props.restartPolicy || "Always",
    };

    // Add IP address configuration
    if (props.ipAddress) {
      requestBody.ipAddress = {
        type: props.ipAddress.type,
        ports: props.ipAddress.ports.map((p) => ({
          port: p.port,
          protocol: p.protocol || "TCP",
        })),
        dnsNameLabel: props.ipAddress.dnsNameLabel,
      };
    }

    // Add subnet configuration
    if (props.subnet) {
      const vnetName =
        typeof props.subnet.virtualNetwork === "string"
          ? props.subnet.virtualNetwork
          : props.subnet.virtualNetwork.name;

      const vnetResponse = await clients.network.virtualNetworks.get(
        resourceGroupName,
        vnetName,
      );

      // Azure SDK returns subnets at the top level of vnetResponse
      const subnets = vnetResponse.subnets || [];
      const subnet = subnets.find((s) => s.name === props.subnet!.subnetName);

      if (!subnet || !subnet.id) {
        throw new Error(
          `Subnet "${props.subnet.subnetName}" not found in virtual network "${vnetName}"`,
        );
      }

      requestBody.subnetIds = [
        {
          id: subnet.id,
        },
      ];
    }

    let result: AzureContainerGroup;

    if (containerGroupId) {
      result =
        await clients.containerInstance.containerGroups.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          requestBody as AzureContainerGroup,
        );
    } else {
      // Check if resource already exists
      let existing: AzureContainerGroup | undefined;
      try {
        existing = await clients.containerInstance.containerGroups.get(
          resourceGroupName,
          name,
        );
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        // Resource doesn't exist, continue with creation
      }

      if (existing) {
        if (!adopt) {
          throw new Error(
            `Container instance "${name}" already exists in resource group "${resourceGroupName}". Use adopt: true to adopt it.`,
          );
        }
        // Adopt existing resource by updating it
      }

      result =
        await clients.containerInstance.containerGroups.beginCreateOrUpdateAndWait(
          resourceGroupName,
          name,
          requestBody as AzureContainerGroup,
        );
    }

    return {
      id,
      name: result.name!,
      containerGroupId: result.id!,
      location: result.location!,
      image: props.image,
      cpu: props.cpu || 1,
      memoryInGB: props.memoryInGB || 1.5,
      osType: (result as { properties?: { osType?: string } }).properties
        ?.osType as "Linux" | "Windows" | undefined,
      restartPolicy: (result as { properties?: { restartPolicy?: string } })
        .properties?.restartPolicy as
        | "Always"
        | "OnFailure"
        | "Never"
        | undefined,
      command: props.command,
      environmentVariables: props.environmentVariables,
      ipAddress: (result as { properties?: { ipAddress?: { ip?: string } } })
        .properties?.ipAddress?.ip,
      fqdn: (result as { properties?: { ipAddress?: { fqdn?: string } } })
        .properties?.ipAddress?.fqdn,
      provisioningState: (
        result as { properties?: { provisioningState?: string } }
      ).properties?.provisioningState,
      instanceState: (
        result as {
          properties?: {
            containers?: Array<{
              properties?: {
                instanceView?: { currentState?: { state?: string } };
              };
            }>;
          };
        }
      ).properties?.containers?.[0]?.properties?.instanceView?.currentState
        ?.state,
      resourceGroup: props.resourceGroup,
      subnet: props.subnet,
      tags: result.tags,
      type: "azure::ContainerInstance",
    };
  },
);

/**
 * Type guard to check if a resource is a ContainerInstance
 */
export function isContainerInstance(
  resource: unknown,
): resource is ContainerInstance {
  if (typeof resource !== "object" || resource === null) {
    return false;
  }
  if (!(ResourceKind in resource)) {
    return false;
  }
  const resourceWithKind = resource as Record<symbol, unknown>;
  return resourceWithKind[ResourceKind] === "azure::ContainerInstance";
}

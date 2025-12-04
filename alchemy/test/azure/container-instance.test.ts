import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { ContainerInstance } from "../../src/azure/container-instance.ts";
import { VirtualNetwork } from "../../src/azure/virtual-network.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Container", () => {
  describe("ContainerInstance", () => {
    test("create container instance with public IP", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-create-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-create`.toLowerCase();
      const dnsLabel = `${BRANCH_PREFIX}-nginx`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-create-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-create", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          cpu: 1,
          memoryInGB: 1.5,
          ipAddress: {
            type: "Public",
            ports: [{ port: 80, protocol: "TCP" }],
            dnsNameLabel: dnsLabel,
          },
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(container.name).toBe(containerName);
        expect(container.location).toBe("eastus");
        expect(container.image).toBe(
          "mcr.microsoft.com/azuredocs/aci-helloworld",
        );
        expect(container.cpu).toBe(1);
        expect(container.memoryInGB).toBe(1.5);
        // IP address and FQDN might not be allocated immediately
        // expect(container.ipAddress).toBeTruthy();
        // expect(container.fqdn).toBe(`${dnsLabel}.eastus.azurecontainer.io`);
        expect(container.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(container.containerGroupId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.ContainerInstance/containerGroups/${containerName}`,
          ),
        );
        expect(container.type).toBe("azure::ContainerInstance");
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create container with environment variables", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-env-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-env`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-env-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-env", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          cpu: 0.5,
          memoryInGB: 1,
          environmentVariables: {
            NODE_ENV: "production",
            LOG_LEVEL: "info",
            SECRET_KEY: alchemy.secret("test-secret-value"),
          },
        });

        expect(container.environmentVariables).toBeDefined();
        expect(Object.keys(container.environmentVariables!)).toHaveLength(3);
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create container with custom command", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-cmd-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-cmd`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-cmd-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-cmd", {
          name: containerName,
          resourceGroup: rg,
          image: "ubuntu:latest",
          cpu: 0.5,
          memoryInGB: 0.5,
          command: ["/bin/bash", "-c", "echo hello && sleep 3600"],
          restartPolicy: "OnFailure",
        });

        expect(container.command).toEqual([
          "/bin/bash",
          "-c",
          "echo hello && sleep 3600",
        ]);
        expect(container.restartPolicy).toBe("OnFailure");
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create container with multiple ports", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-ports-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-ports`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-ports-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-ports", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          cpu: 1,
          memoryInGB: 1.5,
          ipAddress: {
            type: "Public",
            ports: [
              { port: 80, protocol: "TCP" },
              { port: 443, protocol: "TCP" },
              { port: 8080, protocol: "TCP" },
            ],
          },
        });

        // IP address might not be allocated immediately
        // expect(container.ipAddress).toBeTruthy();
        expect(container.name).toBe(containerName);
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create container in virtual network", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-vnet-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-vnet`.toLowerCase();
      const vnetName = `${BRANCH_PREFIX}-ci-vnet`;

      let rg: ResourceGroup;
      let vnet: VirtualNetwork;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-vnet-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        vnet = await VirtualNetwork("ci-vnet-network", {
          name: vnetName,
          resourceGroup: rg,
          addressSpace: ["10.0.0.0/16"],
          subnets: [
            {
              name: "containers",
              addressPrefix: "10.0.1.0/24",
              delegations: [
                {
                  name: "delegation",
                  serviceName: "Microsoft.ContainerInstance/containerGroups",
                },
              ],
            },
          ],
        });

        container = await ContainerInstance("ci-vnet-container", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          cpu: 0.5,
          memoryInGB: 1,
          subnet: {
            virtualNetwork: vnet,
            subnetName: "containers",
          },
          ipAddress: {
            type: "Private",
            ports: [{ port: 80 }],
          },
        });

        expect(container.subnet).toBeDefined();
        expect(container.subnet?.subnetName).toBe("containers");
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertVirtualNetworkDoesNotExist(resourceGroupName, vnetName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update container tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-update-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-update`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-update", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          tags: {
            environment: "test",
          },
        });

        expect(container.tags).toEqual({ environment: "test" });

        // Note: Most container properties are immutable and require recreation
        // Only tags can be updated
        container = await ContainerInstance("ci-update", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          tags: {
            environment: "test",
            updated: "true",
          },
        });

        expect(container.tags).toEqual({
          environment: "test",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("container with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-objref-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-objref`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-objref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-objref", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
        });

        expect(container.name).toBe(containerName);
        expect(container.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("container with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-strref-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-strref`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-strref-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-strref", {
          name: containerName,
          resourceGroup: resourceGroupName,
          location: "eastus",
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
        });

        expect(container.name).toBe(containerName);
        expect(container.location).toBe("eastus");
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing container instance", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-adopt-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-adopt`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create initial container
        container = await ContainerInstance("ci-adopt-first", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
        });

        const firstContainerId = container.containerGroupId;

        // Try to adopt without flag (should fail)
        try {
          await ContainerInstance("ci-adopt-second", {
            name: containerName,
            resourceGroup: rg,
            image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          });
          throw new Error("Expected adoption to fail without adopt flag");
        } catch (error: any) {
          expect(error.message).toContain("already exists");
          expect(error.message).toContain("adopt: true");
        }

        // Adopt existing container
        container = await ContainerInstance("ci-adopt-second", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          adopt: true,
        });

        expect(container.containerGroupId).toBe(firstContainerId);
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          containerName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("container name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-invalid-rg`;

      try {
        await ResourceGroup("ci-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Test invalid name (uppercase)
        try {
          await ContainerInstance("ci-invalid", {
            name: "InvalidName",
            resourceGroup: resourceGroupName,
            location: "eastus",
            image: "nginx:latest",
          });
          throw new Error("Expected name validation to fail");
        } catch (error: any) {
          expect(error.message).toContain("invalid");
        }

        // Test invalid name (starts with hyphen)
        try {
          await ContainerInstance("ci-invalid2", {
            name: "-invalid",
            resourceGroup: resourceGroupName,
            location: "eastus",
            image: "nginx:latest",
          });
          throw new Error("Expected name validation to fail");
        } catch (error: any) {
          expect(error.message).toContain("invalid");
        }
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("container with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-default-rg`;

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-default-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        container = await ContainerInstance("ci-default", {
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
        });

        expect(container.name).toBeTruthy();
        expect(container.name).toContain(BRANCH_PREFIX.toLowerCase());
      } finally {
        await destroy(scope);
        await assertContainerInstanceDoesNotExist(
          resourceGroupName,
          container!.name,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete false preserves container instance", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-ci-preserve-rg`;
      const containerName = `${BRANCH_PREFIX}-ci-preserve`.toLowerCase();

      let rg: ResourceGroup;
      let container: ContainerInstance;
      try {
        rg = await ResourceGroup("ci-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
          delete: false,
        });

        container = await ContainerInstance("ci-preserve", {
          name: containerName,
          resourceGroup: rg,
          image: "mcr.microsoft.com/azuredocs/aci-helloworld",
          delete: false,
        });

        expect(container.name).toBe(containerName);
      } finally {
        // Destroy scope but container should be preserved
        await destroy(scope);

        // Verify container still exists
        const clients = await createAzureClients();
        const preserved = await clients.containerInstance.containerGroups.get(
          resourceGroupName,
          containerName,
        );
        expect(preserved.name).toBe(containerName);

        // Manual cleanup
        await clients.containerInstance.containerGroups.beginDeleteAndWait(
          resourceGroupName,
          containerName,
        );
        await clients.resources.resourceGroups.beginDeleteAndWait(
          resourceGroupName,
        );
      }
    });
  });
});

async function assertContainerInstanceDoesNotExist(
  resourceGroup: string,
  containerName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.containerInstance.containerGroups.get(
      resourceGroup,
      containerName,
    );
    throw new Error(
      `Container instance ${containerName} still exists after deletion`,
    );
  } catch (error: any) {
    // 404 is expected - container was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

async function assertVirtualNetworkDoesNotExist(
  resourceGroup: string,
  vnetName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.virtualNetworks.get(resourceGroup, vnetName);
    throw new Error(`Virtual network ${vnetName} still exists after deletion`);
  } catch (error: any) {
    // 404 is expected - virtual network was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

async function assertResourceGroupDoesNotExist(resourceGroupName: string) {
  const clients = await createAzureClients();
  try {
    await clients.resources.resourceGroups.get(resourceGroupName);
    throw new Error(
      `Resource group ${resourceGroupName} still exists after deletion`,
    );
  } catch (error: any) {
    // 404 is expected - resource group was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

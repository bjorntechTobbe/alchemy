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

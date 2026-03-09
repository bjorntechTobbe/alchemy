import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { VirtualMachine } from "../../src/azure/virtual-machine.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import {
  assertResourceGroupDoesNotExist,
  assertVirtualMachineDoesNotExist,
} from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Compute", () => {
  describe("VirtualMachine", () => {
    test("create and replace virtual machine when customData changes", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-vm-basic-rg`;
      const vmName = `${BRANCH_PREFIX}-vm-basic`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("vm-basic-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        let vm = await VirtualMachine("vm-basic", {
          name: vmName,
          resourceGroup: rg,
          vmSize: "Standard_B1s",
          osType: "Linux",
          adminPassword: "AlchemyTest123!",
          customData: "#!/bin/bash\necho first > /tmp/alchemy-vm\n",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(vm.name).toBe(vmName);
        expect(vm.location).toBe("eastus");
        expect(vm.resourceGroup).toBe(resourceGroupName);
        expect(vm.vmSize).toBe("Standard_B1s");
        expect(vm.osType).toBe("Linux");
        expect(vm.adminUsername).toBe("azureuser");
        expect(vm.virtualMachineId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\.Compute/virtualMachines/${vmName}`,
          ),
        );
        expect(vm.networkInterfaceId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\.Network/networkInterfaces/${vmName}-nic`,
          ),
        );
        expect(vm.customDataHash).toBeTruthy();
        expect(vm.type).toBe("azure::VirtualMachine");

        const originalCustomDataHash = vm.customDataHash;

        vm = await VirtualMachine("vm-basic", {
          name: vmName,
          resourceGroup: rg,
          vmSize: "Standard_B1s",
          osType: "Linux",
          adminPassword: "AlchemyTest123!",
          customData: "#!/bin/bash\necho second > /tmp/alchemy-vm\n",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(vm.customData).toContain("second");
        expect(vm.customDataHash).toBeTruthy();
        expect(vm.customDataHash).not.toBe(originalCustomDataHash);
      } finally {
        await destroy(scope);
        await assertVirtualMachineDoesNotExist(resourceGroupName, vmName);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    }, 1_200_000);
  });
});

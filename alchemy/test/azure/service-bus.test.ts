import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { ServiceBus, isServiceBus } from "../../src/azure/service-bus.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";
import { assertServiceBusDoesNotExist } from "./test-helpers.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Messaging", () => {
  describe("ServiceBus", () => {
    test("create service bus with standard SKU", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-std-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-std`;

      try {
        const rg = await ResourceGroup("sb-std-rg", {
          name: rgName,
          location: "eastus",
        });

        const bus = await ServiceBus("sb-std", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Standard",
        });

        expect(bus).toMatchObject({
          id: "sb-std",
          name: serviceBusName,
          resourceGroup: rgName,
          location: "eastus",
          sku: "Standard",
        });

        expect(bus.endpoint).toBe(
          `https://${serviceBusName}.servicebus.windows.net`,
        );
        expect(bus.serviceBusId).toContain(`/subscriptions/`);
        expect(bus.serviceBusId).toContain(`/resourceGroups/${rgName}`);
        expect(bus.serviceBusId).toContain(
          `/providers/Microsoft.ServiceBus/namespaces/${serviceBusName}`,
        );
        expect(bus.provisioningState).toBe("Succeeded");
        expect(isServiceBus(bus)).toBe(true);
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });

    test("update service bus tags", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-update-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-update`;

      try {
        const rg = await ResourceGroup("sb-update-rg", {
          name: rgName,
          location: "eastus",
        });

        let bus = await ServiceBus("sb-update", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Standard",
          tags: { env: "test" },
        });

        expect(bus.tags).toMatchObject({ env: "test" });

        // Update tags
        bus = await ServiceBus("sb-update", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Standard",
          tags: { env: "test", version: "2" },
        });

        expect(bus.tags).toMatchObject({ env: "test", version: "2" });
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });
  });
});

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import {
  ServiceBus,
  isServiceBus,
} from "../../src/azure/service-bus.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

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
        expect(bus.serviceBusId).toContain(
          `/subscriptions/`,
        );
        expect(bus.serviceBusId).toContain(
          `/resourceGroups/${rgName}`,
        );
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

    test(
      "create service bus with premium SKU",
      async (scope) => {
        const rgName = `${BRANCH_PREFIX}-sb-premium-rg`;
        const serviceBusName = `${BRANCH_PREFIX}-sb-premium`;

        try {
        const rg = await ResourceGroup("sb-premium-rg", {
          name: rgName,
          location: "eastus",
        });

        const bus = await ServiceBus("sb-premium", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Premium",
          capacity: 2,
          zoneRedundant: true,
        });

        expect(bus).toMatchObject({
          id: "sb-premium",
          name: serviceBusName,
          resourceGroup: rgName,
          location: "eastus",
          sku: "Premium",
          capacity: 2,
          zoneRedundant: true,
        });

        expect(bus.provisioningState).toBe("Succeeded");
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    },
    300000 // 5 minutes for Premium tier provisioning
    );

    test("create service bus with Azure AD auth only", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-aad-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-aad`;

      try {
        const rg = await ResourceGroup("sb-aad-rg", {
          name: rgName,
          location: "eastus",
        });

        const bus = await ServiceBus("sb-aad", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Standard",
          disableLocalAuth: true,
        });

        expect(bus).toMatchObject({
          id: "sb-aad",
          name: serviceBusName,
          disableLocalAuth: true,
        });

        expect(bus.provisioningState).toBe("Succeeded");
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

    test("service bus with ResourceGroup string reference", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-strref-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-strref`;

      try {
        const rg = await ResourceGroup("sb-strref-rg", {
          name: rgName,
          location: "eastus",
        });

        // Create Service Bus using string reference
        const bus = await ServiceBus("sb-strref", {
          name: serviceBusName,
          resourceGroup: rgName,
          location: "eastus",
          sku: "Standard",
        });

        expect(bus).toMatchObject({
          id: "sb-strref",
          name: serviceBusName,
          resourceGroup: rgName,
        });
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });

    test("service bus with ResourceGroup object reference", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-objref-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-objref`;

      try {
        const rg = await ResourceGroup("sb-objref-rg", {
          name: rgName,
          location: "westus",
        });

        const bus = await ServiceBus("sb-objref", {
          name: serviceBusName,
          resourceGroup: rg, // Object reference
          sku: "Standard",
        });

        expect(bus).toMatchObject({
          id: "sb-objref",
          name: serviceBusName,
          resourceGroup: rgName,
          location: "westus", // Inherited from resource group
        });
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });

    test("service bus with default name generation", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sbdef-rg`;

      try {
        const rg = await ResourceGroup("sbdef-rg", {
          name: rgName,
          location: "eastus",
        });

        const bus = await ServiceBus("sbdef", {
          resourceGroup: rg,
          sku: "Standard",
        });

        expect(bus.id).toBe("sbdef");
        expect(bus.name).toContain("sbdef");
        expect(bus.name).toContain(BRANCH_PREFIX);
        expect(bus.provisioningState).toBe("Succeeded");
      } finally {
        await destroy(scope);
      }
    });

    test("service bus validates name format", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-invalid-rg`;

      try {
        const rg = await ResourceGroup("sb-invalid-rg", {
          name: rgName,
          location: "eastus",
        });

        // Name too short (< 6 chars)
        await expect(
          ServiceBus("sb-short", {
            name: "short",
            resourceGroup: rg,
            sku: "Standard",
          }),
        ).rejects.toThrow(/must be 6-50 characters/);

        // Name with invalid characters
        await expect(
          ServiceBus("sb-invalid", {
            name: "invalid_name",
            resourceGroup: rg,
            sku: "Standard",
          }),
        ).rejects.toThrow(/must contain only lowercase letters/);

        // Name starting with hyphen
        await expect(
          ServiceBus("sb-hyphen", {
            name: "-invalidname",
            resourceGroup: rg,
            sku: "Standard",
          }),
        ).rejects.toThrow(/cannot start or end with a hyphen/);
      } finally {
        await destroy(scope);
      }
    });

    test("service bus validates SKU-specific options", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-sku-rg`;

      try {
        const rg = await ResourceGroup("sb-sku-rg", {
          name: rgName,
          location: "eastus",
        });

        // Zone redundancy on non-Premium SKU
        await expect(
          ServiceBus("sb-zone", {
            name: `${BRANCH_PREFIX}-sb-zone`,
            resourceGroup: rg,
            sku: "Standard",
            zoneRedundant: true,
          }),
        ).rejects.toThrow(/Zone redundancy is only supported for Premium SKU/);

        // Capacity on Basic SKU
        await expect(
          ServiceBus("sb-capacity", {
            name: `${BRANCH_PREFIX}-sb-capacity`,
            resourceGroup: rg,
            sku: "Basic",
            capacity: 2,
          }),
        ).rejects.toThrow(/Capacity is not supported for Basic SKU/);
      } finally {
        await destroy(scope);
      }
    });

    test("service bus preserves on delete false", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-preserve-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-preserve`;

      const rg = await ResourceGroup("sb-preserve-rg", {
        name: rgName,
        location: "eastus",
        delete: false, // Don't delete resource group either
      });

      const bus = await ServiceBus("sb-preserve", {
        name: serviceBusName,
        resourceGroup: rg,
        sku: "Standard",
        delete: false, // Don't delete on destroy
      });

      expect(bus.name).toBe(serviceBusName);

      await destroy(scope);

      // Verify Service Bus still exists
      const { serviceBus } = await createAzureClients();
      const existing = await serviceBus.namespaces.get(rgName, serviceBusName);
      expect(existing.name).toBe(serviceBusName);

      // Clean up manually
      await serviceBus.namespaces.beginDeleteAndWait(rgName, serviceBusName);
      await assertServiceBusDoesNotExist(serviceBusName);
      
      // Clean up resource group
      const { resources } = await createAzureClients();
      await resources.resourceGroups.beginDeleteAndWait(rgName);
    });

    test("adopt existing service bus", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-adopt-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-adopt`;

      // Create Service Bus outside of Alchemy
      const { serviceBus } = await createAzureClients();

      try {
        const rg = await ResourceGroup("sb-adopt-rg", {
          name: rgName,
          location: "eastus",
        });

        await serviceBus.namespaces.beginCreateOrUpdateAndWait(
          rgName,
          serviceBusName,
          {
            location: "eastus",
            sku: {
              name: "Standard",
              tier: "Standard",
            },
          },
        );

        // Adopt it with Alchemy
        const bus = await ServiceBus("sb-adopt", {
          name: serviceBusName,
          resourceGroup: rg,
          sku: "Standard",
          adopt: true,
        });

        expect(bus.name).toBe(serviceBusName);
        expect(bus.provisioningState).toBe("Succeeded");
      } finally {
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });

    test("reject existing service bus without adopt", async (scope) => {
      const rgName = `${BRANCH_PREFIX}-sb-reject-rg`;
      const serviceBusName = `${BRANCH_PREFIX}-sb-reject`;

      // Create Service Bus outside of Alchemy
      const { serviceBus } = await createAzureClients();

      try {
        const rg = await ResourceGroup("sb-reject-rg", {
          name: rgName,
          location: "eastus",
        });

        await serviceBus.namespaces.beginCreateOrUpdateAndWait(
          rgName,
          serviceBusName,
          {
            location: "eastus",
            sku: {
              name: "Standard",
              tier: "Standard",
            },
          },
        );

        // Try to create without adopt flag (should fail)
        await expect(
          ServiceBus("sb-reject", {
            name: serviceBusName,
            resourceGroup: rg,
            sku: "Standard",
          }),
        ).rejects.toThrow(/already exists.*adopt: true/);
      } finally {
        // Clean up the manually created Service Bus
        try {
          await serviceBus.namespaces.beginDeleteAndWait(
            rgName,
            serviceBusName,
          );
        } catch (error: any) {
          // Ignore errors if already deleted
          if (error.statusCode !== 404) {
            console.error("Error cleaning up Service Bus:", error);
          }
        }
        await destroy(scope);
        await assertServiceBusDoesNotExist(serviceBusName);
      }
    });
  });
});

/**
 * Assert that a Service Bus namespace does not exist
 */
async function assertServiceBusDoesNotExist(name: string): Promise<void> {
  const { serviceBus } = await createAzureClients();

  // List all namespaces and check if this one exists
  const namespaces = [];
  for await (const namespace of serviceBus.namespaces.list()) {
    if (namespace.name === name) {
      namespaces.push(namespace);
    }
  }

  if (namespaces.length > 0) {
    throw new Error(
      `Service Bus namespace "${name}" still exists after deletion`,
    );
  }
}

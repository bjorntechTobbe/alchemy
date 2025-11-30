import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { CognitiveServices } from "../../src/azure/cognitive-services.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { Secret } from "../../src/secret.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure AI", () => {
  describe("CognitiveServices", () => {
    test("create multi-service cognitive services account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-multi-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-multi`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-multi-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-multi", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices", // Multi-service
          sku: "S0",
          tags: {
            environment: "test",
            purpose: "alchemy-testing",
          },
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.location).toBe("eastus");
        expect(cognitive.kind).toBe("CognitiveServices");
        expect(cognitive.sku).toBe("S0");
        expect(cognitive.endpoint).toContain("cognitiveservices.azure.com");
        expect(cognitive.tags).toEqual({
          environment: "test",
          purpose: "alchemy-testing",
        });
        expect(cognitive.cognitiveServicesId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft\\.CognitiveServices/accounts/${accountName}`,
          ),
        );
        expect(cognitive.type).toBe("azure::CognitiveServices");

        // Check that keys are returned as Secrets
        expect(Secret.unwrap(cognitive.primaryKey)).toBeTruthy();
        expect(Secret.unwrap(cognitive.secondaryKey)).toBeTruthy();
        expect(typeof Secret.unwrap(cognitive.primaryKey)).toBe("string");
        expect(typeof Secret.unwrap(cognitive.secondaryKey)).toBe("string");
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create computer vision account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-vision-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-vision`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-vision-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-vision", {
          name: accountName,
          resourceGroup: rg,
          kind: "ComputerVision",
          sku: "S1",
          customSubDomain: accountName, // Required for some features
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.kind).toBe("ComputerVision");
        expect(cognitive.sku).toBe("S1");
        expect(cognitive.customSubDomain).toBe(accountName);
        expect(cognitive.endpoint).toContain(
          `${accountName}.cognitiveservices.azure.com`,
        );
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("create text analytics account with free tier", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-text-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-text`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-text-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-text", {
          name: accountName,
          resourceGroup: rg,
          kind: "TextAnalytics",
          sku: "F0", // Free tier
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.kind).toBe("TextAnalytics");
        expect(cognitive.sku).toBe("F0");
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("update cognitive services tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-update-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-update`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-update-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create
        cognitive = await CognitiveServices("cs-update", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          sku: "S0",
          tags: {
            version: "1.0",
          },
        });

        expect(cognitive.tags).toEqual({
          version: "1.0",
        });

        // Update tags
        cognitive = await CognitiveServices("cs-update", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          sku: "S0",
          tags: {
            version: "2.0",
            updated: "true",
          },
        });

        expect(cognitive.tags).toEqual({
          version: "2.0",
          updated: "true",
        });
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services with ResourceGroup object reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-rgobj-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-rgobj`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-rgobj-rg", {
          name: resourceGroupName,
          location: "westus",
        });

        cognitive = await CognitiveServices("cs-rgobj", {
          name: accountName,
          resourceGroup: rg, // Object reference
          kind: "CognitiveServices",
        });

        expect(cognitive.location).toBe("westus"); // Inherited from RG
        expect(cognitive.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services with ResourceGroup string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-rgstr-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-rgstr`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-rgstr-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-rgstr", {
          name: accountName,
          resourceGroup: resourceGroupName, // String reference
          location: "eastus", // Must specify location explicitly
          kind: "CognitiveServices",
        });

        expect(cognitive.location).toBe("eastus");
        expect(cognitive.resourceGroup).toBe(resourceGroupName);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("adopt existing cognitive services account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-adopt-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-adopt`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        // Create resource group and account via Azure SDK directly
        const { resources, cognitiveServices } = await createAzureClients();
        
        await resources.resourceGroups.createOrUpdate(resourceGroupName, {
          location: "eastus",
        });

        const existing = await cognitiveServices.accounts.beginCreateAndWait(
          resourceGroupName,
          accountName,
          {
            location: "eastus",
            kind: "CognitiveServices",
            sku: {
              name: "S0",
            },
          },
        );

        const existingId = existing.id!;

        // Now adopt it with Alchemy
        rg = await ResourceGroup("cs-adopt-rg", {
          name: resourceGroupName,
          location: "eastus",
          adopt: true,
        });

        cognitive = await CognitiveServices("cs-adopt", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          adopt: true, // Adopt the existing account
        });

        expect(cognitive.cognitiveServicesId).toBe(existingId);
        expect(cognitive.name).toBe(accountName);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-invalid-rg`;

      let rg: ResourceGroup;
      try {
        rg = await ResourceGroup("cs-invalid-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Name too short
        await expect(
          CognitiveServices("cs-short", {
            name: "a",
            resourceGroup: rg,
            kind: "CognitiveServices",
          }),
        ).rejects.toThrow(/must be 2-64 characters/);

        // Name too long
        await expect(
          CognitiveServices("cs-long", {
            name: "a".repeat(65),
            resourceGroup: rg,
            kind: "CognitiveServices",
          }),
        ).rejects.toThrow(/must be 2-64 characters/);

        // Invalid characters
        await expect(
          CognitiveServices("cs-invalid-chars", {
            name: "invalid@name!",
            resourceGroup: rg,
            kind: "CognitiveServices",
          }),
        ).rejects.toThrow(/alphanumeric characters, hyphens, and underscores/);
      } finally {
        await destroy(scope);
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-defname-rg`;

      let rg: ResourceGroup;
      let cognitive: CognitiveServices | undefined;
      try {
        rg = await ResourceGroup("cs-defname-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-defname", {
          resourceGroup: rg,
          kind: "CognitiveServices",
          // name not specified - will use ${app}-${stage}-${id}
        });

        expect(cognitive.name).toMatch(/^test-[a-z0-9-]+-cs-defname$/);
        expect(cognitive.cognitiveServicesId).toBeTruthy();
      } finally {
        await destroy(scope);
        if (cognitive) {
          await assertCognitiveServicesDoesNotExist(
            resourceGroupName,
            cognitive.name,
          );
        }
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("cognitive services with network restrictions", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-network-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-network`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      try {
        rg = await ResourceGroup("cs-network-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-network", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          networkAcls: {
            defaultAction: "Deny",
            ipRules: ["203.0.113.0/24"],
          },
        });

        expect(cognitive.name).toBe(accountName);
        expect(cognitive.networkAcls?.defaultAction).toBe("Deny");
        expect(cognitive.networkAcls?.ipRules).toEqual(["203.0.113.0/24"]);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });

    test("delete: false preserves cognitive services account", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-preserve-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-preserve`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      let cognitive: CognitiveServices;
      let accountId: string;
      try {
        rg = await ResourceGroup("cs-preserve-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        cognitive = await CognitiveServices("cs-preserve", {
          name: accountName,
          resourceGroup: rg,
          kind: "CognitiveServices",
          delete: false, // Don't delete on destroy
        });

        expect(cognitive.cognitiveServicesId).toBeTruthy();
        accountId = cognitive.cognitiveServicesId;

        // Destroy scope
        await destroy(scope);

        // Account should still exist
        const { cognitiveServices } = await createAzureClients();
        const existing = await cognitiveServices.accounts.get(
          resourceGroupName,
          accountName,
        );
        expect(existing.id).toBe(accountId);

        // Clean up manually
        await cognitiveServices.accounts.beginDeleteAndWait(
          resourceGroupName,
          accountName,
        );
      } finally {
        // Clean up resource group
        const { resources } = await createAzureClients();
        try {
          await resources.resourceGroups.beginDeleteAndWait(
            resourceGroupName,
          );
        } catch (error: any) {
          if (error.statusCode !== 404) {
            throw error;
          }
        }
      }
    });

    test("reject existing cognitive services without adopt flag", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-cs-reject-rg`;
      const accountName = `${BRANCH_PREFIX}-cs-reject`
        .toLowerCase()
        .replace(/_/g, "-");

      let rg: ResourceGroup;
      try {
        // Create resource group and account via Azure SDK directly
        const { resources, cognitiveServices } = await createAzureClients();
        
        await resources.resourceGroups.createOrUpdate(resourceGroupName, {
          location: "eastus",
        });

        await cognitiveServices.accounts.beginCreateAndWait(
          resourceGroupName,
          accountName,
          {
            location: "eastus",
            kind: "CognitiveServices",
            sku: {
              name: "S0",
            },
          },
        );

        // Now try to create with Alchemy without adopt flag
        rg = await ResourceGroup("cs-reject-rg", {
          name: resourceGroupName,
          location: "eastus",
          adopt: true,
        });

        await expect(
          CognitiveServices("cs-reject", {
            name: accountName,
            resourceGroup: rg,
            kind: "CognitiveServices",
            adopt: false, // Explicitly don't adopt
          }),
        ).rejects.toThrow(/already exists/);
      } finally {
        await destroy(scope);
        await assertCognitiveServicesDoesNotExist(
          resourceGroupName,
          accountName,
        );
        await assertResourceGroupDoesNotExist(resourceGroupName);
      }
    });
  });
});

async function assertCognitiveServicesDoesNotExist(
  resourceGroup: string,
  accountName: string,
) {
  const { cognitiveServices } = await createAzureClients();

  try {
    await cognitiveServices.accounts.get(resourceGroup, accountName);
    throw new Error(
      `Cognitive Services account ${accountName} still exists after deletion`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

async function assertResourceGroupDoesNotExist(resourceGroup: string) {
  const { resources } = await createAzureClients();

  try {
    await resources.resourceGroups.get(resourceGroup);
    throw new Error(
      `Resource group ${resourceGroup} still exists after deletion`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

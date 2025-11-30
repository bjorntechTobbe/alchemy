import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { ResourceGroup } from "../../src/azure/resource-group.ts";
import { UserAssignedIdentity } from "../../src/azure/user-assigned-identity.ts";
import { createAzureClients } from "../../src/azure/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Azure Resources", () => {
  describe("UserAssignedIdentity", () => {
    test("create user-assigned identity", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        // Create resource group
        rg = await ResourceGroup("test-identity-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        // Create user-assigned identity
        identity = await UserAssignedIdentity("test-identity", {
          name: identityName,
          resourceGroup: rg,
          location: "eastus",
          tags: {
            purpose: "testing",
            environment: "test",
          },
        });

        expect(identity.name).toBe(identityName);
        expect(identity.resourceGroup).toBe(resourceGroupName);
        expect(identity.location).toBe("eastus");
        expect(identity.tags).toEqual({
          purpose: "testing",
          environment: "test",
        });
        expect(identity.identityId).toMatch(
          new RegExp(
            `/subscriptions/[a-f0-9-]+/resourceGroups/${resourceGroupName}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identityName}`,
          ),
        );
        expect(identity.principalId).toMatch(/^[a-f0-9-]+$/);
        expect(identity.clientId).toMatch(/^[a-f0-9-]+$/);
        expect(identity.tenantId).toMatch(/^[a-f0-9-]+$/);
        expect(identity.type).toBe("azure::UserAssignedIdentity");
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("update identity tags", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-update-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-update-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        // Create resource group
        rg = await ResourceGroup("test-update-identity-rg", {
          name: resourceGroupName,
          location: "westus2",
        });

        // Create identity
        identity = await UserAssignedIdentity("test-update-identity", {
          name: identityName,
          resourceGroup: rg,
          tags: {
            version: "1",
          },
        });

        expect(identity.tags).toEqual({
          version: "1",
        });

        const originalPrincipalId = identity.principalId;
        const originalClientId = identity.clientId;

        // Update tags
        identity = await UserAssignedIdentity("test-update-identity", {
          name: identityName,
          resourceGroup: rg,
          tags: {
            version: "2",
            updated: "true",
          },
        });

        expect(identity.tags).toEqual({
          version: "2",
          updated: "true",
        });

        // Principal ID and Client ID should remain the same
        expect(identity.principalId).toBe(originalPrincipalId);
        expect(identity.clientId).toBe(originalClientId);
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("identity with resource group reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-ref-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-ref-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        // Create resource group
        rg = await ResourceGroup("test-ref-identity-rg", {
          name: resourceGroupName,
          location: "centralus",
        });

        // Create identity using ResourceGroup object (not string)
        identity = await UserAssignedIdentity("test-ref-identity", {
          name: identityName,
          resourceGroup: rg, // Pass ResourceGroup object
          // Location should be inherited from resource group
        });

        expect(identity.name).toBe(identityName);
        expect(identity.resourceGroup).toBe(resourceGroupName);
        expect(identity.location).toBe("centralus"); // Inherited from RG
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("identity with resource group string reference", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-str-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-str-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        // Create resource group
        rg = await ResourceGroup("test-str-identity-rg", {
          name: resourceGroupName,
          location: "eastus2",
        });

        // Create identity using resource group name (string)
        identity = await UserAssignedIdentity("test-str-identity", {
          name: identityName,
          resourceGroup: resourceGroupName, // Pass string
          location: "eastus2", // Must specify location when using string
        });

        expect(identity.name).toBe(identityName);
        expect(identity.resourceGroup).toBe(resourceGroupName);
        expect(identity.location).toBe("eastus2");
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("adopt existing identity", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-adopt-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-adopt-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        // Create resource group
        rg = await ResourceGroup("test-adopt-identity-rg", {
          name: resourceGroupName,
          location: "southcentralus",
        });

        // Create identity
        identity = await UserAssignedIdentity("test-adopt-identity-initial", {
          name: identityName,
          resourceGroup: rg,
          tags: {
            created: "manually",
          },
        });

        const originalPrincipalId = identity.principalId;
        const originalClientId = identity.clientId;

        // Try to create another identity with same name without adopt
        await expect(
          UserAssignedIdentity("test-adopt-identity-conflict", {
            name: identityName,
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/already exists.*adopt: true/i);

        // Now adopt the existing identity
        const adoptedIdentity = await UserAssignedIdentity(
          "test-adopt-identity-adopted",
          {
            name: identityName,
            resourceGroup: rg,
            adopt: true,
            tags: {
              created: "manually",
              adopted: "true",
            },
          },
        );

        expect(adoptedIdentity.name).toBe(identityName);
        expect(adoptedIdentity.principalId).toBe(originalPrincipalId);
        expect(adoptedIdentity.clientId).toBe(originalClientId);
        expect(adoptedIdentity.tags?.adopted).toBe("true");
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("identity name validation", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-validation-rg`;

      let rg: ResourceGroup;

      try {
        rg = await ResourceGroup("test-validation-rg", {
          name: resourceGroupName,
          location: "northcentralus",
        });

        // Test name too short (less than 3 characters)
        await expect(
          UserAssignedIdentity("invalid-short", {
            name: "ab",
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid.*3-128 characters/i);

        // Test name too long (more than 128 characters)
        await expect(
          UserAssignedIdentity("invalid-long", {
            name: "a".repeat(129),
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid.*3-128 characters/i);

        // Test invalid characters (spaces, special chars)
        await expect(
          UserAssignedIdentity("invalid-chars", {
            name: "invalid name!",
            resourceGroup: rg,
          }),
        ).rejects.toThrow(/invalid.*alphanumeric/i);
      } finally {
        await destroy(scope);
      }
    });

    test("identity with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-default-identity-rg`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity | undefined;

      try {
        rg = await ResourceGroup("test-default-identity-rg", {
          name: resourceGroupName,
          location: "westeurope",
        });

        // Create identity without specifying name
        identity = await UserAssignedIdentity("default-name-identity", {
          resourceGroup: rg,
        });

        // Name should be auto-generated
        expect(identity.name).toBeTruthy();
        expect(identity.name).toContain(BRANCH_PREFIX);
        expect(identity.principalId).toBeTruthy();
        expect(identity.clientId).toBeTruthy();
      } finally {
        await destroy(scope);
        if (identity) {
          await assertIdentityDoesNotExist(resourceGroupName, identity.name);
        }
      }
    });

    test("shared identity across multiple resources", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-shared-identity-rg`;
      const identityName = `${BRANCH_PREFIX}-test-shared-identity`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity;

      try {
        rg = await ResourceGroup("test-shared-identity-rg", {
          name: resourceGroupName,
          location: "uksouth",
        });

        // Create a single identity
        identity = await UserAssignedIdentity("shared-identity", {
          name: identityName,
          resourceGroup: rg,
          tags: {
            shared: "true",
            purpose: "multi-resource",
          },
        });

        // Verify it can be referenced by multiple resources
        // (In a real scenario, this would be passed to Function Apps, Container Instances, etc.)
        expect(identity.principalId).toBeTruthy();
        expect(identity.clientId).toBeTruthy();

        // The same identity can be used across multiple resources
        // without creating duplicates
        const identityRef1 = identity;
        const identityRef2 = identity;

        expect(identityRef1.principalId).toBe(identityRef2.principalId);
        expect(identityRef1.clientId).toBe(identityRef2.clientId);
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });
  });
});

/**
 * Assert that a user-assigned identity does not exist
 * Throws an error if the identity still exists
 */
async function assertIdentityDoesNotExist(
  resourceGroupName: string,
  identityName: string,
): Promise<void> {
  const clients = await createAzureClients();

  try {
    const result = await clients.msi.userAssignedIdentities.get(
      resourceGroupName,
      identityName,
    );

    // If we get here, the identity exists when it shouldn't
    throw new Error(
      `User-assigned identity "${identityName}" in resource group "${resourceGroupName}" still exists after deletion: ${result.id}`,
    );
  } catch (error) {
    // We expect a 404 error, which means the identity doesn't exist
    if (error?.statusCode === 404 || error?.code === "ResourceNotFound") {
      // This is expected - identity doesn't exist
      return;
    }

    // If the resource group itself doesn't exist, that's also fine
    if (error?.code === "ResourceGroupNotFound") {
      return;
    }

    // Any other error is unexpected
    throw new Error(
      `Unexpected error checking if identity "${identityName}" exists: ${error?.message || error}`,
      { cause: error },
    );
  }
}

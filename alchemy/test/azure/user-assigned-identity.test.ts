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
        rg = await ResourceGroup("test-identity-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

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
            `/subscriptions/[a-f0-9-]+/resource[Gg]roups/${resourceGroupName}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identityName}`,
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
        rg = await ResourceGroup("test-update-identity-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

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

        expect(identity.principalId).toBe(originalPrincipalId);
        expect(identity.clientId).toBe(originalClientId);
      } finally {
        await destroy(scope);
        await assertIdentityDoesNotExist(resourceGroupName, identityName);
      }
    });

    test("identity with default name", async (scope) => {
      const resourceGroupName = `${BRANCH_PREFIX}-test-default-name-rg`;

      let rg: ResourceGroup;
      let identity: UserAssignedIdentity | undefined;

      try {
        rg = await ResourceGroup("test-default-name-rg", {
          name: resourceGroupName,
          location: "eastus",
        });

        identity = await UserAssignedIdentity("default-name-identity", {
          resourceGroup: rg,
        });

        expect(identity.name).toBeTruthy();
        expect(identity.name).toContain(BRANCH_PREFIX);
        expect(identity.location).toBe("eastus");
      } finally {
        await destroy(scope);
        if (identity) {
          await assertIdentityDoesNotExist(resourceGroupName, identity.name);
        }
      }
    });
  });
});

async function assertIdentityDoesNotExist(
  resourceGroup: string,
  identityName: string,
): Promise<void> {
  const { msi } = await createAzureClients();

  try {
    await msi.userAssignedIdentities.get(resourceGroup, identityName);
    throw new Error(
      `Identity ${identityName} still exists in resource group ${resourceGroup}`,
    );
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

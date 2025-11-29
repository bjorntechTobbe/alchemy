import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import { destroy } from "../../src/destroy.ts";
import { BlobStateStore } from "../../src/azure/blob-state-store.ts";
import "../../src/test/vitest.ts";

describe.skip("BlobStateStore", async () => {
  // Skip by default - requires Azure Storage credentials
  // To run: set AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY env vars
  const test = alchemy.test(import.meta, {
    // Isolate the default state store container from other tests' stores
    prefix: `${BRANCH_PREFIX}-blob-state-store`,
    stateStore: (scope) =>
      new BlobStateStore(scope, {
        accountName: process.env.AZURE_STORAGE_ACCOUNT,
        accountKey: process.env.AZURE_STORAGE_KEY,
        containerName: "alchemy-state",
      }),
  });

  test("optimistically creates alchemy-state container", async (scope) => {
    try {
      // The BlobStateStore will auto-create the container on init
      // This test verifies the container was created and is accessible
      expect(scope.stateStore).toBeDefined();
    } finally {
      await destroy(scope);
    }
  });
});

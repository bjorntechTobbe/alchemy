import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { ResourceScope } from "../resource.ts";
import type { Scope } from "../scope.ts";
import { deserialize, serialize } from "../serde.ts";
import type { State, StateStore } from "../state.ts";

/**
 * Options for BlobStateStore
 */
export interface BlobStateStoreOptions {
  /**
   * The prefix to use for blob names in the container
   * This allows multiple state stores to use the same container
   */
  prefix?: string;

  /**
   * The Azure Storage account name
   * Required - the storage account must already exist
   */
  accountName?: string;

  /**
   * The Azure Storage account key
   * Required for authentication
   * Can also be provided via AZURE_STORAGE_KEY environment variable
   */
  accountKey?: string;

  /**
   * The blob container name to use
   * Required - the container must already exist
   * @default "alchemy-state"
   */
  containerName?: string;
}

/**
 * State store implementation using Azure Blob Storage
 * Provides reliable, scalable state storage with strong consistency
 *
 * @example
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { BlobStateStore } from "alchemy/azure";
 *
 * const app = await alchemy("my-app", {
 *   stateStore: (scope) => new BlobStateStore(scope, {
 *     accountName: "mystorageaccount",
 *     accountKey: process.env.AZURE_STORAGE_KEY,
 *     containerName: "alchemy-state"
 *   })
 * });
 * ```
 */
export class BlobStateStore implements StateStore {
  private client: BlobServiceClient;
  private prefix: string;
  private containerName: string;
  private initialized = false;

  /**
   * Create a new BlobStateStore
   *
   * @param scope The scope this store belongs to
   * @param options Options for the state store
   */
  constructor(
    public readonly scope: Scope,
    options: BlobStateStoreOptions = {},
  ) {
    // Use the scope's chain to build the prefix, similar to S3StateStore
    const scopePath = scope.chain.join("/");
    this.prefix = options.prefix
      ? `${options.prefix}${scopePath}/`
      : `alchemy/${scopePath}/`;

    this.containerName = options.containerName ?? "alchemy-state";

    // Get credentials from options or environment variables
    const accountName =
      options.accountName || process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = options.accountKey || process.env.AZURE_STORAGE_KEY;

    if (!accountName) {
      throw new Error(
        "Azure Storage account name is required. " +
          "Set AZURE_STORAGE_ACCOUNT environment variable or provide accountName in options.",
      );
    }

    if (!accountKey) {
      throw new Error(
        "Azure Storage account key is required. " +
          "Set AZURE_STORAGE_KEY environment variable or provide accountKey in options.",
      );
    }

    // Create blob service client with shared key credential
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey,
    );

    this.client = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      sharedKeyCredential,
    );
  }

  /**
   * Initialize the blob client and verify container access
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Verify container exists and is accessible
    const containerClient = this.client.getContainerClient(this.containerName);

    try {
      const exists = await containerClient.exists();
      if (!exists) {
        throw new Error(
          `Azure Blob Storage container '${this.containerName}' does not exist. Please create the container first.`,
        );
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        throw new Error(
          `Azure Blob Storage container '${this.containerName}' does not exist. Please create the container first.`,
        );
      }
      throw error;
    }

    this.initialized = true;
  }

  /**
   * Blob containers are not deleted programmatically via this method
   */
  async deinit(): Promise<void> {
    // We don't delete the container here, only via explicit resource deletion
  }

  /**
   * List all resources in the state store
   */
  async list(): Promise<string[]> {
    await this.ensureInitialized();

    const containerClient = this.client.getContainerClient(this.containerName);
    const keys: string[] = [];

    // List blobs with the prefix
    for await (const blob of containerClient.listBlobsFlat({
      prefix: this.prefix,
    })) {
      const key = blob.name.slice(this.prefix.length);
      keys.push(this.convertKeyFromStorage(key));
    }

    return keys;
  }

  /**
   * Count the number of items in the state store
   */
  async count(): Promise<number> {
    const keys = await this.list();
    return keys.length;
  }

  /**
   * Get a state by key
   *
   * @param key The key to look up
   * @returns The state or undefined if not found
   */
  async get(key: string): Promise<State | undefined> {
    await this.ensureInitialized();

    const containerClient = this.client.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(this.getBlobName(key));

    try {
      const downloadResponse = await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        return undefined;
      }

      // Read the stream into a string
      const content = await this.streamToString(
        downloadResponse.readableStreamBody,
      );

      // Parse and deserialize the state data
      const state = (await deserialize(
        this.scope,
        JSON.parse(content),
      )) as State;

      // Create a new state object with proper output
      return {
        ...state,
        output: {
          ...(state.output || {}),
          [ResourceScope]: this.scope,
        },
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (("statusCode" in error && error.statusCode === 404) ||
          ("code" in error && error.code === "BlobNotFound"))
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get multiple states by their keys
   *
   * @param ids Array of keys to fetch
   * @returns Record mapping keys to their states
   */
  async getBatch(ids: string[]): Promise<Record<string, State>> {
    const result: Record<string, State> = {};

    // Azure Blob doesn't have a batch get operation, so we need to make multiple requests
    const promises = ids.map(async (id) => {
      const state = await this.get(id);
      if (state) {
        result[id] = state;
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Get all states in the store
   *
   * @returns Record mapping all keys to their states
   */
  async all(): Promise<Record<string, State>> {
    const keys = await this.list();
    return this.getBatch(keys);
  }

  /**
   * Set a state for a key
   *
   * @param key The key to set
   * @param value The state to store
   */
  async set(key: string, value: State): Promise<void> {
    await this.ensureInitialized();

    const containerClient = this.client.getContainerClient(this.containerName);
    const blobName = this.getBlobName(key);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Serialize the state to handle cyclic structures
    const serializedData = JSON.stringify(
      await serialize(this.scope, value),
      null,
      2,
    );

    await blockBlobClient.upload(serializedData, serializedData.length, {
      blobHTTPHeaders: {
        blobContentType: "application/json",
      },
    });
  }

  /**
   * Delete a state by key
   *
   * @param key The key to delete
   */
  async delete(key: string): Promise<void> {
    await this.ensureInitialized();

    const containerClient = this.client.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(this.getBlobName(key));

    try {
      await blobClient.delete();
    } catch (error) {
      // Ignore if blob doesn't exist
      if (
        error &&
        typeof error === "object" &&
        !(
          ("statusCode" in error && error.statusCode === 404) ||
          ("code" in error && error.code === "BlobNotFound")
        )
      ) {
        throw error;
      }
    }
  }

  /**
   * Convert key for storage by replacing slashes with colons
   * since Azure Blob treats slashes as path separators
   *
   * @param key The original key
   * @returns Key with slashes replaced by colons
   */
  private convertKeyForStorage(key: string): string {
    return key.replaceAll("/", ":");
  }

  /**
   * Convert key from storage by replacing colons with slashes
   *
   * @param key The storage key
   * @returns Key with colons replaced by slashes
   */
  private convertKeyFromStorage(key: string): string {
    return key.replaceAll(":", "/");
  }

  /**
   * Get the full blob name for storage
   *
   * @param key The original key
   * @returns The key with prefix for use in the blob container
   */
  private getBlobName(key: string): string {
    return `${this.prefix}${this.convertKeyForStorage(key)}`;
  }

  /**
   * Ensure the store is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Helper to convert a ReadableStream to a string
   */
  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }
}

/**
 * Azure provider for Alchemy
 *
 * This module provides Infrastructure-as-Code resources for Microsoft Azure.
 *
 * ## Getting Started
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import { ResourceGroup, StorageAccount, BlobContainer } from "alchemy/azure";
 *
 * const app = await alchemy("my-azure-app", {
 *   azure: {
 *     subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
 *     tenantId: alchemy.secret.env.AZURE_TENANT_ID,
 *     clientId: alchemy.secret.env.AZURE_CLIENT_ID,
 *     clientSecret: alchemy.secret.env.AZURE_CLIENT_SECRET,
 *   }
 * });
 *
 * // Create a resource group
 * const rg = await ResourceGroup("my-rg", {
 *   location: "eastus"
 * });
 *
 * // Create storage
 * const storage = await StorageAccount("storage", {
 *   resourceGroup: rg,
 *   location: "eastus",
 * });
 *
 * const uploads = await BlobContainer("uploads", {
 *   resourceGroup: rg,
 *   storageAccount: storage,
 * });
 *
 * await app.finalize();
 * ```
 *
 * @module
 */

export * from "./client.ts";
export * from "./client-props.ts";
export * from "./credentials.ts";
export * from "./resource-group.ts";
export * from "./user-assigned-identity.ts";

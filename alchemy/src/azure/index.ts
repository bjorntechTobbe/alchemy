/**
 * Azure provider for Alchemy
 *
 * This module provides Infrastructure-as-Code resources for Microsoft Azure.
 *
 * ## Getting Started
 *
 * ```typescript
 * import { alchemy } from "alchemy";
 * import {
 *   ResourceGroup,
 *   VirtualNetwork,
 *   NetworkSecurityGroup,
 *   StorageAccount,
 *   BlobContainer
 * } from "alchemy/azure";
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
 * // Create networking
 * const vnet = await VirtualNetwork("app-network", {
 *   resourceGroup: rg,
 *   addressSpace: ["10.0.0.0/16"],
 *   subnets: [
 *     { name: "web", addressPrefix: "10.0.1.0/24" }
 *   ]
 * });
 *
 * const nsg = await NetworkSecurityGroup("web-nsg", {
 *   resourceGroup: rg,
 *   securityRules: [{
 *     name: "allow-https",
 *     priority: 100,
 *     direction: "Inbound",
 *     access: "Allow",
 *     protocol: "Tcp",
 *     destinationPortRange: "443"
 *   }]
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

export * from "./app-service.ts";
export * from "./blob-container.ts";
export * from "./blob-state-store.ts";
export * from "./cdn-endpoint.ts";
export * from "./cdn-profile.ts";
export * from "./client.ts";
export * from "./client-props.ts";
export * from "./container-instance.ts";
export * from "./cosmosdb-account.ts";
export * from "./credentials.ts";
export * from "./function-app.ts";
export * from "./key-vault.ts";
export * from "./network-security-group.ts";
export * from "./public-ip-address.ts";
export * from "./resource-group.ts";
export * from "./service-bus.ts";
export * from "./sql-database.ts";
export * from "./sql-server.ts";
export * from "./static-web-app.ts";
export * from "./storage-account.ts";
export * from "./user-assigned-identity.ts";
export * from "./virtual-network.ts";

import { expect } from "vitest";
import { createAzureClients } from "../../src/azure/client.ts";

/**
 * Assert that a resource group does not exist
 */
export async function assertResourceGroupDoesNotExist(
  resourceGroupName: string,
): Promise<void> {
  const clients = await createAzureClients();

  try {
    const result =
      await clients.resources.resourceGroups.get(resourceGroupName);

    throw new Error(
      `Resource group "${resourceGroupName}" still exists after deletion: ${result.id}`,
    );
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.code === "ResourceGroupNotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that an App Service does not exist
 */
export async function assertAppServiceDoesNotExist(
  resourceGroupName: string,
  appServiceName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.appService.webApps.get(resourceGroupName, appServiceName);
    throw new Error(
      `App service ${appServiceName} should not exist but was found`,
    );
  } catch (error: any) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Blob Container does not exist
 */
export async function assertBlobContainerDoesNotExist(
  resourceGroupName: string,
  storageAccountName: string,
  containerName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.storage.blobContainers.get(
      resourceGroupName,
      storageAccountName,
      containerName,
    );
    throw new Error(
      `Blob container ${containerName} still exists in storage account ${storageAccountName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that a CDN Endpoint does not exist
 */
export async function assertCDNEndpointDoesNotExist(
  resourceGroup: string,
  profileName: string,
  endpointName: string,
) {
  const { cdn } = await createAzureClients();

  try {
    await cdn.endpoints.get(resourceGroup, profileName, endpointName);
    throw new Error(`CDN endpoint ${endpointName} still exists after deletion`);
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

/**
 * Assert that a CDN Profile does not exist
 */
export async function assertCDNProfileDoesNotExist(
  resourceGroup: string,
  profileName: string,
) {
  const { cdn } = await createAzureClients();

  try {
    await cdn.profiles.get(resourceGroup, profileName);
    throw new Error(`CDN profile ${profileName} still exists after deletion`);
  } catch (error: any) {
    expect(error.statusCode).toBe(404);
  }
}

/**
 * Assert that a Cognitive Services account does not exist
 */
export async function assertCognitiveServicesDoesNotExist(
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

/**
 * Assert that a Container Instance does not exist
 */
export async function assertContainerInstanceDoesNotExist(
  resourceGroup: string,
  containerName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.containerInstance.containerGroups.get(
      resourceGroup,
      containerName,
    );
    throw new Error(
      `Container instance ${containerName} still exists after deletion`,
    );
  } catch (error: any) {
    // 404 is expected - container was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Cosmos DB account does not exist
 */
export async function assertCosmosDBAccountDoesNotExist(
  resourceGroupName: string,
  cosmosDBAccountName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.cosmosDB.databaseAccounts.get(
      resourceGroupName,
      cosmosDBAccountName,
    );
    throw new Error(
      `Cosmos DB account ${cosmosDBAccountName} still exists in resource group ${resourceGroupName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "NotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that a Function App does not exist
 */
export async function assertFunctionAppDoesNotExist(
  resourceGroupName: string,
  functionAppName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.appService.webApps.get(resourceGroupName, functionAppName);
    throw new Error(
      `Function app ${functionAppName} should not exist but was found`,
    );
  } catch (error: any) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Key Vault does not exist
 */
export async function assertKeyVaultDoesNotExist(
  resourceGroup: string,
  vaultName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.keyVault.vaults.get(resourceGroup, vaultName);
    throw new Error(`Key vault ${vaultName} still exists after deletion`);
  } catch (error: any) {
    // 404 is expected - vault was deleted
    if (error.statusCode !== 404 && error.code !== "VaultNotFound") {
      throw error;
    }
  }
}

/**
 * Assert that a Network Security Group does not exist
 */
export async function assertNetworkSecurityGroupDoesNotExist(
  resourceGroup: string,
  nsgName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.networkSecurityGroups.get(resourceGroup, nsgName);
    throw new Error(
      `Network security group ${nsgName} still exists after deletion`,
    );
  } catch (error: any) {
    // 404 is expected - network security group was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Public IP Address does not exist
 */
export async function assertPublicIPAddressDoesNotExist(
  resourceGroup: string,
  pipName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.publicIPAddresses.get(resourceGroup, pipName);
    throw new Error(`Public IP address ${pipName} still exists after deletion`);
  } catch (error: any) {
    // 404 is expected - public IP address was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Service Bus namespace does not exist
 */
export async function assertServiceBusDoesNotExist(
  name: string,
): Promise<void> {
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

/**
 * Assert that a SQL Server does not exist
 */
export async function assertSqlServerDoesNotExist(
  resourceGroup: string,
  serverName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.sql.servers.get(resourceGroup, serverName);
    throw new Error(`SQL Server ${serverName} still exists after deletion`);
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that a SQL Database does not exist
 */
export async function assertSqlDatabaseDoesNotExist(
  resourceGroup: string,
  serverName: string,
  databaseName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.sql.databases.get(resourceGroup, serverName, databaseName);
    throw new Error(
      `SQL Database ${databaseName} still exists in server ${serverName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that a Static Web App does not exist
 */
export async function assertStaticWebAppDoesNotExist(
  resourceGroupName: string,
  staticWebAppName: string,
) {
  const clients = await createAzureClients();
  const exists = await clients.appService.staticSites.getStaticSite(
    resourceGroupName,
    staticWebAppName,
  );
  expect(exists).toBeUndefined();
}

/**
 * Assert that a Storage Account does not exist
 */
export async function assertStorageAccountDoesNotExist(
  resourceGroupName: string,
  storageAccountName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.storage.storageAccounts.getProperties(
      resourceGroupName,
      storageAccountName,
    );
    throw new Error(
      `Storage account ${storageAccountName} still exists in resource group ${resourceGroupName}`,
    );
  } catch (error: any) {
    if (error.statusCode === 404 || error.code === "ResourceNotFound") {
      return;
    }
    throw error;
  }
}

/**
 * Assert that a User-Assigned Identity does not exist
 */
export async function assertUserAssignedIdentityDoesNotExist(
  resourceGroupName: string,
  identityName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.msi.userAssignedIdentities.get(
      resourceGroupName,
      identityName,
    );
    throw new Error(
      `User-assigned identity ${identityName} should not exist but was found`,
    );
  } catch (error: any) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Assert that a Virtual Network does not exist
 */
export async function assertVirtualNetworkDoesNotExist(
  resourceGroup: string,
  vnetName: string,
) {
  const clients = await createAzureClients();
  try {
    await clients.network.virtualNetworks.get(resourceGroup, vnetName);
    throw new Error(`Virtual network ${vnetName} still exists after deletion`);
  } catch (error: any) {
    // 404 is expected - virtual network was deleted
    if (error.statusCode !== 404) {
      throw error;
    }
  }
}

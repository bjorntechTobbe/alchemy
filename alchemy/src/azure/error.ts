/**
 * Azure SDK Error interface
 * Azure SDKs throw errors with specific properties for HTTP status codes and error codes
 */
export interface AzureError extends Error {
  /**
   * HTTP status code from the Azure API response
   */
  statusCode?: number;

  /**
   * Azure-specific error code
   */
  code?: string;

  /**
   * Additional error details from Azure
   */
  details?: unknown;
}

/**
 * Type guard to check if an error is an Azure SDK error
 */
export function isAzureError(error: unknown): error is AzureError {
  return (
    error instanceof Error &&
    (("statusCode" in error && typeof error.statusCode === "number") ||
      ("code" in error && typeof error.code === "string"))
  );
}

/**
 * Check if an Azure error indicates a resource was not found (404)
 */
export function isNotFoundError(error: unknown): boolean {
  return isAzureError(error) && error.statusCode === 404;
}

/**
 * Check if an Azure error indicates a conflict (409) or resource already exists
 */
export function isConflictError(error: unknown): boolean {
  if (!isAzureError(error)) return false;
  return (
    error.statusCode === 409 ||
    error.code === "ResourceAlreadyExists" ||
    error.code === "VaultAlreadyExists" ||
    error.message?.includes("already exists") === true
  );
}

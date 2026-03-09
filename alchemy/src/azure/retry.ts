import { withExponentialBackoff } from "../util/retry.ts";
import { isAbortError, isNotFoundError } from "./error.ts";

/**
 * Check if an Azure error is retryable
 *
 * Azure SDK can throw various transient errors that should be retried:
 * - AbortError: Operation was cancelled (often due to timeouts)
 * - Throttling: Rate limiting from Azure APIs
 * - ServiceUnavailable: Temporary Azure service issues
 * - InternalServerError: Transient Azure errors
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  // AbortError is often transient - the operation may have succeeded
  // or can be retried successfully
  if (isAbortError(error)) {
    return true;
  }

  const statusCode = error.statusCode || error.status || 0;
  const errorCode = error.code || error.name || "";
  const errorMessage = error.message || "";

  // Check for HTTP status codes that indicate transient errors
  if (statusCode === 429 || statusCode === 503 || statusCode === 500) {
    return true;
  }

  // Check for common Azure throttling/transient error codes
  return (
    errorCode === "TooManyRequests" ||
    errorCode === "ThrottlingException" ||
    errorCode === "ServiceUnavailable" ||
    errorCode === "InternalServerError" ||
    errorCode === "OperationCanceled" ||
    errorMessage.includes("throttling") ||
    errorMessage.includes("Throttling") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("temporarily unavailable") ||
    errorMessage.includes("service is busy")
  );
}

/**
 * Retry function with standardized parameters for Azure transient errors
 *
 * Wraps Azure SDK operations with exponential backoff retry logic.
 * Handles AbortError and other transient Azure errors gracefully.
 *
 * @param operation The async Azure SDK operation to execute
 * @param extraIsRetryableError Optional additional retry condition
 * @returns Result of the operation
 *
 * @example
 * ```typescript
 * const result = await retry(() =>
 *   clients.containerInstance.containerGroups.get(resourceGroup, name)
 * );
 * ```
 */
export function retry<T>(
  operation: () => Promise<T>,
  extraIsRetryableError?: (error: any) => boolean,
): Promise<T> {
  return withExponentialBackoff(
    operation,
    (err) => isRetryableError(err) || extraIsRetryableError?.(err) || false,
    5, // max attempts (fewer than AWS since Azure operations are slower)
    1000, // initial delay ms
  );
}

async function waitForDeletion(
  getResource: () => Promise<unknown>,
  description: string,
): Promise<void> {
  const stillExistsMessage = `${description} still exists after delete request`;

  try {
    await retry(
      async () => {
        try {
          await getResource();
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }

        throw new Error(stillExistsMessage);
      },
      (error) => error instanceof Error && error.message === stillExistsMessage,
    );
  } catch (error) {
    if (error instanceof Error && error.message === stillExistsMessage) {
      throw new Error(
        `Delete for ${description} was aborted and the resource still exists.`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Delete an Azure resource and verify completion when the SDK aborts.
 * @internal
 */
export async function deleteWithAbortVerification(
  deleteResource: () => Promise<unknown>,
  getResource: () => Promise<unknown>,
  description: string,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    await deleteResource();
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    if (isAbortError(error)) {
      await waitForDeletion(getResource, description);
      return;
    }

    if (onError) {
      onError(error);
      return;
    }

    throw error;
  }
}

/**
 * Execute an Azure operation and silently ignore AbortError
 *
 * Use this for fire-and-forget operations where we don't want to
 * fail the deployment if the operation is cancelled or times out.
 *
 * @param operation The async Azure SDK operation to execute
 * @param onError Optional callback for non-AbortError errors
 * @returns Result of the operation, or undefined if aborted
 *
 * @example
 * ```typescript
 * // Fire-and-forget restart
 * await ignoreAbort(() =>
 *   clients.containerInstance.containerGroups.beginRestart(rg, name)
 * );
 * ```
 */
export async function ignoreAbort<T>(
  operation: () => Promise<T>,
  onError?: (error: any) => void,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error: any) {
    if (isAbortError(error)) {
      // Silently ignore AbortError - operation may still complete
      return undefined;
    }
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
    return undefined;
  }
}

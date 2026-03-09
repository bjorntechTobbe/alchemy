import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteWithAbortVerification } from "../../src/azure/retry.ts";

function createAzureError(
  message: string,
  props: Record<string, unknown> = {},
) {
  return Object.assign(new Error(message), props);
}

describe("Azure retry helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns when delete succeeds", async () => {
    const deleteResource = vi.fn().mockResolvedValue(undefined);
    const getResource = vi.fn();

    await expect(
      deleteWithAbortVerification(
        deleteResource,
        getResource,
        'virtual machine "vm"',
      ),
    ).resolves.toBeUndefined();

    expect(deleteResource).toHaveBeenCalledTimes(1);
    expect(getResource).not.toHaveBeenCalled();
  });

  it("returns when delete reports not found", async () => {
    const deleteResource = vi
      .fn()
      .mockRejectedValue(createAzureError("Not Found", { statusCode: 404 }));
    const getResource = vi.fn();

    await expect(
      deleteWithAbortVerification(
        deleteResource,
        getResource,
        'virtual machine "vm"',
      ),
    ).resolves.toBeUndefined();

    expect(getResource).not.toHaveBeenCalled();
  });

  it("verifies deletion after AbortError", async () => {
    vi.useFakeTimers();

    const deleteResource = vi
      .fn()
      .mockRejectedValue(
        createAzureError("operation was aborted", { name: "AbortError" }),
      );
    const getResource = vi
      .fn()
      .mockResolvedValueOnce({ id: "still-here" })
      .mockRejectedValueOnce(
        createAzureError("Not Found", { statusCode: 404 }),
      );

    const promise = deleteWithAbortVerification(
      deleteResource,
      getResource,
      'virtual machine "vm"',
    );

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeUndefined();
    expect(getResource).toHaveBeenCalledTimes(2);
  });

  it("throws when aborted delete leaves resource behind", async () => {
    vi.useFakeTimers();

    const deleteResource = vi
      .fn()
      .mockRejectedValue(
        createAzureError("operation was aborted", { name: "AbortError" }),
      );
    const getResource = vi.fn().mockResolvedValue({ id: "still-here" });

    const promise = deleteWithAbortVerification(
      deleteResource,
      getResource,
      'virtual machine "vm"',
    );

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(
      'Delete for virtual machine "vm" was aborted and the resource still exists.',
    );
    expect(getResource).toHaveBeenCalledTimes(5);
  });

  it("calls onError for non-abort delete failures", async () => {
    const error = new Error("boom");
    const deleteResource = vi.fn().mockRejectedValue(error);
    const getResource = vi.fn();
    const onError = vi.fn();

    await expect(
      deleteWithAbortVerification(
        deleteResource,
        getResource,
        'virtual machine "vm"',
        onError,
      ),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(error);
    expect(getResource).not.toHaveBeenCalled();
  });
});

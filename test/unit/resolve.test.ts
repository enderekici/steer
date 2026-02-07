/**
 * Tests for action resolve + retry logic.
 */

import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/actions/resolve.js";

describe("withRetry", () => {
  it("should return result on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { retries: 2 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on transient errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Timeout 3000ms exceeded"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, { retries: 1, actionName: "click" });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should not retry on non-transient errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Element not found"));

    await expect(withRetry(fn, { retries: 2 })).rejects.toThrow(
      "Element not found",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should respect max retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Timeout occurred"));

    await expect(withRetry(fn, { retries: 2 })).rejects.toThrow("Timeout");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should retry on detached element errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Element is detached from DOM"))
      .mockResolvedValueOnce("fixed");

    const result = await withRetry(fn, { retries: 1 });
    expect(result).toBe("fixed");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on Target closed errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Target closed"))
      .mockResolvedValueOnce("reconnected");

    const result = await withRetry(fn, { retries: 1 });
    expect(result).toBe("reconnected");
  });

  it("should retry on execution context destroyed errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Execution context was destroyed"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, { retries: 1 });
    expect(result).toBe("recovered");
  });

  it("should work with 0 retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Timeout"));

    await expect(withRetry(fn, { retries: 0 })).rejects.toThrow("Timeout");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

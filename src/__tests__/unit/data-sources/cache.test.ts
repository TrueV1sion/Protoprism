import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolResult } from "@/lib/data-sources/types";

const mockResult: ToolResult = {
  content: "## Test\nSome results",
  citations: [{ id: "[T-1]", source: "TestAPI", query: "test" }],
  vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "TestAPI" },
  confidence: "HIGH",
  truncated: false,
};

describe("ResultCache", () => {
  beforeEach(() => { vi.resetModules(); });

  it("returns cached result on second call with same key", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let callCount = 0;
    const compute = async () => { callCount++; return mockResult; };

    const r1 = await cache.getOrCompute("tool_a", { q: "test" }, compute);
    const r2 = await cache.getOrCompute("tool_a", { q: "test" }, compute);

    expect(r1).toEqual(mockResult);
    expect(r2).toEqual(mockResult);
    expect(callCount).toBe(1); // compute called only once
  });

  it("calls compute for different inputs", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let callCount = 0;
    const compute = async () => { callCount++; return mockResult; };

    await cache.getOrCompute("tool_a", { q: "one" }, compute);
    await cache.getOrCompute("tool_a", { q: "two" }, compute);

    expect(callCount).toBe(2);
  });

  it("coalesces concurrent requests for the same key", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let callCount = 0;
    const compute = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return mockResult;
    };

    // Fire 3 concurrent calls with the same key
    const [r1, r2, r3] = await Promise.all([
      cache.getOrCompute("tool_a", { q: "test" }, compute),
      cache.getOrCompute("tool_a", { q: "test" }, compute),
      cache.getOrCompute("tool_a", { q: "test" }, compute),
    ]);

    expect(callCount).toBe(1); // Only one actual API call
    expect(r1).toEqual(mockResult);
    expect(r2).toEqual(mockResult);
    expect(r3).toEqual(mockResult);
  });

  it("removes inflight entry on error and retries on next call", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let attempt = 0;
    const compute = async () => {
      attempt++;
      if (attempt === 1) throw new Error("transient");
      return mockResult;
    };

    await expect(cache.getOrCompute("tool_a", { q: "test" }, compute)).rejects.toThrow("transient");
    const result = await cache.getOrCompute("tool_a", { q: "test" }, compute);
    expect(result).toEqual(mockResult);
    expect(attempt).toBe(2);
  });

  it("clear() resets all state", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let callCount = 0;
    const compute = async () => { callCount++; return mockResult; };

    await cache.getOrCompute("tool_a", { q: "test" }, compute);
    cache.clear();
    await cache.getOrCompute("tool_a", { q: "test" }, compute);

    expect(callCount).toBe(2);
  });

  it("stats() returns hit/miss/entries counts", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const compute = async () => mockResult;

    await cache.getOrCompute("t", { q: "a" }, compute); // miss
    await cache.getOrCompute("t", { q: "a" }, compute); // hit
    await cache.getOrCompute("t", { q: "b" }, compute); // miss

    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(2);
    expect(s.entries).toBe(2);
  });

  it("sorts input keys for stable cache keys", async () => {
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    let callCount = 0;
    const compute = async () => { callCount++; return mockResult; };

    await cache.getOrCompute("t", { b: 2, a: 1 }, compute);
    await cache.getOrCompute("t", { a: 1, b: 2 }, compute);

    expect(callCount).toBe(1); // Same cache key despite different key order
  });
});

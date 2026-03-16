import { describe, it, expect } from "vitest";

describe("data-sources/types", () => {
  it("exports budget constants with expected values", async () => {
    const mod = await import("@/lib/data-sources/types");
    expect(mod.LAYER_2_CHAR_BUDGET).toBe(4000);
    expect(mod.LAYER_3_CHAR_BUDGET).toBe(6000);
    expect(mod.MAX_TABLE_ROWS_LAYER_2).toBe(20);
    expect(mod.MAX_TABLE_ROWS_LAYER_3).toBe(10);
    expect(mod.MAX_CONCURRENT_REQUESTS).toBe(20);
  });

  it("exports ToolCache interface (used by DataSourceTool.handler)", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    expect(typeof isToolResult).toBe("function");
  });

  it("isToolResult validates a complete ToolResult", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    const valid = {
      content: "## Test\nSome content",
      citations: [{ id: "[TEST-1]", source: "Test", query: "test query" }],
      vintage: { queriedAt: new Date().toISOString(), source: "Test API" },
      confidence: "HIGH" as const,
      truncated: false,
    };
    expect(isToolResult(valid)).toBe(true);
  });

  it("isToolResult rejects incomplete objects", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    expect(isToolResult({ content: "hello" })).toBe(false);
    expect(isToolResult(null)).toBe(false);
    expect(isToolResult("string")).toBe(false);
    expect(isToolResult(undefined)).toBe(false);
    expect(isToolResult(42)).toBe(false);
  });

  it("isToolResult rejects objects with invalid confidence", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    expect(isToolResult({
      content: "test",
      citations: [],
      vintage: { queriedAt: "2026-01-01", source: "API" },
      confidence: "INVALID",
      truncated: false,
    })).toBe(false);
  });

  it("isToolResult rejects objects with missing vintage.source", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    expect(isToolResult({
      content: "test",
      citations: [],
      vintage: { queriedAt: "2026-01-01" }, // missing source
      confidence: "HIGH",
      truncated: false,
    })).toBe(false);
  });

  it("isToolResult rejects objects with non-boolean truncated", async () => {
    const { isToolResult } = await import("@/lib/data-sources/types");
    expect(isToolResult({
      content: "test",
      citations: [],
      vintage: { queriedAt: "2026-01-01", source: "API" },
      confidence: "HIGH",
      truncated: "no", // string instead of boolean
    })).toBe(false);
  });
});

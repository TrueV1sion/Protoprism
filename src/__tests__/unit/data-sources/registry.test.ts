// src/__tests__/unit/data-sources/registry.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We can't test full archetype routing without tools registered, but we can
// test the registry mechanics: register, lookup, execute, cache reset.

describe("ToolRegistry", () => {
  beforeEach(() => { vi.resetModules(); });

  it("registers a tool and looks it up by name", async () => {
    const { ToolRegistry } = await import("@/lib/data-sources/registry");
    const registry = new ToolRegistry();

    registry.registerTool({
      name: "test_tool",
      description: "A test tool",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
      handler: async () => ({
        content: "result",
        citations: [],
        vintage: { queriedAt: new Date().toISOString(), source: "test" },
        confidence: "HIGH" as const,
        truncated: false,
      }),
      layer: 2,
      sources: ["test"],
    });

    expect(registry.hasToolName("test_tool")).toBe(true);
    expect(registry.hasToolName("nonexistent")).toBe(false);
  });

  it("rejects tool names containing double-underscore", async () => {
    const { ToolRegistry } = await import("@/lib/data-sources/registry");
    const registry = new ToolRegistry();

    expect(() => registry.registerTool({
      name: "server__tool",
      description: "Bad name",
      inputSchema: {},
      handler: async () => ({
        content: "",
        citations: [],
        vintage: { queriedAt: "", source: "" },
        confidence: "LOW" as const,
        truncated: false,
      }),
      layer: 2,
      sources: [],
    })).toThrow("must not contain '__'");
  });

  it("executeTool returns formatted content string", async () => {
    const { ToolRegistry } = await import("@/lib/data-sources/registry");
    const registry = new ToolRegistry();

    registry.registerTool({
      name: "echo_tool",
      description: "Echoes input",
      inputSchema: { type: "object", properties: { msg: { type: "string" } } },
      handler: async (input) => ({
        content: `Echo: ${input.msg}`,
        citations: [{ id: "[E-1]", source: "Echo", query: String(input.msg) }],
        vintage: { queriedAt: new Date().toISOString(), source: "Echo" },
        confidence: "HIGH" as const,
        truncated: false,
      }),
      layer: 2,
      sources: ["echo"],
    });

    const result = await registry.executeTool("echo_tool", { msg: "hello" });
    expect(result).toContain("Echo: hello");
    expect(result).toContain("[E-1]");
  });

  it("getToolsForArchetype returns Anthropic tool format", async () => {
    const { ToolRegistry } = await import("@/lib/data-sources/registry");
    const registry = new ToolRegistry();

    registry.registerTool({
      name: "search_test",
      description: "Test tool",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
      handler: async () => ({
        content: "ok",
        citations: [],
        vintage: { queriedAt: "", source: "t" },
        confidence: "HIGH" as const,
        truncated: false,
      }),
      layer: 2,
      sources: ["test"],
    });

    // Use a real archetype that maps to this tool — we'll test with
    // a manually set routing for unit testing purposes
    registry.setArchetypeRouting("RESEARCHER-DATA", {
      research: [],
      granular: ["search_test"],
    });

    const tools = registry.getToolsForArchetype("RESEARCHER-DATA");
    expect(tools.length).toBe(1);
    expect(tools[0]).toHaveProperty("name", "search_test");
    expect(tools[0]).toHaveProperty("description", "Test tool");
    expect(tools[0]).toHaveProperty("input_schema");
  });

  it("resetCache clears cached results", async () => {
    const { ToolRegistry } = await import("@/lib/data-sources/registry");
    const registry = new ToolRegistry();
    let callCount = 0;

    registry.registerTool({
      name: "counter_tool",
      description: "Counts",
      inputSchema: {},
      handler: async (_input, _cache) => {
        callCount++;
        return {
          content: `count: ${callCount}`,
          citations: [],
          vintage: { queriedAt: "", source: "t" },
          confidence: "HIGH" as const,
          truncated: false,
        };
      },
      layer: 2,
      sources: ["test"],
    });

    await registry.executeTool("counter_tool", {});
    await registry.executeTool("counter_tool", {}); // cached
    expect(callCount).toBe(1);

    registry.resetCache();
    await registry.executeTool("counter_tool", {}); // miss after reset
    expect(callCount).toBe(2);
  });
});

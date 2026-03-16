import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the MCP client module
vi.mock("@/lib/mcp/client", () => ({
  getMCPManager: vi.fn(() => ({
    isServerAvailable: vi.fn((name: string) => name === "pubmed"),
    executeTool: vi.fn(async (qualifiedName: string) => {
      if (qualifiedName === "pubmed__search_articles") {
        return JSON.stringify({ results: [{ title: "Test Article" }] });
      }
      throw new Error("Tool not found");
    }),
  })),
}));

describe("McpBridge", () => {
  beforeEach(() => { vi.resetModules(); });

  it("calls MCP server tool when server is available", async () => {
    const { McpBridge } = await import("@/lib/data-sources/mcp-bridge");
    const bridge = new McpBridge();
    const result = await bridge.call("pubmed", "search_articles", { query: "test" });

    expect(result.available).toBe(true);
    expect(result.server).toBe("pubmed");
    expect(result.data).toContain("Test Article");
  });

  it("returns unavailable when server is not connected", async () => {
    const { McpBridge } = await import("@/lib/data-sources/mcp-bridge");
    const bridge = new McpBridge();
    const result = await bridge.call("clinical_trials", "search_trials", { condition: "cancer" });

    expect(result.available).toBe(false);
    expect(result.error).toBe("MCP server not connected");
  });

  it("reports available servers", async () => {
    const { McpBridge } = await import("@/lib/data-sources/mcp-bridge");
    const bridge = new McpBridge();
    const available = bridge.availableServers();

    expect(available).toContain("pubmed");
    expect(available).not.toContain("clinical_trials");
  });
});

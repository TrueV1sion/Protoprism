import { describe, it, expect, vi, beforeEach } from "vitest";

// Undo the global mock from setup.ts so we can test the real MCPManager
vi.unmock("@/lib/mcp/client");

// Mock the Anthropic AI client dependency (WEB_SEARCH_TOOL)
vi.mock("@/lib/ai/client", () => ({
  WEB_SEARCH_TOOL: { type: "web_search_20250305", name: "web_search" },
}));

// Mock the data-sources registry (WEB_SEARCH_ARCHETYPES is now imported from here)
vi.mock("@/lib/data-sources/registry", () => ({
  WEB_SEARCH_ARCHETYPES: new Set(),
}));

// Mock the MCP SDK transports
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(),
}));

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    { name: "search_articles", description: "Search PubMed", inputSchema: { type: "object", properties: {} } },
  ],
});
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "mock result" }],
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mockConnect;
    listTools = mockListTools;
    callTool = mockCallTool;
    constructor() {}
  },
}));

// Mock remote transports (StreamableHTTP preferred, SSE fallback)
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    close = vi.fn();
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    close = vi.fn();
  },
}));

describe("MCPManager", () => {
  beforeEach(() => {
    vi.resetModules();
    mockConnect.mockReset().mockResolvedValue(undefined);
    mockListTools.mockReset().mockResolvedValue({
      tools: [
        { name: "search_articles", description: "Search PubMed", inputSchema: { type: "object", properties: {} } },
      ],
    });
  });

  it("connects to SSE servers when URL is provided", async () => {
    vi.stubEnv("MCP_PUBMED_URL", "https://mcp.example.com/pubmed");
    vi.doMock("@/lib/mcp/config", () => ({
      MCP_SERVERS: {
        pubmed: {
          description: "PubMed",
          available: true,
          transport: "sse" as const,
          envUrlKey: "MCP_PUBMED_URL",
        },
      },
    }));

    const { MCPManager } = await import("@/lib/mcp/client");
    const manager = new MCPManager();
    await manager.initialize();

    expect(manager.getConnectedServers()).toContain("pubmed");
    expect(manager.getUnavailableServers()).toHaveLength(0);

    await manager.shutdown();
  });

  it("marks SSE server unavailable when URL is missing", async () => {
    vi.stubEnv("MCP_PUBMED_URL", "");
    vi.doMock("@/lib/mcp/config", () => ({
      MCP_SERVERS: {
        pubmed: {
          description: "PubMed",
          available: true,
          transport: "sse" as const,
          envUrlKey: "MCP_PUBMED_URL",
        },
      },
    }));

    const { MCPManager } = await import("@/lib/mcp/client");
    const manager = new MCPManager();
    await manager.initialize();

    expect(manager.getConnectedServers()).toHaveLength(0);
    expect(manager.getUnavailableServers()).toContain("pubmed");

    await manager.shutdown();
  });

  it("routes tool execution to correct server", async () => {
    vi.stubEnv("MCP_PUBMED_URL", "https://mcp.example.com/pubmed");
    vi.doMock("@/lib/mcp/config", () => ({
      MCP_SERVERS: {
        pubmed: {
          description: "PubMed",
          available: true,
          transport: "sse" as const,
          envUrlKey: "MCP_PUBMED_URL",
        },
      },
    }));

    const { MCPManager } = await import("@/lib/mcp/client");
    const manager = new MCPManager();
    await manager.initialize();

    const result = await manager.executeTool("pubmed__search_articles", { query: "test" });
    expect(result).toBe("mock result");

    await manager.shutdown();
  });

  it("getToolsForArchetype returns tools for connected servers", async () => {
    vi.stubEnv("MCP_PUBMED_URL", "https://mcp.example.com/pubmed");
    vi.doMock("@/lib/mcp/config", () => ({
      MCP_SERVERS: {
        pubmed: {
          description: "PubMed",
          available: true,
          transport: "sse" as const,
          envUrlKey: "MCP_PUBMED_URL",
        },
      },
    }));

    const { MCPManager } = await import("@/lib/mcp/client");
    const manager = new MCPManager();
    await manager.initialize();

    const tools = manager.getToolsForArchetype("RESEARCHER-DATA");
    // RESEARCHER-DATA routes to pubmed, clinical_trials, biorxiv
    // but only pubmed is connected, so we get 1 tool
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools[0].name).toBe("pubmed__search_articles");

    await manager.shutdown();
  });
});

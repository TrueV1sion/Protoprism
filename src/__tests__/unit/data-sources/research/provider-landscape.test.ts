// src/__tests__/unit/data-sources/research/provider-landscape.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/census-bureau", () => ({
  censusBureauClient: {
    getAcsData: vi.fn(async () => ({
      data: {
        headers: ["NAME", "B01001_001E", "state"],
        records: [
          { NAME: "California", B01001_001E: 39538223, state: "06" },
          { NAME: "Texas", B01001_001E: 29145505, state: "48" },
          { NAME: "Florida", B01001_001E: 21538187, state: "12" },
        ],
        totalRecords: 3,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "US Census Bureau" },
    })),
  },
}));

// Mock McpBridge
vi.mock("@/lib/data-sources/mcp-bridge", () => ({
  mcpBridge: {
    call: vi.fn(async (server: string, toolName: string) => {
      if (server === "npi_registry") {
        return {
          available: true,
          server: "npi_registry",
          toolName,
          data: JSON.stringify({
            result_count: 150,
            results: [
              {
                basic: { first_name: "Jane", last_name: "Smith" },
                addresses: [{ city: "Boston", state: "MA" }],
                taxonomies: [{ desc: "Cardiology" }],
              },
              {
                basic: { first_name: "John", last_name: "Doe" },
                addresses: [{ city: "Chicago", state: "IL" }],
                taxonomies: [{ desc: "Internal Medicine" }],
              },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_provider_landscape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { providerLandscapeResearchTool } = await import("@/lib/data-sources/research/provider-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await providerLandscapeResearchTool.handler({ query: "Cardiology" }, cache);

    expect(result.content).toContain("## Provider Landscape: Cardiology");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { providerLandscapeResearchTool } = await import("@/lib/data-sources/research/provider-landscape");
    expect(providerLandscapeResearchTool.layer).toBe(3);
    expect(providerLandscapeResearchTool.name).toBe("research_provider_landscape");
    expect(providerLandscapeResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { providerLandscapeResearchTool } = await import("@/lib/data-sources/research/provider-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await providerLandscapeResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("includes provider distribution summary", async () => {
    const { providerLandscapeResearchTool } = await import("@/lib/data-sources/research/provider-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await providerLandscapeResearchTool.handler({ query: "Cardiology" }, cache);

    expect(result.content).toContain("### Provider Distribution");
  });

  it("degrades gracefully when NPI registry is unavailable", async () => {
    const { mcpBridge } = await import("@/lib/data-sources/mcp-bridge");
    (mcpBridge.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      server: "npi_registry",
      toolName: "npi_search",
      error: "server down",
    });

    const { providerLandscapeResearchTool } = await import("@/lib/data-sources/research/provider-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await providerLandscapeResearchTool.handler({ query: "Cardiology" }, cache);

    expect(result.content).toContain("⚠️");
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

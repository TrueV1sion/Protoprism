// src/__tests__/unit/data-sources/research/competitive-intel.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/sec-edgar", () => ({
  secEdgarClient: {
    searchFilings: vi.fn(async () => ({
      data: {
        results: [
          { company: "Test Corp", form_type: "10-K", filed_date: "2025-01-15", description: "Annual Report", accession_number: "001", file_url: "https://sec.gov/test" },
          { company: "Test Corp", form_type: "8-K", filed_date: "2025-03-01", description: "Current Report", accession_number: "002", file_url: "https://sec.gov/test2" },
        ],
        total: 25,
        hasMore: true,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SEC EDGAR EFTS" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/uspto-patents", () => ({
  usptoPatentsClient: {
    searchPatents: vi.fn(async () => ({
      data: {
        patents: [
          { patent_number: "US1234567", patent_title: "Novel Drug Formulation", patent_date: "2024-06-01", assignees: [{ assignee_organization: "Test Corp" }] },
          { patent_number: "US7654321", patent_title: "Drug Delivery System", patent_date: "2023-12-01", assignees: [{ assignee_organization: "Test Corp" }] },
        ],
        count: 2,
        total: 15,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/openfda", () => ({
  openfdaClient: {
    searchDrugLabels: vi.fn(async () => ({
      data: {
        results: [
          { openfda: { brand_name: ["TestDrug"], generic_name: ["testdrug"] }, id: "label-001" },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA" },
    })),
  },
}));

// Mock McpBridge
vi.mock("@/lib/data-sources/mcp-bridge", () => ({
  mcpBridge: {
    call: vi.fn(async (server: string, toolName: string) => {
      if (server === "clinical_trials") {
        return {
          available: true,
          server: "clinical_trials",
          toolName,
          data: JSON.stringify({
            trials: [
              { nctId: "NCT00000001", title: "TestDrug Phase 3 Trial", phase: "PHASE3", status: "RECRUITING" },
              { nctId: "NCT00000002", title: "TestDrug Phase 2 Trial", phase: "PHASE2", status: "COMPLETED" },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_competitive_intel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { competitiveIntelResearchTool } = await import("@/lib/data-sources/research/competitive-intel");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await competitiveIntelResearchTool.handler({ query: "TestDrug" }, cache);

    expect(result.content).toContain("## Competitive Intel: TestDrug");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { competitiveIntelResearchTool } = await import("@/lib/data-sources/research/competitive-intel");
    expect(competitiveIntelResearchTool.layer).toBe(3);
    expect(competitiveIntelResearchTool.name).toBe("research_competitive_intel");
    expect(competitiveIntelResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { competitiveIntelResearchTool } = await import("@/lib/data-sources/research/competitive-intel");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await competitiveIntelResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("includes competitive summary table", async () => {
    const { competitiveIntelResearchTool } = await import("@/lib/data-sources/research/competitive-intel");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await competitiveIntelResearchTool.handler({ query: "TestDrug" }, cache);

    expect(result.content).toContain("### Competitive Summary");
  });

  it("degrades gracefully when clinical trials unavailable", async () => {
    const { mcpBridge } = await import("@/lib/data-sources/mcp-bridge");
    (mcpBridge.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      server: "clinical_trials",
      toolName: "search_trials",
      error: "server down",
    });

    const { competitiveIntelResearchTool } = await import("@/lib/data-sources/research/competitive-intel");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await competitiveIntelResearchTool.handler({ query: "TestDrug" }, cache);

    expect(result.content).toContain("⚠️");
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

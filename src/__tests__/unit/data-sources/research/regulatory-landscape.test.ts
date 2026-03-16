// src/__tests__/unit/data-sources/research/regulatory-landscape.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/federal-register", () => ({
  federalRegisterClient: {
    searchDocuments: vi.fn(async () => ({
      data: {
        results: [
          { title: "Final Rule on Drug Pricing", type: "RULE", publication_date: "2025-06-01", document_number: "2025-001" },
          { title: "Proposed Rule on Coverage", type: "PRORULE", publication_date: "2025-05-01", document_number: "2025-002" },
        ],
        total: 42,
        hasMore: true,
        totalPages: 5,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Federal Register" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/congress-gov", () => ({
  congressGovClient: {
    searchBills: vi.fn(async () => ({
      data: {
        data: {
          bills: [
            { number: "HR123", title: "Healthcare Affordability Act", latestAction: { actionDate: "2025-03-01" } },
          ],
        },
        pagination: { count: 3 },
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congress.gov" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/gpo-govinfo", () => ({
  gpoGovinfoClient: {
    search: vi.fn(async () => ({
      data: {
        packages: [
          { packageId: "CFR-2025-title42", title: "Code of Federal Regulations Title 42" },
        ],
        count: 1,
        totalCount: 10,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "GPO GovInfo" },
    })),
  },
}));

// Mock McpBridge
vi.mock("@/lib/data-sources/mcp-bridge", () => ({
  mcpBridge: {
    call: vi.fn(async (server: string, toolName: string) => {
      if (server === "cms_coverage") {
        return {
          available: true,
          server: "cms_coverage",
          toolName,
          data: JSON.stringify({
            results: [
              { document_id: "NCD-100", title: "Coverage for Healthcare Services", status: "Active" },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_regulatory_landscape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { regulatoryLandscapeResearchTool } = await import("@/lib/data-sources/research/regulatory-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await regulatoryLandscapeResearchTool.handler({ query: "healthcare" }, cache);

    expect(result.content).toContain("## Regulatory Landscape: healthcare");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { regulatoryLandscapeResearchTool } = await import("@/lib/data-sources/research/regulatory-landscape");
    expect(regulatoryLandscapeResearchTool.layer).toBe(3);
    expect(regulatoryLandscapeResearchTool.name).toBe("research_regulatory_landscape");
    expect(regulatoryLandscapeResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { regulatoryLandscapeResearchTool } = await import("@/lib/data-sources/research/regulatory-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await regulatoryLandscapeResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("includes Federal Register notices table", async () => {
    const { regulatoryLandscapeResearchTool } = await import("@/lib/data-sources/research/regulatory-landscape");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await regulatoryLandscapeResearchTool.handler({ query: "healthcare" }, cache);

    expect(result.content).toContain("### Federal Register Notices");
  });
});

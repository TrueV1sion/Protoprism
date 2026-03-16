// src/__tests__/unit/data-sources/research/company-position.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/sec-edgar", () => ({
  secEdgarClient: {
    searchFilings: vi.fn(async () => ({
      data: {
        results: [
          {
            company: "Acme Corp",
            cik: "0001234567",
            form_type: "10-K",
            filed_date: "2025-03-15",
            accession_number: "0001234567-25-000001",
            file_url: "https://example.com/filing",
            description: "Annual Report",
          },
        ],
        total: 12,
        hasMore: true,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SEC EDGAR" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/sam-gov", () => ({
  samGovClient: {
    searchEntities: vi.fn(async () => ({
      data: {
        results: [
          {
            legalBusinessName: "Acme Corp",
            ueiSAM: "ACME123456789",
            registrationStatus: "Active",
          },
        ],
        total: 3,
        count: 1,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
    searchOpportunities: vi.fn(async () => ({
      data: { results: [], total: 0, count: 0 },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/uspto-patents", () => ({
  usptoPatentsClient: {
    searchPatents: vi.fn(async () => ({
      data: {
        patents: [
          {
            patent_number: "US12345678",
            patent_title: "Improved Widget System",
            patent_date: "2025-06-01",
            assignees: [{ assignee_organization: "Acme Corp" }],
          },
        ],
        total: 8,
        count: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    })),
  },
}));

describe("research_company_position", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { companyPositionResearchTool } = await import(
      "@/lib/data-sources/research/company-position"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await companyPositionResearchTool.handler(
      { query: "Acme Corp", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Company Position: Acme Corp");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // All 3 sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
  });

  it("has layer=3 and correct name", async () => {
    const { companyPositionResearchTool } = await import(
      "@/lib/data-sources/research/company-position"
    );
    expect(companyPositionResearchTool.layer).toBe(3);
    expect(companyPositionResearchTool.name).toBe("research_company_position");
    expect(companyPositionResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { companyPositionResearchTool } = await import(
      "@/lib/data-sources/research/company-position"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await companyPositionResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

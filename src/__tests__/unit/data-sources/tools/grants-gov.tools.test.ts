// src/__tests__/unit/data-sources/tools/grants-gov.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/grants-gov", () => ({
  grantsGovClient: {
    searchOpportunities: vi.fn(async () => ({
      data: {
        total: 250,
        count: 2,
        page: 1,
        limit: 15,
        hasMore: true,
        nextPage: 2,
        results: [
          {
            opportunity_id: "362783",
            title: "Rural Health Outreach Program",
            agency: "HHS",
            funding_category: "Health",
            open_date: "2024-01-01",
            close_date: "2024-03-31",
            estimated_funding: "5000000",
            award_ceiling: "500000",
            award_floor: "100000",
            status: "posted",
            opportunity_number: "HRSA-24-001",
            url: "https://www.grants.gov/search-results-detail/362783",
          },
          {
            opportunity_id: "362900",
            title: "Cancer Research Innovation Grant",
            agency: "NIH",
            funding_category: "Health",
            open_date: "2024-01-15",
            close_date: "2024-04-15",
            estimated_funding: "10000000",
            award_ceiling: "1000000",
            award_floor: null,
            status: "posted",
            opportunity_number: "NIH-24-002",
            url: "https://www.grants.gov/search-results-detail/362900",
          },
        ],
        source: "legacy",
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Grants.gov" },
    })),
    getOpportunity: vi.fn(async () => ({
      data: {
        opportunity_id: "362783",
        title: "Rural Health Outreach Program",
        agency: "HHS",
        funding_category: "Health",
        open_date: "2024-01-01",
        close_date: "2024-03-31",
        estimated_funding: "5000000",
        award_ceiling: "500000",
        award_floor: "100000",
        status: "posted",
        opportunity_number: "HRSA-24-001",
        url: "https://www.grants.gov/search-results-detail/362783",
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Grants.gov" },
    })),
  },
}));

describe("Grants.gov granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_grants returns markdown table, not JSON", async () => {
    const { grantsGovTools } = await import("@/lib/data-sources/tools/grants-gov.tools");
    const tool = grantsGovTools.find((t) => t.name === "search_grants");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ keyword: "rural health" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Rural Health");
    expect(result.content).not.toContain('"opportunity_id"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Grants.gov");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_grants shows total count and truncation status", async () => {
    const { grantsGovTools } = await import("@/lib/data-sources/tools/grants-gov.tools");
    const tool = grantsGovTools.find((t) => t.name === "search_grants");

    const result = await tool!.handler({ funding_category: "Health" }, cache);
    expect(result.content).toContain("250");
    expect(result.truncated).toBe(true);
  });

  it("get_grant_detail returns grant details", async () => {
    const { grantsGovTools } = await import("@/lib/data-sources/tools/grants-gov.tools");
    const tool = grantsGovTools.find((t) => t.name === "get_grant_detail");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ opportunity_id: "362783" }, cache);
    expect(result.content).toContain("Rural Health Outreach");
    expect(result.content).toContain("HHS");
    expect(result.content).toContain("HRSA-24-001");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes grants-gov", async () => {
    const { grantsGovTools } = await import("@/lib/data-sources/tools/grants-gov.tools");
    for (const tool of grantsGovTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("grants-gov");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { grantsGovTools } = await import("@/lib/data-sources/tools/grants-gov.tools");
    expect(grantsGovTools).toHaveLength(2);
  });
});

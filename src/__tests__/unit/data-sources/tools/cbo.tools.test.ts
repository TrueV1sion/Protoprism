// src/__tests__/unit/data-sources/tools/cbo.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/cbo", () => ({
  cboClient: {
    searchPublications: vi.fn(async () => ({
      data: {
        items: [
          { title: "The Budget and Economic Outlook: 2024 to 2034", link: "https://www.cbo.gov/publication/59710", description: "CBO's baseline budget projections", pubDate: "Mon, 07 Feb 2024 12:00:00 +0000", publicationId: "59710" },
          { title: "Options for Reducing the Deficit: 2023 to 2032", link: "https://www.cbo.gov/publication/58163", description: "Options analysis for deficit reduction", pubDate: "Wed, 07 Dec 2022 12:00:00 +0000", publicationId: "58163" },
        ],
        total: 2,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congressional Budget Office" },
    })),
    getCostEstimates: vi.fn(async () => ({
      data: {
        items: [
          { title: "H.R. 5894, Fiscal Year 2024 NDAA", link: "https://www.cbo.gov/publication/60001", description: "Cost estimate for defense authorization", pubDate: "Fri, 15 Dec 2023 12:00:00 +0000", publicationId: "60001" },
        ],
        total: 1,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congressional Budget Office" },
    })),
    getRecentPublications: vi.fn(async () => ({
      data: { items: [], total: 0 },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congressional Budget Office" },
    })),
    getPublicationDetail: vi.fn(async () => ({
      data: { title: "Budget Outlook", url: "https://www.cbo.gov/publication/59710", content: "Full content..." },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congressional Budget Office" },
    })),
  },
}));

describe("CBO granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_cbo_reports returns markdown table, not JSON", async () => {
    const { cboTools } = await import("@/lib/data-sources/tools/cbo.tools");
    const tool = cboTools.find((t) => t.name === "search_cbo_reports");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "budget outlook" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Budget and Economic Outlook");
    expect(result.content).not.toContain('"pubDate"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Congressional Budget Office");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_cbo_reports includes citation with result count", async () => {
    const { cboTools } = await import("@/lib/data-sources/tools/cbo.tools");
    const tool = cboTools.find((t) => t.name === "search_cbo_reports");

    const result = await tool!.handler({ query: "deficit" }, cache);
    expect(result.citations[0].resultCount).toBe(2);
  });

  it("get_cbo_cost_estimates returns recent cost estimates", async () => {
    const { cboTools } = await import("@/lib/data-sources/tools/cbo.tools");
    const tool = cboTools.find((t) => t.name === "get_cbo_cost_estimates");
    expect(tool).toBeDefined();

    const result = await tool!.handler({}, cache);
    expect(result.content).toContain("Cost Estimates");
    expect(result.content).toContain("NDAA");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes cbo", async () => {
    const { cboTools } = await import("@/lib/data-sources/tools/cbo.tools");
    for (const tool of cboTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("cbo");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { cboTools } = await import("@/lib/data-sources/tools/cbo.tools");
    expect(cboTools).toHaveLength(2);
  });
});

// src/__tests__/unit/data-sources/research/legislative-status.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/congress-gov", () => ({
  congressGovClient: {
    searchBills: vi.fn(async () => ({
      data: {
        data: {
          bills: [
            {
              type: "HR",
              number: "4521",
              title: "Healthcare Access Improvement Act of 2025",
              latestAction: {
                actionDate: "2025-09-10",
                text: "Referred to the Subcommittee on Health",
              },
              updateDate: "2025-09-10",
            },
            {
              type: "S",
              number: "2301",
              title: "Affordable Prescription Drug Act",
              latestAction: {
                actionDate: "2025-07-22",
                text: "Passed Senate",
              },
              updateDate: "2025-07-22",
            },
          ],
        },
        pagination: { count: 38, next: null },
        hasMore: true,
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
        count: 5,
        totalCount: 156,
        packages: [
          { packageId: "BILLS-119hr4521ih", title: "Healthcare Access Improvement Act", dateIssued: "2025-09-01" },
          { packageId: "PLAW-118publ10", title: "Inflation Reduction Act", dateIssued: "2022-08-16" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "GPO GovInfo" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/cbo", () => ({
  cboClient: {
    searchPublications: vi.fn(async () => ({
      data: {
        items: [
          { title: "Cost Estimate: HR 4521", link: "https://cbo.gov/publication/58000", description: "CBO cost estimate", pubDate: "2025-10-01" },
          { title: "The Budget and Economic Outlook: 2025-2035", link: "https://cbo.gov/publication/57000", description: "Annual outlook", pubDate: "2025-01-15" },
        ],
        total: 7,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congressional Budget Office" },
    })),
  },
}));

describe("research_legislative_status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { legislativeStatusResearchTool } = await import(
      "@/lib/data-sources/research/legislative-status"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await legislativeStatusResearchTool.handler(
      { query: "healthcare reform", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Legislative Status: healthcare reform");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // All 3 sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
  });

  it("has layer=3 and correct name", async () => {
    const { legislativeStatusResearchTool } = await import(
      "@/lib/data-sources/research/legislative-status"
    );
    expect(legislativeStatusResearchTool.layer).toBe(3);
    expect(legislativeStatusResearchTool.name).toBe("research_legislative_status");
    expect(legislativeStatusResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { legislativeStatusResearchTool } = await import(
      "@/lib/data-sources/research/legislative-status"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await legislativeStatusResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

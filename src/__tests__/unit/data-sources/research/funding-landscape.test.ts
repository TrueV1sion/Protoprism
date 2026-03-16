// src/__tests__/unit/data-sources/research/funding-landscape.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/grants-gov", () => ({
  grantsGovClient: {
    searchOpportunities: vi.fn(async () => ({
      data: {
        results: [
          {
            opportunity_id: "GRANT-2025-001",
            title: "Advanced Research in Telehealth Technologies",
            agency: "Department of Health and Human Services",
            award_ceiling: "2000000",
            estimated_funding: "1500000",
            status: "posted",
          },
          {
            opportunity_id: "GRANT-2025-002",
            title: "Rural Health Infrastructure Modernization",
            agency: "HRSA",
            award_ceiling: "500000",
            estimated_funding: null,
            status: "posted",
          },
        ],
        total: 23,
        count: 2,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Grants.gov" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/sam-gov", () => ({
  samGovClient: {
    searchOpportunities: vi.fn(async () => ({
      data: {
        results: [
          {
            title: "Health IT Systems Integration Services",
            opportunityTitle: "Health IT Systems Integration Services",
            fullParentPathName: "DEPT OF HEALTH AND HUMAN SERVICES",
            type: "Solicitation",
            typeOfSetAside: "8(a) Set-Aside",
          },
          {
            title: "Medical Device Evaluation Contract",
            fullParentPathName: "FOOD AND DRUG ADMINISTRATION",
            type: "Award Notice",
          },
        ],
        total: 11,
        count: 2,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
    searchEntities: vi.fn(async () => ({
      data: { results: [], total: 0, count: 0 },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
  },
}));

describe("research_funding_landscape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { fundingLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/funding-landscape"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await fundingLandscapeResearchTool.handler(
      { query: "telehealth", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Funding Landscape: telehealth");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // Both sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(2);
  });

  it("has layer=3 and correct name", async () => {
    const { fundingLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/funding-landscape"
    );
    expect(fundingLandscapeResearchTool.layer).toBe(3);
    expect(fundingLandscapeResearchTool.name).toBe("research_funding_landscape");
    expect(fundingLandscapeResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { fundingLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/funding-landscape"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await fundingLandscapeResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

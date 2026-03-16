// src/__tests__/unit/data-sources/research/market-dynamics.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/bls-data", () => ({
  blsDataClient: {
    getSeries: vi.fn(async () => ({
      data: {
        series: [
          {
            seriesID: "CUUR0000SAM",
            data: [
              { year: "2025", period: "M12", periodName: "December", value: "342.5" },
              { year: "2025", period: "M11", periodName: "November", value: "341.2" },
              { year: "2024", period: "M12", periodName: "December", value: "330.1" },
            ],
          },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Bureau of Labor Statistics" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/census-bureau", () => ({
  censusBureauClient: {
    getSahieData: vi.fn(async () => ({
      data: {
        headers: ["GEOCAT", "PCTUI_PT", "NIC_PT"],
        records: [
          { GEOCAT: "40", PCTUI_PT: "8.5", NIC_PT: "27500000" },
          { GEOCAT: "50", PCTUI_PT: "12.3", NIC_PT: "5000000" },
        ],
        totalRecords: 2,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "US Census Bureau SAHIE" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/oecd-health", () => ({
  oecdHealthClient: {
    getHealthExpenditures: vi.fn(async () => ({
      data: {
        observations: [
          { country: "United States", countryCode: "USA", year: "2022", value: 16.6, unit: "% GDP" },
          { country: "United States", countryCode: "USA", year: "2021", value: 17.8, unit: "% GDP" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics" },
    })),
  },
}));

describe("research_market_dynamics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { marketDynamicsResearchTool } = await import(
      "@/lib/data-sources/research/market-dynamics"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await marketDynamicsResearchTool.handler(
      { query: "healthcare cost inflation", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Market Dynamics: healthcare cost inflation");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // All 3 sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
  });

  it("has layer=3 and correct name", async () => {
    const { marketDynamicsResearchTool } = await import(
      "@/lib/data-sources/research/market-dynamics"
    );
    expect(marketDynamicsResearchTool.layer).toBe(3);
    expect(marketDynamicsResearchTool.name).toBe("research_market_dynamics");
    expect(marketDynamicsResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { marketDynamicsResearchTool } = await import(
      "@/lib/data-sources/research/market-dynamics"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await marketDynamicsResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

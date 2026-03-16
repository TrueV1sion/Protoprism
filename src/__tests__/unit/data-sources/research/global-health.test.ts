// src/__tests__/unit/data-sources/research/global-health.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/who-gho", () => ({
  whoGhoClient: {
    listIndicators: vi.fn(async () => ({
      data: {
        results: [
          { IndicatorCode: "WHOSIS_000001", IndicatorName: "Life expectancy at birth (years)" },
          { IndicatorCode: "NCD_BMI_30C", IndicatorName: "Prevalence of obesity among adults" },
        ],
        count: 14,
        hasMore: true,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "WHO Global Health Observatory" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/oecd-health", () => ({
  oecdHealthClient: {
    getHealthExpenditures: vi.fn(async () => ({
      data: {
        observations: [
          { country: "United States", countryCode: "USA", year: "2022", value: 16.6, unit: "% GDP" },
          { country: "United Kingdom", countryCode: "GBR", year: "2022", value: 10.9, unit: "% GDP" },
          { country: "Germany", countryCode: "DEU", year: "2022", value: 12.7, unit: "% GDP" },
          { country: "France", countryCode: "FRA", year: "2022", value: 11.9, unit: "% GDP" },
          { country: "Japan", countryCode: "JPN", year: "2022", value: 11.1, unit: "% GDP" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/ahrq-hcup", () => ({
  ahrqHcupClient: {
    searchAll: vi.fn(async () => ({
      data: {
        results: [
          {
            score: 0.95,
            result_type: "diagnosis",
            data: {
              name: "Septicemia or severe sepsis",
              annual_discharges: 1750000,
              aggregate_cost: 24500000000,
              mean_cost: 14000,
            },
          },
        ],
        total: 3,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "AHRQ HCUP" },
    })),
  },
}));

describe("research_global_health", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { globalHealthResearchTool } = await import(
      "@/lib/data-sources/research/global-health"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await globalHealthResearchTool.handler(
      { query: "obesity", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Global Health: obesity");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // All 3 sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(3);
  });

  it("has layer=3 and correct name", async () => {
    const { globalHealthResearchTool } = await import(
      "@/lib/data-sources/research/global-health"
    );
    expect(globalHealthResearchTool.layer).toBe(3);
    expect(globalHealthResearchTool.name).toBe("research_global_health");
    expect(globalHealthResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { globalHealthResearchTool } = await import(
      "@/lib/data-sources/research/global-health"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await globalHealthResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

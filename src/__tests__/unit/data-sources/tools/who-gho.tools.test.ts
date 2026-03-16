// src/__tests__/unit/data-sources/tools/who-gho.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/who-gho", () => ({
  whoGhoClient: {
    listIndicators: vi.fn(async () => ({
      data: {
        results: [
          { IndicatorCode: "WHOSIS_000001", IndicatorName: "Life expectancy at birth (years)" },
          { IndicatorCode: "NCD_BMI_MEAN", IndicatorName: "Mean BMI (kg/m²) (age-standardized estimate)" },
          { IndicatorCode: "MDG_0000000026", IndicatorName: "Infant mortality rate (per 1000 live births)" },
        ],
        count: 3,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "WHO Global Health Observatory" },
    })),
    getIndicatorData: vi.fn(async () => ({
      data: {
        results: [
          { SpatialDim: "USA", TimeDim: 2022, Dim1: "BTSX", Value: "76.1", NumericValue: 76.1, Low: 75.8, High: 76.4 },
          { SpatialDim: "USA", TimeDim: 2021, Dim1: "BTSX", Value: "76.3", NumericValue: 76.3, Low: 76.0, High: 76.6 },
          { SpatialDim: "GBR", TimeDim: 2022, Dim1: "BTSX", Value: "80.7", NumericValue: 80.7, Low: 80.4, High: 81.0 },
        ],
        count: 3,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "WHO Global Health Observatory" },
    })),
  },
}));

describe("WHO GHO granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_who_indicators returns markdown table, not JSON", async () => {
    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    const tool = whoGhoTools.find((t) => t.name === "search_who_indicators");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ keyword: "life expectancy" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("WHOSIS_000001");
    expect(result.content).toContain("Life expectancy");
    expect(result.content).not.toContain('"IndicatorCode"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("WHO");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_who_indicators includes Indicator Code and Name columns", async () => {
    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    const tool = whoGhoTools.find((t) => t.name === "search_who_indicators");

    const result = await tool!.handler({}, cache);
    expect(result.content).toContain("Indicator Code");
    expect(result.content).toContain("Indicator Name");
    expect(result.content).toContain("NCD_BMI_MEAN");
  });

  it("get_who_indicator_data returns data with Country, Year, Value columns", async () => {
    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    const tool = whoGhoTools.find((t) => t.name === "get_who_indicator_data");
    expect(tool).toBeDefined();

    const result = await tool!.handler(
      { indicator_code: "WHOSIS_000001", country: "USA", year_from: 2020, year_to: 2022 },
      cache,
    );
    expect(result.content).toContain("##");
    expect(result.content).toContain("WHOSIS_000001");
    expect(result.content).toContain("USA");
    expect(result.content).toContain("76.1");
    expect(result.content).not.toContain('"SpatialDim"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("WHO");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_who_indicator_data handles empty results", async () => {
    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    vi.mocked(whoGhoClient.getIndicatorData).mockResolvedValueOnce({
      data: { results: [], count: 0, hasMore: false },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "WHO Global Health Observatory" },
    });

    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    const tool = whoGhoTools.find((t) => t.name === "get_who_indicator_data");

    const result = await tool!.handler({ indicator_code: "NONEXISTENT" }, cache);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    for (const tool of whoGhoTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("who-gho");
    }
  });

  it("exports 2 tools", async () => {
    const { whoGhoTools } = await import("@/lib/data-sources/tools/who-gho.tools");
    expect(whoGhoTools).toHaveLength(2);
  });
});

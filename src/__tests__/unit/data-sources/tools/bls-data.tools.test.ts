// src/__tests__/unit/data-sources/tools/bls-data.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/bls-data", () => ({
  blsDataClient: {
    getTimeSeries: vi.fn(async () => ({
      data: {
        series: [
          {
            seriesID: "CUUR0000SAM",
            data: [
              { year: "2024", period: "M13", periodName: "Annual", value: "325.4", footnotes: [], latest: "true" },
              { year: "2023", period: "M13", periodName: "Annual", value: "310.2", footnotes: [] },
              { year: "2022", period: "M13", periodName: "Annual", value: "295.8", footnotes: [] },
            ],
          },
        ],
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Bureau of Labor Statistics" },
    })),
  },
}));

describe("BLS Data granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_bls_series returns markdown table, not JSON", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    const tool = blsDataTools.find((t) => t.name === "search_bls_series");
    expect(tool).toBeDefined();

    const result = await tool!.handler({
      series_ids: ["CUUR0000SAM"],
      start_year: 2022,
      end_year: 2024,
    }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("CUUR0000SAM");
    expect(result.content).toContain("325.4");
    expect(result.content).not.toContain('"seriesID"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Bureau of Labor Statistics");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_bls_series includes date range in citation", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    const tool = blsDataTools.find((t) => t.name === "search_bls_series");

    const result = await tool!.handler({
      series_ids: ["CUUR0000SAM"],
      start_year: 2020,
      end_year: 2024,
    }, cache);
    expect(result.citations[0].dateRange).toBe("2020–2024");
  });

  it("get_healthcare_cpi returns consolidated CPI table", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    const tool = blsDataTools.find((t) => t.name === "get_healthcare_cpi");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ categories: ["medical_care"], start_year: 2022, end_year: 2024 }, cache);
    expect(result.content).toContain("Healthcare CPI");
    expect(result.content).toContain("Medical Care");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("get_healthcare_cpi uses all categories by default", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    const tool = blsDataTools.find((t) => t.name === "get_healthcare_cpi");
    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");

    await tool!.handler({}, cache);
    expect(vi.mocked(blsDataClient.getTimeSeries)).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesIds: expect.arrayContaining(["CUUR0000SAM"]),
        annualAverage: true,
      }),
    );
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    for (const tool of blsDataTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("bls");
    }
  });

  it("exports 2 tools", async () => {
    const { blsDataTools } = await import("@/lib/data-sources/tools/bls-data.tools");
    expect(blsDataTools).toHaveLength(2);
  });
});

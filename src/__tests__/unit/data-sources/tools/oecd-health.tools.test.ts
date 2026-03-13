// src/__tests__/unit/data-sources/tools/oecd-health.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/oecd-health", () => ({
  oecdHealthClient: {
    getLifeExpectancy: vi.fn(async () => ({
      data: {
        indicator: "LIFE_EXP",
        unit: "Years",
        dataflow: "HEALTH_STAT",
        totalObservations: 3,
        observations: [
          { country: "United States", countryCode: "USA", indicator: "LIFE_EXP", year: "2022", value: 76.1, unit: "Years" },
          { country: "United Kingdom", countryCode: "GBR", indicator: "LIFE_EXP", year: "2022", value: 81.3, unit: "Years" },
          { country: "Germany", countryCode: "DEU", indicator: "LIFE_EXP", year: "2022", value: 80.7, unit: "Years" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics (SDMX)" },
    })),
    getHealthExpenditures: vi.fn(async () => ({
      data: {
        indicator: "HEALTH_EXP_GDP",
        unit: "% GDP",
        dataflow: "SHA",
        totalObservations: 2,
        observations: [
          { country: "United States", countryCode: "USA", indicator: "HEALTH_EXP_GDP", year: "2022", value: 16.6, unit: "% GDP" },
          { country: "Germany", countryCode: "DEU", indicator: "HEALTH_EXP_GDP", year: "2022", value: 12.7, unit: "% GDP" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics (SDMX)" },
    })),
    getDoctors: vi.fn(async () => ({
      data: {
        indicator: "PHYSICIANS",
        unit: "Per 1,000 population",
        dataflow: "HEALTH_REAC",
        totalObservations: 2,
        observations: [
          { country: "Germany", countryCode: "DEU", indicator: "PHYSICIANS", year: "2022", value: 4.5, unit: "Per 1,000 population" },
          { country: "United States", countryCode: "USA", indicator: "PHYSICIANS", year: "2022", value: 2.6, unit: "Per 1,000 population" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics (SDMX)" },
    })),
    getHealthData: vi.fn(async () => ({
      data: {
        indicator: "CUSTOM",
        unit: "",
        dataflow: "CUSTOM",
        totalObservations: 0,
        observations: [],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "OECD Health Statistics (SDMX)" },
    })),
  },
}));

describe("OECD Health granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_oecd_indicators returns markdown table for life_expectancy", async () => {
    const { oecdHealthTools } = await import("@/lib/data-sources/tools/oecd-health.tools");
    const tool = oecdHealthTools.find((t) => t.name === "search_oecd_indicators");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ indicator: "life_expectancy", countries: ["USA", "GBR"] }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Life Expectancy");
    expect(result.content).toContain("76.1");
    expect(result.content).not.toContain('"countryCode"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("OECD");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_oecd_indicators handles doctors indicator", async () => {
    const { oecdHealthTools } = await import("@/lib/data-sources/tools/oecd-health.tools");
    const tool = oecdHealthTools.find((t) => t.name === "search_oecd_indicators");

    const result = await tool!.handler({ indicator: "doctors" }, cache);
    expect(result.content).toContain("Physician");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_oecd_health_expenditures returns expenditure data", async () => {
    const { oecdHealthTools } = await import("@/lib/data-sources/tools/oecd-health.tools");
    const tool = oecdHealthTools.find((t) => t.name === "get_oecd_health_expenditures");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ countries: ["USA", "DEU"] }, cache);
    expect(result.content).toContain("Health Expenditure");
    expect(result.content).toContain("16.6%");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes oecd-health", async () => {
    const { oecdHealthTools } = await import("@/lib/data-sources/tools/oecd-health.tools");
    for (const tool of oecdHealthTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("oecd-health");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { oecdHealthTools } = await import("@/lib/data-sources/tools/oecd-health.tools");
    expect(oecdHealthTools).toHaveLength(2);
  });
});

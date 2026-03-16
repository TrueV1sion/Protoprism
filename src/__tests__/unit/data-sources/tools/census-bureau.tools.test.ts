// src/__tests__/unit/data-sources/tools/census-bureau.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/census-bureau", () => ({
  censusBureauClient: {
    getAcsData: vi.fn(async () => ({
      data: {
        headers: ["B27001_001E", "NAME", "state"],
        records: [
          { "B27001_001E": 39500000, NAME: "California", state: "06" },
          { "B27001_001E": 21500000, NAME: "Texas", state: "48" },
        ],
        totalRecords: 2,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "US Census Bureau ACS" },
    })),
    getSahieData: vi.fn(async () => ({
      data: {
        headers: ["NIC_PT", "NUI_PT", "PCTIC_PT", "PCTUI_PT", "NAME", "STABREV"],
        records: [
          { NIC_PT: 35000000, NUI_PT: 4000000, PCTIC_PT: 89.7, PCTUI_PT: 10.3, NAME: "California", STABREV: "CA" },
          { NIC_PT: 23000000, NUI_PT: 5000000, PCTIC_PT: 82.1, PCTUI_PT: 17.9, NAME: "Texas", STABREV: "TX" },
        ],
        totalRecords: 2,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "US Census Bureau SAHIE" },
    })),
  },
}));

describe("Census Bureau granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_census_data returns markdown table, not JSON", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    const tool = censusBureauTools.find((t) => t.name === "search_census_data");
    expect(tool).toBeDefined();

    const result = await tool!.handler(
      { year: 2022, variables: ["B27001_001E", "NAME"], geography: "state:*" },
      cache,
    );
    expect(result.content).toContain("##");
    expect(result.content).toContain("California");
    expect(result.content).toContain("B27001_001E");
    expect(result.content).not.toContain('"state"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Census Bureau");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_census_data calls getAcsData with correct params", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const tool = censusBureauTools.find((t) => t.name === "search_census_data");

    await tool!.handler(
      { year: 2022, variables: ["B27001_001E", "NAME"], geography: "state:*", dataset: "acs/acs1" },
      cache,
    );
    expect(vi.mocked(censusBureauClient.getAcsData)).toHaveBeenCalledWith({
      year: 2022,
      variables: ["B27001_001E", "NAME"],
      geography: "state:*",
      dataset: "acs/acs1",
    });
  });

  it("get_health_insurance returns SAHIE data with insured/uninsured columns", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    const tool = censusBureauTools.find((t) => t.name === "get_health_insurance");
    expect(tool).toBeDefined();

    const result = await tool!.handler({}, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Health Insurance");
    expect(result.content).toContain("California");
    expect(result.content).toContain("CA");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Census Bureau");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_health_insurance does not expose raw SAHIE variable names as JSON keys", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    const tool = censusBureauTools.find((t) => t.name === "get_health_insurance");

    const result = await tool!.handler({}, cache);
    expect(result.content).not.toContain('"NIC_PT"');
    expect(result.content).not.toContain('"PCTUI_PT"');
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    for (const tool of censusBureauTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("census-bureau");
    }
  });

  it("exports 2 tools", async () => {
    const { censusBureauTools } = await import("@/lib/data-sources/tools/census-bureau.tools");
    expect(censusBureauTools).toHaveLength(2);
  });
});

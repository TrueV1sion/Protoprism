// src/__tests__/unit/data-sources/tools/ahrq-hcup.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/ahrq-hcup", () => ({
  ahrqHcupClient: {
    searchAll: vi.fn(async () => ({
      data: {
        results: [
          {
            score: 0.9,
            result_type: "inpatient_diagnosis",
            data: {
              name: "Septicemia",
              aliases: ["Sepsis", "Blood poisoning"],
              icd10_category: "A40-A41",
              description: "Systemic bacterial infection",
              annual_discharges: 3_900_000,
              aggregate_cost: 62_000_000_000,
              mean_cost: 15_900,
              mortality_rate: 0.158,
              mean_los: 7.5,
            },
          },
          {
            score: 0.7,
            result_type: "inpatient_diagnosis",
            data: {
              name: "Heart failure",
              aliases: ["CHF"],
              icd10_category: "I50",
              description: "Cardiac pump failure",
              annual_discharges: 3_100_000,
              aggregate_cost: 28_000_000_000,
              mean_cost: 9_000,
              mortality_rate: 0.036,
              mean_los: 5.1,
            },
          },
        ],
        total: 2,
        query: "sepsis",
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", dataThrough: "2021", source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)" },
    })),
    getTopConditions: vi.fn(async () => ({
      data: {
        conditions: [
          {
            name: "Septicemia",
            aliases: ["Sepsis"],
            icd10_category: "A40-A41",
            description: "Systemic bacterial infection",
            annual_discharges: 3_900_000,
            aggregate_cost: 62_000_000_000,
            mean_cost: 15_900,
            mortality_rate: 0.158,
            mean_los: 7.5,
          },
          {
            name: "Heart failure",
            aliases: ["CHF"],
            icd10_category: "I50",
            description: "Cardiac pump failure",
            annual_discharges: 3_100_000,
            aggregate_cost: 28_000_000_000,
            mean_cost: 9_000,
            mortality_rate: 0.036,
            mean_los: 5.1,
          },
        ],
        rankedBy: "hospitalizations",
        setting: "inpatient",
        total: 4,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", dataThrough: "2021", source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)" },
    })),
  },
}));

describe("AHRQ HCUP granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_hcup_statistics returns markdown table, not JSON", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    const tool = ahrqHcupTools.find((t) => t.name === "search_hcup_statistics");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "sepsis" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Septicemia");
    expect(result.content).not.toContain('"annual_discharges"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("AHRQ");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_hcup_statistics includes cost data", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    const tool = ahrqHcupTools.find((t) => t.name === "search_hcup_statistics");

    const result = await tool!.handler({ query: "sepsis", data_type: "inpatient" }, cache);
    // Costs should be formatted as currency
    expect(result.content).toMatch(/\$[\d,.]+[BMK]?/);
    expect(result.content).toContain("15.8%"); // mortality rate
  });

  it("get_hcup_top_conditions returns ranked table", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    const tool = ahrqHcupTools.find((t) => t.name === "get_hcup_top_conditions");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ ranked_by: "hospitalizations", setting: "inpatient", limit: 10 }, cache);
    expect(result.content).toContain("Top Conditions");
    expect(result.content).toContain("Septicemia");
    expect(result.content).toContain("3,900,000");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("get_hcup_top_conditions works with no parameters", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    const tool = ahrqHcupTools.find((t) => t.name === "get_hcup_top_conditions");

    const result = await tool!.handler({}, cache);
    expect(result.content).toContain("hospitalizations");
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes ahrq-hcup", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    for (const tool of ahrqHcupTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("ahrq-hcup");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { ahrqHcupTools } = await import("@/lib/data-sources/tools/ahrq-hcup.tools");
    expect(ahrqHcupTools).toHaveLength(2);
  });
});

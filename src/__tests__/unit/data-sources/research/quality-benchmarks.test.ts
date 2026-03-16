// src/__tests__/unit/data-sources/research/quality-benchmarks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/ahrq-hcup", () => ({
  ahrqHcupClient: {
    searchAll: vi.fn(async () => ({
      data: {
        results: [
          {
            score: 0.9,
            result_type: "inpatient_diagnosis",
            data: {
              name: "Diabetes mellitus",
              icd10_category: "E10-E14",
              annual_discharges: 800000,
              mean_cost: 12500,
              description: "Diabetes mellitus type 2 hospitalizations",
            },
          },
          {
            score: 0.7,
            result_type: "ed_diagnosis",
            data: {
              name: "Hypoglycemia",
              icd10_category: "E16",
              annual_discharges: 250000,
              mean_cost: 4800,
              description: "Hypoglycemia emergency visits",
            },
          },
        ],
        total: 2,
        query: "diabetes",
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "AHRQ HCUP" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/who-gho", () => ({
  whoGhoClient: {
    listIndicators: vi.fn(async () => ({
      data: {
        results: [
          { IndicatorCode: "NCD_BMI_30A", IndicatorName: "Prevalence of obesity among adults (age-standardized estimate) (%)" },
          { IndicatorCode: "DIABETES_PREV", IndicatorName: "Diabetes prevalence" },
        ],
        count: 2,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "WHO Global Health Observatory" },
    })),
  },
}));

// Mock McpBridge
vi.mock("@/lib/data-sources/mcp-bridge", () => ({
  mcpBridge: {
    call: vi.fn(async (server: string, toolName: string) => {
      if (server === "cms_coverage") {
        return {
          available: true,
          server: "cms_coverage",
          toolName,
          data: JSON.stringify({
            results: [
              { document_id: "NCD-160.18", title: "Therapeutic Shoes for Diabetics", status: "Covered" },
              { document_id: "NCD-180.1", title: "Diabetes Outpatient Self-Management Training Services", status: "Covered" },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_quality_benchmarks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { qualityBenchmarksResearchTool } = await import("@/lib/data-sources/research/quality-benchmarks");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await qualityBenchmarksResearchTool.handler({ query: "diabetes" }, cache);

    expect(result.content).toContain("## Quality Benchmarks: diabetes");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { qualityBenchmarksResearchTool } = await import("@/lib/data-sources/research/quality-benchmarks");
    expect(qualityBenchmarksResearchTool.layer).toBe(3);
    expect(qualityBenchmarksResearchTool.name).toBe("research_quality_benchmarks");
    expect(qualityBenchmarksResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { qualityBenchmarksResearchTool } = await import("@/lib/data-sources/research/quality-benchmarks");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await qualityBenchmarksResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("includes AHRQ quality metrics table", async () => {
    const { qualityBenchmarksResearchTool } = await import("@/lib/data-sources/research/quality-benchmarks");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await qualityBenchmarksResearchTool.handler({ query: "diabetes" }, cache);

    expect(result.content).toContain("### AHRQ Quality Metrics");
  });

  it("degrades gracefully when CMS coverage is unavailable", async () => {
    const { mcpBridge } = await import("@/lib/data-sources/mcp-bridge");
    (mcpBridge.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      server: "cms_coverage",
      toolName: "search_national_coverage",
      error: "server down",
    });

    const { qualityBenchmarksResearchTool } = await import("@/lib/data-sources/research/quality-benchmarks");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await qualityBenchmarksResearchTool.handler({ query: "diabetes" }, cache);

    expect(result.content).toContain("⚠️");
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

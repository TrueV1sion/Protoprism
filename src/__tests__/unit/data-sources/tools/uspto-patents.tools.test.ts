// src/__tests__/unit/data-sources/tools/uspto-patents.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/uspto-patents", () => ({
  usptoPatentsClient: {
    searchPatents: vi.fn(async () => ({
      data: {
        patents: [
          {
            patent_number: "10123456",
            patent_title: "Drug Delivery System for Controlled Release",
            patent_abstract: "A system for delivering drugs via controlled release mechanisms.",
            patent_date: "2024-06-15",
            patent_num_cited_by_us_patents: 12,
            assignees: [{ assignee_organization: "MedPharm Inc", assignee_type: "2" }],
            inventors: [{ inventor_first_name: "Jane", inventor_last_name: "Smith", inventor_country: "US" }],
            cpcs: [{ cpc_group_id: "A61K9/00", cpc_group_title: "Medicinal preparations" }],
          },
        ],
        count: 1,
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    })),
    getPatent: vi.fn(async () => ({
      data: {
        patents: [
          {
            patent_number: "10123456",
            patent_title: "Drug Delivery System for Controlled Release",
            patent_abstract: "A system for delivering drugs via controlled release mechanisms that allows precise dosing.",
            patent_date: "2024-06-15",
            patent_type: "utility",
            patent_kind: "B2",
            patent_num_claims: 20,
            patent_num_cited_by_us_patents: 12,
            assignees: [{ assignee_organization: "MedPharm Inc", assignee_type: "2" }],
            inventors: [{ inventor_first_name: "Jane", inventor_last_name: "Smith", inventor_country: "US" }],
            cpcs: [{ cpc_group_id: "A61K9/00", cpc_group_title: "Medicinal preparations" }],
          },
        ],
        count: 1,
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    })),
  },
}));

describe("USPTO Patents granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_patents returns markdown table, not JSON", async () => {
    const { usptoPatentsTools } = await import("@/lib/data-sources/tools/uspto-patents.tools");
    const tool = usptoPatentsTools.find((t) => t.name === "search_patents");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "drug delivery" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("10123456");
    expect(result.content).toContain("MedPharm");
    expect(result.content).not.toContain('"patent_number"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("USPTO");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_patent returns patent details", async () => {
    const { usptoPatentsTools } = await import("@/lib/data-sources/tools/uspto-patents.tools");
    const tool = usptoPatentsTools.find((t) => t.name === "get_patent");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ patent_number: "10123456" }, cache);
    expect(result.content).toContain("10123456");
    expect(result.content).toContain("Drug Delivery System");
    expect(result.content).toContain("MedPharm Inc");
    expect(result.content).toContain("Jane Smith");
    expect(result.content).toContain("A61K9/00");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("get_patent handles not found", async () => {
    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    vi.mocked(usptoPatentsClient.getPatent).mockResolvedValueOnce({
      data: { patents: [], count: 0, total: 0, hasMore: false },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    });

    const { usptoPatentsTools } = await import("@/lib/data-sources/tools/uspto-patents.tools");
    const tool = usptoPatentsTools.find((t) => t.name === "get_patent");

    const result = await tool!.handler({ patent_number: "99999999" }, cache);
    expect(result.content).toContain("not found");
    expect(result.confidence).toBe("LOW");
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { usptoPatentsTools } = await import("@/lib/data-sources/tools/uspto-patents.tools");
    for (const tool of usptoPatentsTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("uspto-patents");
    }
  });

  it("exports 2 tools", async () => {
    const { usptoPatentsTools } = await import("@/lib/data-sources/tools/uspto-patents.tools");
    expect(usptoPatentsTools).toHaveLength(2);
  });
});

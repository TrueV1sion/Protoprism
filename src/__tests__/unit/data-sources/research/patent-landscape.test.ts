// src/__tests__/unit/data-sources/research/patent-landscape.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/uspto-patents", () => ({
  usptoPatentsClient: {
    searchPatents: vi.fn(async () => ({
      data: {
        patents: [
          {
            patent_number: "US11234567",
            patent_title: "Novel Drug Formulation",
            patent_date: "2025-04-10",
            assignees: [{ assignee_organization: "PharmaCo Inc" }],
          },
          {
            patent_number: "US10987654",
            patent_title: "Delivery Mechanism Improvement",
            patent_date: "2024-11-20",
            assignees: [{ assignee_organization: "PharmaCo Inc" }],
          },
        ],
        total: 47,
        count: 2,
        hasMore: true,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "USPTO PatentsView" },
    })),
  },
}));

vi.mock("@/lib/data-sources/clients/fda-orange-book", () => ({
  fdaOrangeBookClient: {
    searchProducts: vi.fn(async () => ({
      data: {
        results: [
          {
            application_number: "NDA123456",
            sponsor_name: "PharmaCo Inc",
            openfda: {
              brand_name: ["Drugitol"],
              generic_name: ["sampledrugib"],
            },
            products: [],
            submissions: [
              { submission_class_code: "NCE", submission_class_code_description: "New Chemical Entity Exclusivity" },
            ],
          },
        ],
        total: 2,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "FDA Orange Book" },
    })),
  },
}));

describe("research_patent_landscape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { patentLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/patent-landscape"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await patentLandscapeResearchTool.handler(
      { query: "sampledrugib", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Patent Landscape: sampledrugib");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // Both sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(2);
  });

  it("has layer=3 and correct name", async () => {
    const { patentLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/patent-landscape"
    );
    expect(patentLandscapeResearchTool.layer).toBe(3);
    expect(patentLandscapeResearchTool.name).toBe("research_patent_landscape");
    expect(patentLandscapeResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { patentLandscapeResearchTool } = await import(
      "@/lib/data-sources/research/patent-landscape"
    );
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await patentLandscapeResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

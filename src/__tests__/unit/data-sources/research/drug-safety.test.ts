// src/__tests__/unit/data-sources/research/drug-safety.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Layer 1 clients
vi.mock("@/lib/data-sources/clients/openfda", () => ({
  openfdaClient: {
    searchAdverseEvents: vi.fn(async () => ({
      data: { results: [{ safetyreportid: "1", serious: 1 }], total: 42, hasMore: true },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", dataThrough: "2025-Q4", source: "openFDA FAERS" },
    })),
    countAdverseEvents: vi.fn(async () => ({
      data: { results: [{ term: "NAUSEA", count: 150 }, { term: "HEADACHE", count: 120 }], total: 2, hasMore: false },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA FAERS" },
    })),
    searchDrugLabels: vi.fn(async () => ({
      data: { results: [{ openfda: { brand_name: ["Humira"] }, boxed_warning: ["Serious infections"] }], total: 1, hasMore: false },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA Labels" },
    })),
  },
}));

// Mock FDA Orange Book client (not yet implemented — returns empty)
vi.mock("@/lib/data-sources/clients/fda-orange-book", () => ({
  fdaOrangeBookClient: {
    searchProducts: vi.fn(async () => ({
      data: { results: [], total: 0, hasMore: false },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "FDA Orange Book" },
    })),
  },
}));

describe("research_drug_safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { drugSafetyResearchTool } = await import("@/lib/data-sources/research/drug-safety");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await drugSafetyResearchTool.handler(
      { query: "adalimumab", timeframe: "3y" },
      cache,
    );

    expect(result.content).toContain("## Drug Safety: adalimumab");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBe("HIGH"); // All in-process sources returned data
    expect(result.citations.length).toBeGreaterThanOrEqual(2);
  });

  it("has layer=3 and starts with research_", async () => {
    const { drugSafetyResearchTool } = await import("@/lib/data-sources/research/drug-safety");
    expect(drugSafetyResearchTool.layer).toBe(3);
    expect(drugSafetyResearchTool.name).toBe("research_drug_safety");
    expect(drugSafetyResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { drugSafetyResearchTool } = await import("@/lib/data-sources/research/drug-safety");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await drugSafetyResearchTool.handler(
      { query: "adalimumab" },
      cache,
    );
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

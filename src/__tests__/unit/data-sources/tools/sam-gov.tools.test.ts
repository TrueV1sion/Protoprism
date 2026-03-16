// src/__tests__/unit/data-sources/tools/sam-gov.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/sam-gov", () => ({
  samGovClient: {
    searchOpportunities: vi.fn(async () => ({
      data: {
        total: 150,
        count: 2,
        offset: 0,
        limit: 10,
        hasMore: true,
        nextOffset: 2,
        results: [
          { title: "IT Modernization Services", fullParentPathName: "Department of Defense", type: "Solicitation", postedDate: "2024-01-15T00:00:00Z", responseDeadLine: "2024-02-15T00:00:00Z" },
          { title: "Healthcare Data Analytics", fullParentPathName: "HHS/CMS", type: "Presolicitation", postedDate: "2024-01-20T00:00:00Z", archiveDate: "2024-03-20T00:00:00Z" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
    searchEntities: vi.fn(async () => ({
      data: {
        total: 5,
        count: 2,
        offset: 0,
        limit: 10,
        hasMore: false,
        nextOffset: null,
        results: [
          { entityRegistration: { legalBusinessName: "Acme Corp", ueiSAM: "ACME123456789", cageCode: "1A2B3", registrationStatus: "Active", physicalAddress: { stateOrProvinceCode: "VA" } } },
          { entityRegistration: { legalBusinessName: "MedTech Solutions", ueiSAM: "MEDT987654321", cageCode: "9Z8Y7", registrationStatus: "Active", physicalAddress: { stateOrProvinceCode: "MD" } } },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SAM.gov" },
    })),
    hasApiKey: vi.fn(() => true),
  },
}));

describe("SAM.gov granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_sam_opportunities returns markdown table, not JSON", async () => {
    const { samGovTools } = await import("@/lib/data-sources/tools/sam-gov.tools");
    const tool = samGovTools.find((t) => t.name === "search_sam_opportunities");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ q: "IT modernization" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("IT Modernization");
    expect(result.content).not.toContain('"responseDeadLine"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("SAM");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_sam_opportunities shows total and truncation", async () => {
    const { samGovTools } = await import("@/lib/data-sources/tools/sam-gov.tools");
    const tool = samGovTools.find((t) => t.name === "search_sam_opportunities");

    const result = await tool!.handler({ naics: "541511" }, cache);
    expect(result.content).toContain("150");
    expect(result.truncated).toBe(true);
  });

  it("search_sam_entities returns entity table", async () => {
    const { samGovTools } = await import("@/lib/data-sources/tools/sam-gov.tools");
    const tool = samGovTools.find((t) => t.name === "search_sam_entities");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ legal_business_name: "Acme" }, cache);
    expect(result.content).toContain("Entities");
    expect(result.content).toContain("Acme Corp");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes sam-gov", async () => {
    const { samGovTools } = await import("@/lib/data-sources/tools/sam-gov.tools");
    for (const tool of samGovTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("sam-gov");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { samGovTools } = await import("@/lib/data-sources/tools/sam-gov.tools");
    expect(samGovTools).toHaveLength(2);
  });
});

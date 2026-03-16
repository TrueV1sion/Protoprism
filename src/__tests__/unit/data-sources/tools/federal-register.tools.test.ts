// src/__tests__/unit/data-sources/tools/federal-register.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/federal-register", () => ({
  federalRegisterClient: {
    searchDocuments: vi.fn(async () => ({
      data: {
        results: [
          {
            document_number: "2024-01234",
            title: "Medicare Coverage of Telehealth Services",
            type: "RULE",
            abstract: "This rule expands coverage of telehealth services under Medicare.",
            publication_date: "2024-03-15",
            agencies: [{ name: "Centers for Medicare & Medicaid Services", id: 1, raw_name: "CMS", url: "", json_url: "", parent_id: null, slug: "centers-for-medicare-medicaid-services" }],
            html_url: "https://www.federalregister.gov/documents/2024/03/15/2024-01234/",
            pdf_url: "https://www.govinfo.gov/content/pkg/FR-2024-03-15/pdf/2024-01234.pdf",
          },
        ],
        total: 1,
        hasMore: false,
        totalPages: 1,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Federal Register" },
    })),
    getDocument: vi.fn(async () => ({
      data: {
        document_number: "2024-01234",
        title: "Medicare Coverage of Telehealth Services",
        type: "RULE",
        subtype: null,
        abstract: "This rule expands Medicare telehealth coverage.",
        action: "Final Rule",
        publication_date: "2024-03-15",
        effective_on: "2024-04-15",
        comments_close_on: null,
        agencies: [{ name: "Centers for Medicare & Medicaid Services", id: 1, raw_name: "CMS", url: "", json_url: "", parent_id: null, slug: "centers-for-medicare-medicaid-services" }],
        html_url: "https://www.federalregister.gov/documents/2024/03/15/2024-01234/",
        pdf_url: "https://www.govinfo.gov/content/pkg/FR-2024-03-15/pdf/2024-01234.pdf",
        cfr_references: [{ title: 42, part: 410 }],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Federal Register" },
    })),
  },
}));

describe("Federal Register granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_federal_register returns markdown table, not JSON", async () => {
    const { federalRegisterTools } = await import("@/lib/data-sources/tools/federal-register.tools");
    const tool = federalRegisterTools.find((t) => t.name === "search_federal_register");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "telehealth Medicare" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("2024-01234");
    expect(result.content).toContain("RULE");
    expect(result.content).not.toContain('"document_number"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Federal Register");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_federal_register_document returns document details", async () => {
    const { federalRegisterTools } = await import("@/lib/data-sources/tools/federal-register.tools");
    const tool = federalRegisterTools.find((t) => t.name === "get_federal_register_document");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ document_number: "2024-01234" }, cache);
    expect(result.content).toContain("Medicare Coverage of Telehealth Services");
    expect(result.content).toContain("2024-01234");
    expect(result.content).toContain("Final Rule");
    expect(result.content).toContain("CFR");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("get_federal_register_document handles 404", async () => {
    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    vi.mocked(federalRegisterClient.getDocument).mockResolvedValueOnce({
      data: null,
      status: 404,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Federal Register" },
    });

    const { federalRegisterTools } = await import("@/lib/data-sources/tools/federal-register.tools");
    const tool = federalRegisterTools.find((t) => t.name === "get_federal_register_document");

    const result = await tool!.handler({ document_number: "9999-99999" }, cache);
    expect(result.content).toContain("not found");
    expect(result.confidence).toBe("LOW");
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { federalRegisterTools } = await import("@/lib/data-sources/tools/federal-register.tools");
    for (const tool of federalRegisterTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("federal-register");
    }
  });

  it("exports 2 tools", async () => {
    const { federalRegisterTools } = await import("@/lib/data-sources/tools/federal-register.tools");
    expect(federalRegisterTools).toHaveLength(2);
  });
});

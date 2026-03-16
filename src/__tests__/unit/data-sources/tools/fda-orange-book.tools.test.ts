// src/__tests__/unit/data-sources/tools/fda-orange-book.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/fda-orange-book", () => ({
  fdaOrangeBookClient: {
    searchProducts: vi.fn(async () => ({
      data: {
        results: [
          {
            application_number: "NDA050710",
            sponsor_name: "AbbVie",
            openfda: {
              brand_name: ["HUMIRA"],
              generic_name: ["ADALIMUMAB"],
              application_number: ["NDA050710"],
            },
            products: [
              { product_number: "001", dosage_form: "SOLUTION", route: "SUBCUTANEOUS", marketing_status: "Prescription", te_code: "—" },
            ],
            submissions: [{ submission_type: "ORIG", submission_number: "1", submission_status: "AP" }],
          },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", dataThrough: "2025-01-01", source: "FDA Orange Book (openFDA drugsfda)" },
    })),
  },
}));

describe("FDA Orange Book granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_orange_book returns markdown table, not JSON", async () => {
    const { fdaOrangeBookTools } = await import("@/lib/data-sources/tools/fda-orange-book.tools");
    const tool = fdaOrangeBookTools.find((t) => t.name === "search_orange_book");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ brand_name: "Humira" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("HUMIRA");
    expect(result.content).not.toContain('"application_number"'); // no raw JSON object keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Orange Book");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_orange_book includes NDA application number", async () => {
    const { fdaOrangeBookTools } = await import("@/lib/data-sources/tools/fda-orange-book.tools");
    const tool = fdaOrangeBookTools.find((t) => t.name === "search_orange_book");

    const result = await tool!.handler({ generic_name: "adalimumab" }, cache);
    expect(result.content).toContain("NDA050710");
  });

  it("get_orange_book_patents returns product details", async () => {
    const { fdaOrangeBookTools } = await import("@/lib/data-sources/tools/fda-orange-book.tools");
    const tool = fdaOrangeBookTools.find((t) => t.name === "get_orange_book_patents");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ drug_name: "Humira" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Humira");
    expect(result.content).toContain("AbbVie");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes fda-orange-book", async () => {
    const { fdaOrangeBookTools } = await import("@/lib/data-sources/tools/fda-orange-book.tools");
    for (const tool of fdaOrangeBookTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("fda-orange-book");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { fdaOrangeBookTools } = await import("@/lib/data-sources/tools/fda-orange-book.tools");
    expect(fdaOrangeBookTools).toHaveLength(2);
  });
});

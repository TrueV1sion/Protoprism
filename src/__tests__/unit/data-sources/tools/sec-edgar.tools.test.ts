// src/__tests__/unit/data-sources/tools/sec-edgar.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/sec-edgar", () => ({
  secEdgarClient: {
    searchFilings: vi.fn(async () => ({
      data: {
        results: [
          {
            company: "Apple Inc",
            cik: "0000320193",
            form_type: "10-K",
            filed_date: "2024-11-01",
            accession_number: "0000320193-24-000123",
            file_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/",
            description: "Annual Report",
          },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SEC EDGAR EFTS" },
    })),
    getCompanyFacts: vi.fn(async () => ({
      data: {
        company_name: "Apple Inc",
        cik: "0000320193",
        facts: [
          {
            namespace: "us-gaap",
            fact_name: "Revenues",
            label: "Revenues",
            description: "Amount of revenue recognized from goods sold",
            units: { USD: [{ value: 394328000000, end_date: "2024-09-30", filed_date: "2024-11-01", form: "10-K", fiscal_year: 2024, fiscal_period: "FY", accession_number: "0000320193-24-000123" }] },
          },
        ],
        total_facts: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SEC EDGAR XBRL" },
    })),
    searchCompany: vi.fn(async () => ({
      data: {
        results: [
          { company_name: "Apple Inc", cik: "0000320193", ticker: "AAPL" },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "SEC EDGAR Tickers" },
    })),
  },
}));

describe("SEC EDGAR granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_sec_filings returns markdown table, not JSON", async () => {
    const { secEdgarTools } = await import("@/lib/data-sources/tools/sec-edgar.tools");
    const tool = secEdgarTools.find((t) => t.name === "search_sec_filings");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "annual report healthcare" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Apple Inc");
    expect(result.content).toContain("10-K");
    expect(result.content).not.toContain('"cik"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("SEC EDGAR");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_company_facts returns facts table", async () => {
    const { secEdgarTools } = await import("@/lib/data-sources/tools/sec-edgar.tools");
    const tool = secEdgarTools.find((t) => t.name === "get_company_facts");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ cik: "0000320193" }, cache);
    expect(result.content).toContain("XBRL Facts");
    expect(result.content).toContain("Revenues");
    expect(result.content).toContain("us-gaap");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("search_sec_companies returns company table", async () => {
    const { secEdgarTools } = await import("@/lib/data-sources/tools/sec-edgar.tools");
    const tool = secEdgarTools.find((t) => t.name === "search_sec_companies");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "Apple" }, cache);
    expect(result.content).toContain("Company Search");
    expect(result.content).toContain("AAPL");
    expect(result.content).toContain("0000320193");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { secEdgarTools } = await import("@/lib/data-sources/tools/sec-edgar.tools");
    for (const tool of secEdgarTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("sec-edgar");
    }
  });

  it("exports 3 tools", async () => {
    const { secEdgarTools } = await import("@/lib/data-sources/tools/sec-edgar.tools");
    expect(secEdgarTools).toHaveLength(3);
  });
});

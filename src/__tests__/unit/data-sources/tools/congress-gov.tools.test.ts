// src/__tests__/unit/data-sources/tools/congress-gov.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/congress-gov", () => ({
  congressGovClient: {
    searchBills: vi.fn(async () => ({
      data: {
        data: {
          bills: [
            {
              number: "1234",
              type: "HR",
              title: "Medicare for All Act of 2023",
              congress: 118,
              originChamber: "House",
              latestAction: { text: "Referred to Committee on Ways and Means", actionDate: "2023-02-15" },
              updateDate: "2024-01-10",
            },
          ],
          pagination: { count: 1 },
        },
        pagination: { count: 1, next: undefined },
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congress.gov" },
    })),
    getBill: vi.fn(async () => ({
      data: {
        data: {
          bill: {
            number: "1234",
            type: "HR",
            title: "Medicare for All Act of 2023",
            congress: 118,
            originChamber: "House",
            introducedDate: "2023-01-09",
            sponsors: [{ firstName: "John", lastName: "Doe", party: "D", state: "CA" }],
            latestAction: { text: "Referred to Subcommittee", actionDate: "2023-03-01" },
            summary: { text: "This bill would establish a national health insurance program." },
          },
        },
        pagination: undefined,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congress.gov" },
    })),
  },
}));

describe("Congress.gov granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_congress_bills returns markdown table, not JSON", async () => {
    const { congressGovTools } = await import("@/lib/data-sources/tools/congress-gov.tools");
    const tool = congressGovTools.find((t) => t.name === "search_congress_bills");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "Medicare healthcare" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("Medicare for All");
    expect(result.content).not.toContain('"number"'); // No raw JSON keys
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("Congress.gov");
    expect(result.confidence).toBe("HIGH");
  });

  it("get_congress_bill returns bill details", async () => {
    const { congressGovTools } = await import("@/lib/data-sources/tools/congress-gov.tools");
    const tool = congressGovTools.find((t) => t.name === "get_congress_bill");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ congress: 118, bill_type: "hr", bill_number: 1234 }, cache);
    expect(result.content).toContain("Medicare for All Act");
    expect(result.content).toContain("John Doe");
    expect(result.content).toContain("national health insurance");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("get_congress_bill handles 404", async () => {
    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    vi.mocked(congressGovClient.getBill).mockResolvedValueOnce({
      data: { data: null, hasMore: false },
      status: 404,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "Congress.gov" },
    });

    const { congressGovTools } = await import("@/lib/data-sources/tools/congress-gov.tools");
    const tool = congressGovTools.find((t) => t.name === "get_congress_bill");

    const result = await tool!.handler({ congress: 999, bill_type: "hr", bill_number: 9999 }, cache);
    expect(result.content).toContain("not found");
    expect(result.confidence).toBe("LOW");
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { congressGovTools } = await import("@/lib/data-sources/tools/congress-gov.tools");
    for (const tool of congressGovTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("congress-gov");
    }
  });

  it("exports 2 tools", async () => {
    const { congressGovTools } = await import("@/lib/data-sources/tools/congress-gov.tools");
    expect(congressGovTools).toHaveLength(2);
  });
});

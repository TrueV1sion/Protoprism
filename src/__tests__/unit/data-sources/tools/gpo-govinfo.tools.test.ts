// src/__tests__/unit/data-sources/tools/gpo-govinfo.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

vi.mock("@/lib/data-sources/clients/gpo-govinfo", () => ({
  gpoGovinfoClient: {
    search: vi.fn(async () => ({
      data: {
        count: 2,
        totalCount: 42,
        packages: [
          { packageId: "BILLS-118hr1-ih", title: "To amend the Internal Revenue Code", collectionCode: "BILLS", dateIssued: "2024-01-15" },
          { packageId: "FR-2024-00123", title: "Federal Register Notice on Healthcare", collectionCode: "FR", dateIssued: "2024-02-01" },
        ],
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "GPO GovInfo" },
    })),
    getPackageSummary: vi.fn(async () => ({
      data: {
        packageId: "BILLS-118hr1-ih",
        title: "To amend the Internal Revenue Code of 1986",
        collectionCode: "BILLS",
        dateIssued: "2024-01-15",
        lastModified: "2024-01-20",
        details: { granules: { count: 1 } },
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "GPO GovInfo" },
    })),
    getPackage: vi.fn(async () => ({
      data: {
        packageId: "BILLS-118hr1-ih",
        title: "To amend the Internal Revenue Code",
        collectionCode: "BILLS",
        details: {},
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "GPO GovInfo" },
    })),
    hasApiKey: vi.fn(() => true),
  },
}));

describe("GPO GovInfo granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_govinfo returns markdown table with document results", async () => {
    const { gpoGovinfoTools } = await import("@/lib/data-sources/tools/gpo-govinfo.tools");
    const tool = gpoGovinfoTools.find((t) => t.name === "search_govinfo");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "healthcare reform" }, cache);
    expect(result.content).toContain("##");
    expect(result.content).toContain("GovInfo");
    expect(result.content).not.toContain('"packageId"'); // no raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("GovInfo");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_govinfo shows total count in output", async () => {
    const { gpoGovinfoTools } = await import("@/lib/data-sources/tools/gpo-govinfo.tools");
    const tool = gpoGovinfoTools.find((t) => t.name === "search_govinfo");

    const result = await tool!.handler({ query: "budget", collections: "BILLS" }, cache);
    expect(result.content).toContain("42"); // totalCount
    expect(result.truncated).toBe(true);
  });

  it("get_govinfo_document returns document metadata", async () => {
    const { gpoGovinfoTools } = await import("@/lib/data-sources/tools/gpo-govinfo.tools");
    const tool = gpoGovinfoTools.find((t) => t.name === "get_govinfo_document");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ package_id: "BILLS-118hr1-ih" }, cache);
    expect(result.content).toContain("BILLS-118hr1-ih");
    expect(result.content).toContain("Internal Revenue Code");
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe("HIGH");
  });

  it("all tools have layer=2 and sources includes govinfo", async () => {
    const { gpoGovinfoTools } = await import("@/lib/data-sources/tools/gpo-govinfo.tools");
    for (const tool of gpoGovinfoTools) {
      expect(tool.layer).toBe(2);
      expect(tool.sources).toContain("govinfo");
      expect(tool.name).not.toContain("__");
    }
  });

  it("exports 2 tools", async () => {
    const { gpoGovinfoTools } = await import("@/lib/data-sources/tools/gpo-govinfo.tools");
    expect(gpoGovinfoTools).toHaveLength(2);
  });
});

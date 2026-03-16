// src/__tests__/unit/data-sources/research/coverage-policy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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
              { document_id: "NCD-1", title: "National Coverage for Diabetes Test Devices", status: "Covered" },
              { document_id: "NCD-2", title: "Coverage of Insulin Pumps", status: "Covered with conditions" },
            ],
          }),
        };
      }
      if (server === "icd10") {
        return {
          available: true,
          server: "icd10",
          toolName,
          data: JSON.stringify({
            codes: [
              { code: "E11", description: "Type 2 diabetes mellitus" },
              { code: "E11.65", description: "Type 2 diabetes mellitus with hyperglycemia" },
              { code: "Z79.4", description: "Long-term (current) use of insulin" },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_coverage_policy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { coveragePolicyResearchTool } = await import("@/lib/data-sources/research/coverage-policy");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await coveragePolicyResearchTool.handler({ query: "diabetes" }, cache);

    expect(result.content).toContain("## Coverage Policy: diabetes");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { coveragePolicyResearchTool } = await import("@/lib/data-sources/research/coverage-policy");
    expect(coveragePolicyResearchTool.layer).toBe(3);
    expect(coveragePolicyResearchTool.name).toBe("research_coverage_policy");
    expect(coveragePolicyResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { coveragePolicyResearchTool } = await import("@/lib/data-sources/research/coverage-policy");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await coveragePolicyResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("degrades gracefully when CMS is unavailable", async () => {
    const { mcpBridge } = await import("@/lib/data-sources/mcp-bridge");
    (mcpBridge.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      server: "cms_coverage",
      toolName: "search_national_coverage",
      error: "server down",
    });

    const { coveragePolicyResearchTool } = await import("@/lib/data-sources/research/coverage-policy");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await coveragePolicyResearchTool.handler({ query: "test" }, cache);

    expect(result.content).toContain("⚠️");
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

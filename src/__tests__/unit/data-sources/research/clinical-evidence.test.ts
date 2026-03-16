// src/__tests__/unit/data-sources/research/clinical-evidence.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock McpBridge
vi.mock("@/lib/data-sources/mcp-bridge", () => ({
  mcpBridge: {
    call: vi.fn(async (server: string, toolName: string) => {
      if (server === "pubmed") {
        return {
          available: true,
          server: "pubmed",
          toolName,
          data: JSON.stringify({
            articles: [
              { title: "Test Article on Drug Safety", pmid: "12345" },
              { title: "Clinical Trial Results for Test Drug", pmid: "67890" },
            ],
          }),
        };
      }
      if (server === "clinical_trials") {
        return {
          available: true,
          server: "clinical_trials",
          toolName,
          data: JSON.stringify({
            trials: [
              { nctId: "NCT00000001", title: "Test Drug Phase 3 Trial", phase: "PHASE3", status: "RECRUITING" },
              { nctId: "NCT00000002", title: "Test Drug Phase 2 Trial", phase: "PHASE2", status: "ACTIVE_NOT_RECRUITING" },
            ],
          }),
        };
      }
      if (server === "biorxiv") {
        return {
          available: true,
          server: "biorxiv",
          toolName,
          data: JSON.stringify({
            preprints: [
              { title: "Novel mechanism of test drug", doi: "10.1101/2026.01.01.123456" },
            ],
          }),
        };
      }
      return { available: false, server, toolName, error: "not mocked" };
    }),
  },
}));

describe("research_clinical_evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an intelligence packet with Key Intelligence section", async () => {
    const { clinicalEvidenceResearchTool } = await import("@/lib/data-sources/research/clinical-evidence");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await clinicalEvidenceResearchTool.handler({ query: "test drug" }, cache);

    expect(result.content).toContain("## Clinical Evidence: test drug");
    expect(result.content).toContain("### Key Intelligence");
    expect(result.content).toContain("### Citations");
    expect(result.confidence).toBeDefined();
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });

  it("has layer=3 and correct name", async () => {
    const { clinicalEvidenceResearchTool } = await import("@/lib/data-sources/research/clinical-evidence");
    expect(clinicalEvidenceResearchTool.layer).toBe(3);
    expect(clinicalEvidenceResearchTool.name).toBe("research_clinical_evidence");
    expect(clinicalEvidenceResearchTool.name).not.toContain("__");
  });

  it("content is under 6000 character budget", async () => {
    const { clinicalEvidenceResearchTool } = await import("@/lib/data-sources/research/clinical-evidence");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await clinicalEvidenceResearchTool.handler({ query: "test" }, cache);
    expect(result.content.length).toBeLessThanOrEqual(6000);
  });

  it("degrades gracefully when MCP servers are unavailable", async () => {
    const { mcpBridge } = await import("@/lib/data-sources/mcp-bridge");
    (mcpBridge.call as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      server: "pubmed",
      toolName: "search_articles",
      error: "server down",
    });

    const { clinicalEvidenceResearchTool } = await import("@/lib/data-sources/research/clinical-evidence");
    const { ResultCache } = await import("@/lib/data-sources/cache");
    const cache = new ResultCache();
    const result = await clinicalEvidenceResearchTool.handler({ query: "test" }, cache);

    expect(result.content).toContain("⚠️");
    expect(result.confidence).toBe("LOW");
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

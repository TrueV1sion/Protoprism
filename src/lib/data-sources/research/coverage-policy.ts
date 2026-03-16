// src/lib/data-sources/research/coverage-policy.ts
/**
 * research_coverage_policy — Layer 3 Intelligence Tool
 *
 * Aggregates Medicare national coverage determinations (CMS) and
 * relevant ICD-10 diagnostic codes into a single coverage intelligence packet.
 * All API calls are made via McpBridge to Anthropic MCP servers.
 */

import type { DataSourceTool, ToolResult, ToolCache, McpBridgeResult } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { mcpBridge } from "../mcp-bridge";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const coveragePolicyResearchTool: DataSourceTool = {
  name: "research_coverage_policy",
  description:
    "Coverage policy intelligence: Medicare national coverage determinations and relevant diagnostic codes.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Treatment or condition name" },
      timeframe: { type: "string", description: "How far back to search: '1y', '3y', '5y' (default '3y')" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["cms_coverage", "icd10"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;

    // ─── Parallel MCP calls ────────────────────────────────────
    const [cmsResult, icd10Result] = await Promise.all([
      mcpBridge
        .call("cms_coverage", "search_national_coverage", { keyword: query, limit: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "cms_coverage", toolName: "search_national_coverage", error: "call failed" })),
      mcpBridge
        .call("icd10", "search_codes", { query, limit: 10 })
        .catch((): McpBridgeResult => ({ available: false, server: "icd10", toolName: "search_codes", error: "call failed" })),
    ]);

    // ─── Parse MCP results ─────────────────────────────────────
    let ncdCount = 0;
    let ncds: Array<{ id?: string; title?: string; status?: string }> = [];
    if (cmsResult.available && cmsResult.data) {
      try {
        const parsed = JSON.parse(cmsResult.data) as Record<string, unknown>;
        const results = (parsed.results ?? parsed.ncds ?? parsed.documents ?? []) as Record<string, unknown>[];
        ncdCount = Array.isArray(results) ? results.length : 0;
        ncds = results.slice(0, 5).map((r) => ({
          id: String(r.document_id ?? r.id ?? ""),
          title: String(r.title ?? "Untitled").slice(0, 80),
          status: String(r.status ?? r.coverage_status ?? "—"),
        }));
      } catch {
        ncdCount = 0;
      }
    }

    let icd10Count = 0;
    let icd10Codes: Array<{ code?: string; description?: string }> = [];
    if (icd10Result.available && icd10Result.data) {
      try {
        const parsed = JSON.parse(icd10Result.data) as Record<string, unknown>;
        const results = (parsed.codes ?? parsed.results ?? []) as Record<string, unknown>[];
        icd10Count = Array.isArray(results) ? results.length : 0;
        icd10Codes = results.slice(0, 8).map((r) => ({
          code: String(r.code ?? r.Code ?? ""),
          description: String(r.description ?? r.Description ?? r.long_description ?? "").slice(0, 70),
        }));
      } catch {
        icd10Count = 0;
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (cmsResult.available) sourcesReturned++;
    if (icd10Result.available) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 2 ? "HIGH" : sourcesReturned >= 1 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Coverage Policy",
      subject: query,
      confidence,
      sourcesQueried: 2,
      sourcesReturned,
      vintage: new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (cmsResult.available) {
      bullets.push(`- **${formatNumber(ncdCount)}** Medicare National Coverage Determinations found`);
    } else {
      bullets.push(`- ⚠️ Coverage data currently unavailable`);
    }
    if (icd10Result.available) {
      bullets.push(`- **${formatNumber(icd10Count)}** relevant ICD-10 codes identified`);
    } else {
      bullets.push(`- ⚠️ ICD-10 code data unavailable`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // NCD table
    if (ncds.length > 0) {
      const rows = ncds.map((n) => [
        n.id ?? "—",
        n.title ?? "—",
        n.status ?? "—",
      ]);
      sections.push(`### National Coverage Determinations\n${markdownTable(["ID", "Title", "Status"], rows, 5, ncdCount)}`);
    }

    // ICD-10 codes table
    if (icd10Codes.length > 0) {
      const rows = icd10Codes.map((c) => [
        c.code ?? "—",
        c.description ?? "—",
      ]);
      sections.push(`### Relevant ICD-10 Codes\n${markdownTable(["Code", "Description"], rows, 8, icd10Count)}`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[CMS-${ts}]`,
        source: "CMS Medicare National Coverage Determinations",
        query,
        resultCount: ncdCount,
      },
      {
        id: `[ICD10-${ts}]`,
        source: "ICD-10-CM Code Database",
        query,
        resultCount: icd10Count,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: {
        queriedAt: new Date().toISOString(),
        source: "CMS Coverage / ICD-10",
      },
      confidence,
      truncated,
    };
  },
};

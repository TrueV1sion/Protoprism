// src/lib/data-sources/research/quality-benchmarks.ts
/**
 * research_quality_benchmarks — Layer 3 Intelligence Tool
 *
 * Aggregates AHRQ HCUP quality metrics, CMS coverage policies, and
 * WHO Global Health Observatory indicators into a single quality benchmarks packet.
 * Uses 2 in-process clients + 1 McpBridge call.
 */

import type { DataSourceTool, ToolResult, ToolCache, McpBridgeResult } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { mcpBridge } from "../mcp-bridge";
import { ahrqHcupClient } from "../clients/ahrq-hcup";
import { whoGhoClient } from "../clients/who-gho";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const qualityBenchmarksResearchTool: DataSourceTool = {
  name: "research_quality_benchmarks",
  description:
    "Quality benchmarks intelligence: healthcare quality metrics, coverage policies, and international comparisons.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Condition or quality measure" },
      timeframe: { type: "string", description: "Optional timeframe context" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["ahrq-hcup", "cms_coverage", "who-gho"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;

    // ─── Parallel API calls ────────────────────────────────────
    const [ahrqResult, whoResult, cmsResult] = await Promise.all([
      ahrqHcupClient.searchAll({ query, limit: 5 }).catch(() => null),
      whoGhoClient.listIndicators({ keyword: query, limit: 5 }).catch(() => null),
      mcpBridge
        .call("cms_coverage", "search_national_coverage", { keyword: query, limit: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "cms_coverage", toolName: "search_national_coverage", error: "call failed" })),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const ahrqTotal = ahrqResult?.data.total ?? 0;
    const ahrqResults = ahrqResult?.data.results ?? [];

    const whoTotal = whoResult?.data.count ?? 0;
    const whoIndicators = whoResult?.data.results ?? [];

    let cmsCount = 0;
    let cmsPolicies: Array<{ id?: string; title?: string }> = [];
    if (cmsResult.available && cmsResult.data) {
      try {
        const parsed = JSON.parse(cmsResult.data) as Record<string, unknown>;
        const results = (parsed.results ?? parsed.ncds ?? parsed.documents ?? []) as Record<string, unknown>[];
        cmsCount = Array.isArray(results) ? results.length : 0;
        cmsPolicies = results.slice(0, 5).map((r) => ({
          id: String(r.document_id ?? r.id ?? ""),
          title: String(r.title ?? "Untitled").slice(0, 80),
        }));
      } catch {
        cmsCount = 0;
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (ahrqTotal > 0 || ahrqResults.length > 0) sourcesReturned++;
    if (whoTotal > 0 || whoIndicators.length > 0) sourcesReturned++;
    if (cmsResult.available) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Quality Benchmarks",
      subject: query,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: ahrqResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (ahrqTotal > 0 || ahrqResults.length > 0) {
      bullets.push(`- **${formatNumber(ahrqTotal || ahrqResults.length)}** AHRQ HCUP quality metrics matched`);
    } else {
      bullets.push(`- No AHRQ HCUP data matched for "${query}"`);
    }
    if (cmsResult.available) {
      bullets.push(`- **${formatNumber(cmsCount)}** CMS coverage policies found`);
    } else {
      bullets.push(`- ⚠️ CMS coverage data unavailable`);
    }
    if (whoTotal > 0 || whoIndicators.length > 0) {
      bullets.push(`- **${formatNumber(whoTotal || whoIndicators.length)}** WHO GHO health indicators found`);
    } else {
      bullets.push(`- No WHO GHO indicators matched for "${query}"`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // AHRQ metrics table
    if (ahrqResults.length > 0) {
      const rows = ahrqResults.slice(0, 5).map((r) => {
        const data = r.data as Record<string, unknown>;
        return [
          String(data.name ?? "—").slice(0, 40),
          r.result_type ?? "—",
          data.annual_discharges ? formatNumber(Number(data.annual_discharges)) : "—",
          data.mean_cost ? `$${formatNumber(Number(data.mean_cost))}` : "—",
        ];
      });
      sections.push(`### AHRQ Quality Metrics\n${markdownTable(["Condition", "Type", "Annual Discharges", "Mean Cost"], rows, 5, ahrqTotal)}`);
    }

    // WHO indicators
    if (whoIndicators.length > 0) {
      const rows = whoIndicators.slice(0, 5).map((ind) => [
        String(ind.IndicatorCode ?? "—"),
        String(ind.IndicatorName ?? "—").slice(0, 70),
      ]);
      sections.push(`### WHO Health Indicators\n${markdownTable(["Code", "Indicator"], rows, 5, whoTotal)}`);
    }

    // CMS policies
    if (cmsPolicies.length > 0) {
      const rows = cmsPolicies.map((p) => [p.id ?? "—", p.title ?? "—"]);
      sections.push(`### CMS Coverage Policies\n${markdownTable(["ID", "Title"], rows, 5, cmsCount)}`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[AHRQ-${ts}]`,
        source: "AHRQ HCUP",
        query,
        resultCount: ahrqTotal || ahrqResults.length,
      },
      {
        id: `[CMS-${ts}]`,
        source: "CMS National Coverage Determinations",
        query,
        resultCount: cmsCount,
      },
      {
        id: `[WHO-${ts}]`,
        source: "WHO Global Health Observatory",
        query,
        resultCount: whoTotal || whoIndicators.length,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: ahrqResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "AHRQ HCUP / CMS / WHO GHO" },
      confidence,
      truncated,
    };
  },
};

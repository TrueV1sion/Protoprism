// src/lib/data-sources/research/competitive-intel.ts
/**
 * research_competitive_intel — Layer 3 Intelligence Tool
 *
 * Aggregates SEC filings, USPTO patent activity, FDA drug labels, and
 * clinical trial pipeline data into a single competitive intelligence packet.
 * Uses 3 in-process clients + 1 McpBridge call.
 */

import type { DataSourceTool, ToolResult, ToolCache, McpBridgeResult } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { mcpBridge } from "../mcp-bridge";
import { secEdgarClient } from "../clients/sec-edgar";
import { usptoPatentsClient } from "../clients/uspto-patents";
import { openfdaClient } from "../clients/openfda";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const competitiveIntelResearchTool: DataSourceTool = {
  name: "research_competitive_intel",
  description:
    "Competitive intelligence: SEC filings, patent activity, FDA data, and clinical trial pipeline for a company or drug.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Company or drug name" },
      timeframe: { type: "string", description: "How far back to search: '1y', '3y', '5y' (default '3y')" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["sec-edgar", "uspto-patents", "openfda", "clinical_trials"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - yearsBack);
    const dateFromStr = dateFrom.toISOString().slice(0, 10);

    // ─── Parallel API calls ────────────────────────────────────
    const [edgarResult, patentsResult, fdaResult, trialsResult] = await Promise.all([
      secEdgarClient.searchFilings({ query, limit: 5, dateFrom: dateFromStr }).catch(() => null),
      usptoPatentsClient.searchPatents({ query, limit: 5 }).catch(() => null),
      openfdaClient.searchDrugLabels({ brandName: query, limit: 3 }).catch(() => null),
      mcpBridge
        .call("clinical_trials", "search_trials", { condition: query, page_size: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "clinical_trials", toolName: "search_trials", error: "call failed" })),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const totalFilings = edgarResult?.data.total ?? 0;
    const recentFilings = edgarResult?.data.results ?? [];

    const totalPatents = patentsResult?.data.total ?? 0;
    const patents = patentsResult?.data.patents ?? [];

    const fdaTotal = fdaResult?.data.total ?? 0;
    const fdaLabels = fdaResult?.data.results ?? [];

    let trialCount = 0;
    let trials: Array<{ nctId?: string; title?: string; phase?: string; status?: string }> = [];
    if (trialsResult.available && trialsResult.data) {
      try {
        const parsed = JSON.parse(trialsResult.data) as Record<string, unknown>;
        const rawTrials = (parsed.trials ?? parsed.studies ?? []) as Record<string, unknown>[];
        trialCount = Array.isArray(rawTrials) ? rawTrials.length : 0;
        trials = rawTrials.slice(0, 5).map((t) => ({
          nctId: String(t.nctId ?? t.nct_id ?? ""),
          title: String(t.title ?? t.briefTitle ?? "").slice(0, 60),
          phase: String(t.phase ?? t.phases ?? ""),
          status: String(t.status ?? t.overallStatus ?? ""),
        }));
      } catch {
        trialCount = 0;
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (totalFilings > 0) sourcesReturned++;
    if (totalPatents > 0) sourcesReturned++;
    if (fdaTotal > 0) sourcesReturned++;
    if (trialsResult.available) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Competitive Intel",
      subject: query,
      confidence,
      sourcesQueried: 4,
      sourcesReturned,
      vintage: edgarResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(totalFilings)}** SEC EDGAR filings found in the last ${yearsBack} years`);
    bullets.push(`- **${formatNumber(totalPatents)}** USPTO patents found`);
    bullets.push(`- **${formatNumber(fdaTotal)}** FDA drug label entries found`);
    if (trialsResult.available) {
      bullets.push(`- **${formatNumber(trialCount)}** clinical trials in pipeline`);
    } else {
      bullets.push(`- ⚠️ ClinicalTrials.gov data unavailable`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Competitive Summary table
    const summaryRows: string[][] = [];
    summaryRows.push(["SEC Filings", formatNumber(totalFilings), "SEC EDGAR EFTS"]);
    summaryRows.push(["Patents", formatNumber(totalPatents), "USPTO PatentsView"]);
    summaryRows.push(["FDA Approvals", formatNumber(fdaTotal), "openFDA"]);
    summaryRows.push(["Clinical Trials", trialsResult.available ? formatNumber(trialCount) : "N/A", "ClinicalTrials.gov"]);
    sections.push(`### Competitive Summary\n${markdownTable(["Category", "Count", "Source"], summaryRows, 4)}`);

    // Recent filings
    if (recentFilings.length > 0) {
      const rows = recentFilings.map((f) => [
        String(f.filed_date ?? "—").slice(0, 10),
        String(f.form_type ?? "—"),
        String(f.description ?? "—").slice(0, 60),
      ]);
      sections.push(`### Recent SEC Filings\n${markdownTable(["Date", "Form", "Description"], rows, 5, totalFilings)}`);
    }

    // Clinical trials
    if (trials.length > 0) {
      const rows = trials.map((t) => [
        t.nctId ?? "—",
        t.title ?? "—",
        t.phase ?? "—",
        t.status ?? "—",
      ]);
      sections.push(`### Trial Pipeline\n${markdownTable(["NCT ID", "Title", "Phase", "Status"], rows, 5, trialCount)}`);
    }

    // FDA labels note
    if (fdaLabels.length > 0) {
      const label = fdaLabels[0] as Record<string, unknown>;
      const brandNames = ((label.openfda as Record<string, unknown>)?.brand_name as string[] | undefined) ?? [];
      if (brandNames.length > 0) {
        bullets.push(`- FDA brand names: ${brandNames.slice(0, 3).join(", ")}`);
      }
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[EDGAR-${ts}]`,
        source: "SEC EDGAR EFTS",
        query,
        resultCount: totalFilings,
      },
      {
        id: `[USPTO-${ts}]`,
        source: "USPTO PatentsView",
        query,
        resultCount: totalPatents,
      },
      {
        id: `[FDA-${ts}]`,
        source: "openFDA Drug Labels",
        query,
        resultCount: fdaTotal,
      },
      {
        id: `[CT-${ts}]`,
        source: "ClinicalTrials.gov",
        query,
        resultCount: trialCount,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: edgarResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "SEC EDGAR" },
      confidence,
      truncated,
    };
  },
};

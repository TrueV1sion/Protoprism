// src/lib/data-sources/research/clinical-evidence.ts
/**
 * research_clinical_evidence — Layer 3 Intelligence Tool
 *
 * Aggregates published research (PubMed), active clinical trials (ClinicalTrials.gov),
 * and recent preprints (bioRxiv) into a single evidence intelligence packet.
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

export const clinicalEvidenceResearchTool: DataSourceTool = {
  name: "research_clinical_evidence",
  description:
    "Clinical evidence intelligence: published research, active clinical trials, and preprints for a drug or condition.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Drug name or medical condition" },
      timeframe: { type: "string", description: "How far back to search: '1y', '3y', '5y' (default '3y')" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["pubmed", "clinical_trials", "biorxiv"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;

    // ─── Parallel MCP calls ────────────────────────────────────
    const [pubmedResult, trialsResult, biorxivResult] = await Promise.all([
      mcpBridge
        .call("pubmed", "search_articles", { query, max_results: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "pubmed", toolName: "search_articles", error: "call failed" })),
      mcpBridge
        .call("clinical_trials", "search_trials", { condition: query, page_size: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "clinical_trials", toolName: "search_trials", error: "call failed" })),
      mcpBridge
        .call("biorxiv", "search_preprints", { category: "pharmacology and toxicology", recent_days: 90, limit: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "biorxiv", toolName: "search_preprints", error: "call failed" })),
    ]);

    // ─── Parse MCP results ─────────────────────────────────────
    let articleCount = 0;
    let articleTitles: string[] = [];
    if (pubmedResult.available && pubmedResult.data) {
      try {
        const parsed = JSON.parse(pubmedResult.data) as Record<string, unknown>;
        const articles = (parsed.articles ?? parsed.esearchresult ?? []) as Record<string, unknown>[];
        articleCount = Array.isArray(articles) ? articles.length : 0;
        articleTitles = articles.slice(0, 3).map((a) => String(a.title ?? a.Title ?? "Untitled")).filter(Boolean);
      } catch {
        articleCount = 0;
      }
    }

    let trialCount = 0;
    let trials: Array<{ nctId?: string; title?: string; phase?: string; status?: string }> = [];
    if (trialsResult.available && trialsResult.data) {
      try {
        const parsed = JSON.parse(trialsResult.data) as Record<string, unknown>;
        const rawTrials = (parsed.trials ?? parsed.studies ?? []) as Record<string, unknown>[];
        trialCount = Array.isArray(rawTrials) ? rawTrials.length : 0;
        trials = rawTrials.slice(0, 5).map((t) => ({
          nctId: String(t.nctId ?? t.nct_id ?? ""),
          title: String(t.title ?? t.briefTitle ?? ""),
          phase: String(t.phase ?? t.phases ?? ""),
          status: String(t.status ?? t.overallStatus ?? ""),
        }));
      } catch {
        trialCount = 0;
      }
    }

    let preprintCount = 0;
    if (biorxivResult.available && biorxivResult.data) {
      try {
        const parsed = JSON.parse(biorxivResult.data) as Record<string, unknown>;
        const preprints = (parsed.preprints ?? parsed.collection ?? []) as unknown[];
        preprintCount = Array.isArray(preprints) ? preprints.length : 0;
      } catch {
        preprintCount = 0;
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (pubmedResult.available) sourcesReturned++;
    if (trialsResult.available) sourcesReturned++;
    if (biorxivResult.available) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Clinical Evidence",
      subject: query,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (pubmedResult.available) {
      bullets.push(`- **${formatNumber(articleCount)}** PubMed articles retrieved`);
    } else {
      bullets.push(`- ⚠️ PubMed data unavailable`);
    }
    if (trialsResult.available) {
      bullets.push(`- **${formatNumber(trialCount)}** clinical trials found on ClinicalTrials.gov`);
    } else {
      bullets.push(`- ⚠️ ClinicalTrials.gov data unavailable`);
    }
    if (biorxivResult.available) {
      bullets.push(`- **${formatNumber(preprintCount)}** recent bioRxiv preprints (pharmacology/toxicology, last 90 days)`);
    } else {
      bullets.push(`- ⚠️ bioRxiv preprint data unavailable`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Clinical trials table
    if (trials.length > 0) {
      const rows = trials.map((t) => [
        t.nctId ?? "—",
        String(t.title ?? "—").slice(0, 60),
        String(t.phase ?? "—"),
        String(t.status ?? "—"),
      ]);
      sections.push(`### Clinical Trials\n${markdownTable(["NCT ID", "Title", "Phase", "Status"], rows, 5, trialCount)}`);
    }

    // Recent articles
    if (articleTitles.length > 0) {
      sections.push(`### Recent PubMed Articles\n${articleTitles.map((t) => `- ${t}`).join("\n")}`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[PUBMED-${ts}]`,
        source: "PubMed",
        query,
        resultCount: articleCount,
      },
      {
        id: `[CT-${ts}]`,
        source: "ClinicalTrials.gov",
        query,
        resultCount: trialCount,
      },
      {
        id: `[BIORXIV-${ts}]`,
        source: "bioRxiv",
        query: "pharmacology and toxicology (recent 90 days)",
        resultCount: preprintCount,
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
        source: "PubMed / ClinicalTrials.gov / bioRxiv",
      },
      confidence,
      truncated,
    };
  },
};

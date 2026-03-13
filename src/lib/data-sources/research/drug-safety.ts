// src/lib/data-sources/research/drug-safety.ts
/**
 * research_drug_safety — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates adverse event data, drug labeling
 * warnings, and optionally patent/exclusivity info into a single
 * intelligence packet. Makes 3-4 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { openfdaClient } from "../clients/openfda";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

// Forward-safe import: Orange Book client may not exist yet during
// vertical slice development. Loaded lazily on first call.
// NOTE: This inline type is temporary — replaced with the real client
// export type once Task 12 implements fda-orange-book.ts.
type OrangeBookClient = {
  searchProducts: (params: Record<string, unknown>) => Promise<{
    data: { results: Record<string, unknown>[]; total: number; hasMore: boolean };
    status: number;
    vintage: { queriedAt: string; source: string };
  }>;
};

let fdaOrangeBookClient: OrangeBookClient | null | undefined = undefined;

async function getOrangeBookClient(): Promise<OrangeBookClient | null> {
  if (fdaOrangeBookClient !== undefined) return fdaOrangeBookClient;
  try {
    const mod = await import("../clients/fda-orange-book");
    fdaOrangeBookClient = mod.fdaOrangeBookClient;
  } catch {
    // fda-orange-book client not yet implemented — graceful degradation
    fdaOrangeBookClient = null;
  }
  return fdaOrangeBookClient;
}

export const drugSafetyResearchTool: DataSourceTool = {
  name: "research_drug_safety",
  description:
    "Comprehensive drug safety intelligence: adverse events, labeling warnings, " +
    "recall history, and patent status. Makes multiple API calls and returns a " +
    "cross-referenced intelligence packet.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Drug name (brand or generic)" },
      timeframe: { type: "string", description: "How far back to search: '1y', '3y', '5y' (default '3y')" },
      focus: { type: "string", description: "Optional focus area: 'reactions', 'recalls', 'labeling'" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["openfda", "fda-orange-book"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const drugName = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    // Calculate date range
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - yearsBack);
    const dateFromStr = dateFrom.toISOString().slice(0, 10).replace(/-/g, "");

    // ─── Parallel API calls ────────────────────────────────────
    const [aeResult, countResult, labelResult, orangeBookResult] = await Promise.all([
      openfdaClient.searchAdverseEvents({
        drugName,
        dateFrom: dateFromStr,
        limit: 5,
      }),
      openfdaClient.countAdverseEvents({
        field: "patient.reaction.reactionmeddrapt",
        drugName,
        dateFrom: dateFromStr,
        limit: 10,
      }),
      openfdaClient.searchDrugLabels({
        brandName: drugName,
        limit: 1,
      }),
      getOrangeBookClient().then((client) =>
        client ? client.searchProducts({ query: drugName, limit: 5 }) : null,
      ),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const totalAEs = aeResult.data.total;
    const seriousCount = aeResult.data.results.filter(
      (r) => (r as Record<string, unknown>).serious === 1,
    ).length;
    const seriousRate = aeResult.data.results.length > 0
      ? Math.round((seriousCount / aeResult.data.results.length) * 100)
      : 0;

    const topReactions = countResult.data.results.slice(0, 5).map((r) => ({
      term: String((r as Record<string, unknown>).term ?? "Unknown"),
      count: (r as Record<string, unknown>).count as number ?? 0,
    }));

    const label = labelResult.data.results[0] as Record<string, unknown> | undefined;
    const hasBoxedWarning = label?.boxed_warning != null;
    const boxedWarningText = hasBoxedWarning
      ? String((label!.boxed_warning as string[])[0] ?? "").slice(0, 200)
      : null;

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    const sourcesQueried = fdaOrangeBookClient ? 4 : 3;
    if (totalAEs > 0) sourcesReturned++;
    if (countResult.data.total > 0) sourcesReturned++;
    if (labelResult.data.total > 0) sourcesReturned++;
    if (orangeBookResult?.data?.total && orangeBookResult.data.total > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    // Header
    sections.push(intelligenceHeader({
      topic: "Drug Safety",
      subject: drugName,
      confidence,
      sourcesQueried,
      sourcesReturned,
      vintage: aeResult.vintage.dataThrough ?? aeResult.vintage.queriedAt.slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(totalAEs)}** adverse event reports in the last ${yearsBack} years`);
    if (seriousRate > 0) bullets.push(`- **${seriousRate}%** of sampled reports are serious`);
    if (hasBoxedWarning) bullets.push(`- ⚠️ **Boxed Warning** on label`);
    if (topReactions.length > 0) {
      bullets.push(`- Top reactions: ${topReactions.slice(0, 3).map((r) => r.term).join(", ")}`);
    }
    if (orangeBookResult?.data?.total === 0) {
      bullets.push(`- No Orange Book entries found (may be off-patent or not an NDA drug)`);
    }
    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Top reactions table
    if (topReactions.length > 0) {
      const reactionRows = topReactions.map((r) => [r.term, formatNumber(r.count)]);
      sections.push(`### Top Adverse Reactions\n${markdownTable(["Reaction", "Count"], reactionRows, 10, topReactions.length)}`);
    }

    // Boxed warning excerpt
    if (boxedWarningText) {
      sections.push(`### Boxed Warning (excerpt)\n> ${boxedWarningText}...`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const citations = [
      { id: `[FDA-AE-${Date.now()}]`, source: "openFDA FAERS", query: drugName, resultCount: totalAEs },
      { id: `[FDA-LABEL-${Date.now()}]`, source: "openFDA Drug Labels", query: drugName, resultCount: labelResult.data.total },
    ];
    if (orangeBookResult) {
      citations.push({
        id: `[OB-${Date.now()}]`,
        source: "FDA Orange Book",
        query: drugName,
        resultCount: orangeBookResult.data.total,
      });
    }

    sections.push(formatCitations(citations));

    // Assemble and truncate
    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: aeResult.vintage,
      confidence,
      truncated,
    };
  },
};

// src/lib/data-sources/research/global-health.ts
/**
 * research_global_health — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates WHO GHO health indicators,
 * OECD international health spending data, and AHRQ HCUP US healthcare
 * quality statistics into a single intelligence packet.
 * Makes 3 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { whoGhoClient } from "../clients/who-gho";
import { oecdHealthClient } from "../clients/oecd-health";
import { ahrqHcupClient } from "../clients/ahrq-hcup";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const globalHealthResearchTool: DataSourceTool = {
  name: "research_global_health",
  description:
    "Global health intelligence: WHO health indicators, international health spending, " +
    "and US healthcare quality data.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Health topic or indicator to research" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["who-gho", "oecd-health", "ahrq-hcup"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const healthTopic = input.query as string;

    // ─── Parallel API calls ────────────────────────────────────
    const [whoResult, oecdResult, ahrqResult] = await Promise.all([
      whoGhoClient.listIndicators({ keyword: healthTopic, limit: 5 }).catch(() => null),
      oecdHealthClient.getHealthExpenditures({ countries: ["USA", "GBR", "DEU", "FRA", "JPN"] }).catch(() => null),
      ahrqHcupClient.searchAll({ query: healthTopic, limit: 5 }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const whoIndicators = whoResult?.data.results ?? [];
    const whoCount = whoResult?.data.count ?? 0;

    const oecdObs = oecdResult?.data.observations ?? [];
    const latestByCountry: Record<string, typeof oecdObs[0]> = {};
    for (const obs of oecdObs) {
      const existing = latestByCountry[obs.countryCode];
      if (!existing || obs.year > existing.year) {
        latestByCountry[obs.countryCode] = obs;
      }
    }
    const usaOecdObs = latestByCountry["USA"];
    const usHealthSpending = usaOecdObs
      ? `${usaOecdObs.value?.toFixed(1)}% GDP (${usaOecdObs.year})`
      : "—";

    const ahrqResults = ahrqResult?.data.results ?? [];
    const ahrqTotal = ahrqResult?.data.total ?? 0;

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (whoCount > 0) sourcesReturned++;
    if (oecdObs.length > 0) sourcesReturned++;
    if (ahrqTotal > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Global Health",
      subject: healthTopic,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: whoResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(whoCount)}** WHO GHO indicator(s) matching "${healthTopic}"`);
    bullets.push(`- US health expenditure (OECD): **${usHealthSpending}**`);
    bullets.push(`- **${formatNumber(ahrqTotal)}** AHRQ HCUP statistic(s) found`);

    if (ahrqResults.length > 0) {
      const topResult = ahrqResults[0];
      const data = topResult.data as Record<string, unknown>;
      const conditionName = String(data.name ?? "—");
      const discharges = data.annual_discharges as number | undefined;
      if (discharges !== undefined) {
        bullets.push(
          `- Top HCUP match: **${conditionName}** — ${formatNumber(discharges)} annual discharges`,
        );
      }
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // WHO Indicators table
    if (whoIndicators.length > 0) {
      const whoRows = whoIndicators.slice(0, 5).map((ind) => [
        String(ind.IndicatorCode ?? "—"),
        String(ind.IndicatorName ?? "—").slice(0, 60),
      ]);
      sections.push(
        `### WHO GHO Indicators\n${markdownTable(
          ["Code", "Indicator Name"],
          whoRows,
          5,
          whoCount,
        )}`,
      );
    }

    // OECD comparison table
    const oecdSorted = Object.values(latestByCountry)
      .filter((o) => o.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 6);

    if (oecdSorted.length > 0) {
      const oecdRows = oecdSorted.map((o) => [
        o.country,
        `${o.value?.toFixed(1) ?? "—"}%`,
        String(o.year),
      ]);
      sections.push(
        `### Health Expenditure Comparison (OECD)\n${markdownTable(
          ["Country", "% GDP", "Year"],
          oecdRows,
          6,
          oecdSorted.length,
        )}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[WHO-${ts}]`,
        source: "WHO Global Health Observatory",
        query: healthTopic,
        resultCount: whoCount,
      },
      {
        id: `[OECD-${ts}]`,
        source: "OECD Health Statistics",
        query: "Health Expenditure % GDP",
        resultCount: oecdObs.length,
      },
      {
        id: `[AHRQ-${ts}]`,
        source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)",
        query: healthTopic,
        resultCount: ahrqTotal,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: whoResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "WHO Global Health Observatory" },
      confidence,
      truncated,
    };
  },
};

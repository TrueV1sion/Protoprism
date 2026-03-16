// src/lib/data-sources/research/market-dynamics.ts
/**
 * research_market_dynamics — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates healthcare economic indicators from
 * BLS (Medical Care CPI), Census Bureau (health insurance coverage), and OECD
 * (health expenditure) into a single intelligence packet.
 * Makes 3 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { blsDataClient } from "../clients/bls-data";
import { censusBureauClient } from "../clients/census-bureau";
import { oecdHealthClient } from "../clients/oecd-health";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  truncateToCharBudget,
} from "../format";

export const marketDynamicsResearchTool: DataSourceTool = {
  name: "research_market_dynamics",
  description:
    "Market dynamics intelligence: healthcare economic indicators, demographic trends, " +
    "and international comparisons.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Topic or indicator to research" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["bls-data", "census-bureau", "oecd-health"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const topic = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    const now = new Date();
    const endYear = now.getFullYear();
    const startYear = endYear - yearsBack;

    // ─── Parallel API calls ────────────────────────────────────
    // Medical Care CPI: CUUR0000SAM
    const [blsResult, censusResult, oecdResult] = await Promise.all([
      blsDataClient.getSeries({
        seriesId: "CUUR0000SAM",
        startYear,
        endYear,
      }).catch(() => null),
      censusBureauClient.getSahieData({ year: endYear - 1 }).catch(() => null),
      oecdHealthClient.getHealthExpenditures({ countries: ["USA"] }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const blsSeries = blsResult?.data.series?.[0];
    const latestBlsPoint = blsSeries?.data?.[0];
    const currentMedicalCpi = latestBlsPoint?.value ?? null;
    const currentMedicalCpiYear = latestBlsPoint?.year ?? null;

    // SAHIE: PCTUI_PT = percent uninsured
    const censusRecords = censusResult?.data.records ?? [];
    const usRecord = censusRecords.find(
      (r) => String(r["GEOCAT"] ?? r["geocat"] ?? "") === "40",
    ) ?? censusRecords[0];
    const uninsuredPct = usRecord
      ? String(usRecord["PCTUI_PT"] ?? usRecord["pctui_pt"] ?? "—")
      : "—";

    // OECD: find USA most recent
    const oecdObs = oecdResult?.data.observations ?? [];
    const usaObs = oecdObs
      .filter((o) => o.countryCode === "USA" && o.value !== null)
      .sort((a, b) => b.year.localeCompare(a.year));
    const latestUsaObs = usaObs[0];
    const usHealthExpGdp = latestUsaObs
      ? `${latestUsaObs.value?.toFixed(1)}% GDP (${latestUsaObs.year})`
      : "—";

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (blsSeries?.data?.length) sourcesReturned++;
    if (censusRecords.length > 0) sourcesReturned++;
    if (oecdObs.length > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Market Dynamics",
      subject: topic,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: blsResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (currentMedicalCpi !== null) {
      bullets.push(
        `- US Medical Care CPI: **${currentMedicalCpi}** (${currentMedicalCpiYear})`,
      );
    } else {
      bullets.push(`- US Medical Care CPI: data not available`);
    }
    bullets.push(`- US uninsured rate (SAHIE): **${uninsuredPct}%**`);
    bullets.push(`- US health expenditure: **${usHealthExpGdp}**`);

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Economic Indicators table — BLS time series
    if (blsSeries?.data?.length) {
      const rows = blsSeries.data.slice(0, 10).map((dp) => [
        String(dp.year),
        dp.periodName ?? dp.period,
        String(dp.value),
      ]);
      sections.push(
        `### Medical Care CPI (BLS CUUR0000SAM)\n${markdownTable(
          ["Year", "Period", "Index Value"],
          rows,
          10,
          blsSeries.data.length,
        )}`,
      );
    }

    // OECD top countries by health expenditure
    if (oecdObs.length > 0) {
      const latestByCountry: Record<string, typeof oecdObs[0]> = {};
      for (const obs of oecdObs) {
        const existing = latestByCountry[obs.countryCode];
        if (!existing || obs.year > existing.year) {
          latestByCountry[obs.countryCode] = obs;
        }
      }
      const sorted = Object.values(latestByCountry)
        .filter((o) => o.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, 8);
      const oecdRows = sorted.map((o) => [
        o.country,
        String(o.value?.toFixed(1) ?? "—"),
        String(o.year),
      ]);
      sections.push(
        `### OECD Health Expenditure (% GDP)\n${markdownTable(
          ["Country", "% GDP", "Year"],
          oecdRows,
          8,
          sorted.length,
        )}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[BLS-${ts}]`,
        source: "Bureau of Labor Statistics (Medical Care CPI)",
        query: "CUUR0000SAM",
        resultCount: blsSeries?.data?.length ?? 0,
      },
      {
        id: `[CENSUS-${ts}]`,
        source: "US Census Bureau SAHIE",
        query: topic,
        resultCount: censusRecords.length,
      },
      {
        id: `[OECD-${ts}]`,
        source: "OECD Health Statistics",
        query: "Health Expenditure % GDP",
        resultCount: oecdObs.length,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: blsResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "Bureau of Labor Statistics" },
      confidence,
      truncated,
    };
  },
};

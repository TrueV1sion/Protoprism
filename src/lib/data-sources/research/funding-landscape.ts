// src/lib/data-sources/research/funding-landscape.ts
/**
 * research_funding_landscape — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates federal grant opportunities from
 * Grants.gov and government contract opportunities from SAM.gov into a single
 * intelligence packet. Makes 2 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { grantsGovClient } from "../clients/grants-gov";
import { samGovClient } from "../clients/sam-gov";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const fundingLandscapeResearchTool: DataSourceTool = {
  name: "research_funding_landscape",
  description:
    "Funding landscape intelligence: federal grants, government contract opportunities " +
    "for a topic or organization.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Topic or organization name" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["grants-gov", "sam-gov"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const queryTerm = input.query as string;

    // ─── Parallel API calls ────────────────────────────────────
    const [grantsResult, samOppsResult] = await Promise.all([
      grantsGovClient.searchOpportunities({ keyword: queryTerm, rows: 5 }).catch(() => null),
      samGovClient.searchOpportunities({ q: queryTerm, limit: 5 }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const grantsTotal = grantsResult?.data.total ?? 0;
    const grantsItems = grantsResult?.data.results ?? [];

    // Estimate total funding from ceiling values
    let totalEstimatedFunding = 0;
    let fundingCount = 0;
    for (const grant of grantsItems) {
      const ceiling = grant.award_ceiling;
      if (ceiling) {
        const parsed = parseFloat(String(ceiling).replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          totalEstimatedFunding += parsed;
          fundingCount++;
        }
      }
    }

    const samOppsTotal = samOppsResult?.data.total ?? 0;
    const samOppsItems = samOppsResult?.data.results ?? [];

    // ─── Confidence scoring ────────────────────────────────────
    // 2 sources: HIGH if both return, MEDIUM if 1, LOW if 0
    let sourcesReturned = 0;
    if (grantsTotal > 0) sourcesReturned++;
    if (samOppsTotal > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 2 ? "HIGH" : sourcesReturned >= 1 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Funding Landscape",
      subject: queryTerm,
      confidence,
      sourcesQueried: 2,
      sourcesReturned,
      vintage: grantsResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(grantsTotal)}** federal grant opportunities found on Grants.gov`);
    if (fundingCount > 0 && totalEstimatedFunding > 0) {
      bullets.push(
        `- Estimated award ceiling (sampled): $${formatNumber(Math.round(totalEstimatedFunding))} across ${fundingCount} grants`,
      );
    }
    bullets.push(`- **${formatNumber(samOppsTotal)}** contract opportunities found on SAM.gov`);

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Grants table
    if (grantsItems.length > 0) {
      const grantsRows = grantsItems.slice(0, 5).map((g) => [
        String(g.title ?? "—").slice(0, 50),
        String(g.agency ?? "—").slice(0, 30),
        String(g.award_ceiling ?? g.estimated_funding ?? "—").slice(0, 15),
      ]);
      sections.push(
        `### Federal Grants (Grants.gov)\n${markdownTable(
          ["Title", "Agency", "Award Ceiling"],
          grantsRows,
          5,
          grantsTotal,
        )}`,
      );
    }

    // SAM.gov contract opportunities
    if (samOppsItems.length > 0) {
      const samRows = samOppsItems.slice(0, 5).map((opp) => {
        const rec = opp as Record<string, unknown>;
        const title = String(
          (rec.title as string) ??
          ((rec.opportunityTitle as string)) ??
          "—",
        ).slice(0, 50);
        const department = String(
          (rec.fullParentPathName as string) ??
          (rec.organizationHierarchy as string) ??
          "—",
        ).slice(0, 30);
        const type = String((rec.type as string) ?? (rec.typeOfSetAside as string) ?? "—").slice(0, 20);
        return [title, department, type];
      });
      sections.push(
        `### Contract Opportunities (SAM.gov)\n${markdownTable(
          ["Title", "Department", "Type"],
          samRows,
          5,
          samOppsTotal,
        )}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[GRANTS-${ts}]`,
        source: "Grants.gov",
        query: queryTerm,
        resultCount: grantsTotal,
      },
      {
        id: `[SAM-${ts}]`,
        source: "SAM.gov Contract Opportunities",
        query: queryTerm,
        resultCount: samOppsTotal,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: grantsResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "Grants.gov" },
      confidence,
      truncated,
    };
  },
};

// src/lib/data-sources/research/patent-landscape.ts
/**
 * research_patent_landscape — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates USPTO patent filings and FDA Orange
 * Book exclusivity data into a single intelligence packet.
 * Makes 2 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { usptoPatentsClient } from "../clients/uspto-patents";
import { fdaOrangeBookClient } from "../clients/fda-orange-book";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const patentLandscapeResearchTool: DataSourceTool = {
  name: "research_patent_landscape",
  description:
    "Patent landscape intelligence: patent filings, Orange Book exclusivity, " +
    "and IP position for a drug or technology.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Drug or technology name" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["uspto-patents", "fda-orange-book"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const queryTerm = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - yearsBack);
    const dateFromStr = dateFrom.toISOString().slice(0, 10);

    // ─── Parallel API calls ────────────────────────────────────
    const [patentsResult, orangeBookResult] = await Promise.all([
      usptoPatentsClient.searchPatents({
        query: queryTerm,
        date_from: dateFromStr,
        limit: 10,
      }).catch(() => null),
      fdaOrangeBookClient.searchProducts({ query: queryTerm, limit: 5 }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const totalPatents = patentsResult?.data.total ?? 0;
    const patents = patentsResult?.data.patents ?? [];
    const latestPatentDate = patents[0]?.patent_date ?? null;

    const orangeBookTotal = orangeBookResult?.data.total ?? 0;
    const orangeBookProducts = orangeBookResult?.data.results ?? [];

    // Determine exclusivity status from Orange Book submissions
    let exclusivitySummary = "No exclusivity data";
    if (orangeBookProducts.length > 0) {
      const product = orangeBookProducts[0];
      const submissions = product.submissions ?? [];
      const exclusivitySubs = submissions.filter(
        (s) =>
          s.submission_class_code === "BIO" ||
          s.submission_class_code === "NCE" ||
          s.submission_class_code === "ODE" ||
          (s.submission_class_code_description ?? "").toLowerCase().includes("exclusivity"),
      );
      if (exclusivitySubs.length > 0) {
        exclusivitySummary = `${exclusivitySubs.length} exclusivity submission(s) found`;
      } else if (submissions.length > 0) {
        exclusivitySummary = `${submissions.length} submission(s), no exclusivity codes`;
      } else {
        exclusivitySummary = "No submissions in Orange Book";
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    // 2 sources: HIGH if both return, MEDIUM if 1, LOW if 0
    let sourcesReturned = 0;
    if (totalPatents > 0) sourcesReturned++;
    if (orangeBookTotal > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 2 ? "HIGH" : sourcesReturned >= 1 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Patent Landscape",
      subject: queryTerm,
      confidence,
      sourcesQueried: 2,
      sourcesReturned,
      vintage: patentsResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(totalPatents)}** patents found in USPTO PatentsView`);
    if (latestPatentDate) {
      bullets.push(`- Latest patent filing date: **${latestPatentDate.slice(0, 10)}**`);
    }
    bullets.push(`- **${formatNumber(orangeBookTotal)}** FDA Orange Book listing(s)`);
    bullets.push(`- Exclusivity status: ${exclusivitySummary}`);

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Patent filings table
    if (patents.length > 0) {
      const rows = patents.slice(0, 8).map((p) => {
        const assignee = p.assignees?.[0]?.assignee_organization ?? "—";
        return [
          String(p.patent_title ?? "—").slice(0, 55),
          String(p.patent_date ?? "—").slice(0, 10),
          String(assignee).slice(0, 35),
        ];
      });
      sections.push(
        `### Patent Filings\n${markdownTable(
          ["Title", "Date", "Assignee"],
          rows,
          8,
          totalPatents,
        )}`,
      );
    }

    // Orange Book summary
    if (orangeBookProducts.length > 0) {
      const obRows = orangeBookProducts.slice(0, 3).map((prod) => {
        const brandName = prod.openfda?.brand_name?.[0] ?? "—";
        const genericName = prod.openfda?.generic_name?.[0] ?? "—";
        const sponsor = prod.sponsor_name ?? "—";
        return [
          String(brandName).slice(0, 30),
          String(genericName).slice(0, 30),
          String(sponsor).slice(0, 30),
        ];
      });
      sections.push(
        `### Orange Book Listings\n${markdownTable(
          ["Brand Name", "Generic Name", "Sponsor"],
          obRows,
          3,
          orangeBookTotal,
        )}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[USPTO-${ts}]`,
        source: "USPTO PatentsView",
        query: queryTerm,
        resultCount: totalPatents,
      },
      {
        id: `[OB-${ts}]`,
        source: "FDA Orange Book (openFDA drugsfda)",
        query: queryTerm,
        resultCount: orangeBookTotal,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: patentsResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "USPTO PatentsView" },
      confidence,
      truncated,
    };
  },
};

// src/lib/data-sources/research/company-position.ts
/**
 * research_company_position — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates SEC filing data, government contract
 * activity from SAM.gov, and USPTO patent portfolio into a single intelligence
 * packet. Makes 3 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { secEdgarClient } from "../clients/sec-edgar";
import { samGovClient } from "../clients/sam-gov";
import { usptoPatentsClient } from "../clients/uspto-patents";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  dig,
  truncateToCharBudget,
} from "../format";

export const companyPositionResearchTool: DataSourceTool = {
  name: "research_company_position",
  description:
    "Company position intelligence: SEC filings, government contract activity, " +
    "and patent portfolio for a company.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Company name" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["sec-edgar", "sam-gov", "uspto-patents"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const companyName = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - yearsBack);
    const dateFromStr = dateFrom.toISOString().slice(0, 10);

    // ─── Parallel API calls ────────────────────────────────────
    const [edgarResult, samEntitiesResult, patentsResult] = await Promise.all([
      secEdgarClient.searchFilings({ query: companyName, limit: 5, dateFrom: dateFromStr }).catch(() => null),
      samGovClient.searchEntities({ legalBusinessName: companyName, registrationLimit: 5 }).catch(() => null),
      usptoPatentsClient.searchPatents({ assignee: companyName, limit: 5 }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const totalFilings = edgarResult?.data.total ?? 0;
    const recentFilings = edgarResult?.data.results ?? [];
    const filingTypes = [...new Set(recentFilings.map((f) => (f as Record<string, unknown>).form_type as string).filter(Boolean))];

    const entityCount = samEntitiesResult?.data.count ?? 0;
    const firstEntity = samEntitiesResult?.data.results?.[0] as Record<string, unknown> | undefined;
    const entityName = dig(firstEntity, "entityRegistration.legalBusinessName", "—");
    const registrationStatus = dig(firstEntity, "entityRegistration.registrationStatus", "Unknown");

    const totalPatents = patentsResult?.data.total ?? 0;
    const patents = patentsResult?.data.patents ?? [];

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (totalFilings > 0) sourcesReturned++;
    if (entityCount > 0) sourcesReturned++;
    if (totalPatents > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Company Position",
      subject: companyName,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: edgarResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(totalFilings)}** SEC filings found in the last ${yearsBack} years`);
    if (filingTypes.length > 0) {
      bullets.push(`- Recent filing types: ${filingTypes.slice(0, 5).join(", ")}`);
    }
    if (entityCount > 0) {
      bullets.push(`- SAM.gov entity: **${entityName}** — Registration: ${registrationStatus}`);
    } else {
      bullets.push(`- No SAM.gov entity registration found`);
    }
    bullets.push(`- **${formatNumber(totalPatents)}** patents found in USPTO PatentsView`);

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Recent filings table
    if (recentFilings.length > 0) {
      const rows = recentFilings.map((f) => {
        const filing = f as Record<string, unknown>;
        return [
          String(filing.filed_date ?? "—").slice(0, 10),
          String(filing.form_type ?? "—"),
          String(filing.description ?? "—").slice(0, 60),
        ];
      });
      sections.push(
        `### Recent Filings\n${markdownTable(["Date", "Type", "Description"], rows, 5, totalFilings)}`,
      );
    }

    // Patent snapshot
    if (patents.length > 0) {
      const patentRows = patents.slice(0, 5).map((p) => {
        const assignee = p.assignees?.[0]?.assignee_organization ?? "—";
        return [
          String(p.patent_title ?? "—").slice(0, 60),
          String(p.patent_date ?? "—").slice(0, 10),
          String(assignee).slice(0, 40),
        ];
      });
      sections.push(
        `### Recent Patents\n${markdownTable(["Title", "Date", "Assignee"], patentRows, 5, totalPatents)}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[EDGAR-${ts}]`,
        source: "SEC EDGAR EFTS",
        query: companyName,
        resultCount: totalFilings,
      },
      {
        id: `[SAM-${ts}]`,
        source: "SAM.gov Entity Information",
        query: companyName,
        resultCount: entityCount,
      },
      {
        id: `[USPTO-${ts}]`,
        source: "USPTO PatentsView",
        query: companyName,
        resultCount: totalPatents,
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

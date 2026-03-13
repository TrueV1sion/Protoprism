// src/lib/data-sources/tools/grants-gov.tools.ts
/**
 * Grants.gov Layer 2 Granular Tools
 *
 * 2 tools that wrap Grants.gov Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { grantsGovClient } from "../clients/grants-gov";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_grants ────────────────────────────────────────────

const searchGrants: DataSourceTool = {
  name: "search_grants",
  description:
    "Search Grants.gov for federal grant opportunities across all agencies. " +
    "Filter by keyword, agency, funding category, and status. Returns a markdown table of matching grant opportunities.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "Search keyword (e.g., 'cancer research', 'rural health')" },
      agency: { type: "string", description: "Agency code or name (e.g., 'HHS', 'NIH', 'NSF')" },
      funding_category: { type: "string", description: "Funding category (e.g., 'Health', 'Education', 'Science')" },
      status: { type: "string", description: "Opportunity status: 'posted', 'closed', 'archived' (default: 'posted')" },
      sort_by: { type: "string", description: "Sort field (e.g., 'openDate', 'closeDate', 'relevance')" },
      limit: { type: "number", description: "Max results per page (default 15, max 100)" },
      page: { type: "number", description: "Page number for pagination (default 1)" },
    },
  },
  layer: 2,
  sources: ["grants-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await grantsGovClient.searchOpportunities({
      keyword: input.keyword as string | undefined,
      agency: input.agency as string | undefined,
      fundingCategory: input.funding_category as string | undefined,
      status: (input.status as string | undefined) ?? "posted",
      sortBy: input.sort_by as string | undefined,
      rows: (input.limit as number | undefined) ?? 15,
      page: (input.page as number | undefined) ?? 1,
    });

    const headers = ["Title", "Agency", "Category", "Close Date", "Award Ceiling"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((grant) => [
      grant.title.slice(0, 70),
      grant.agency.slice(0, 25),
      grant.funding_category.slice(0, 25),
      grant.close_date ? formatDate(grant.close_date) : "—",
      grant.award_ceiling ?? "—",
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc =
      (input.keyword as string) ??
      (input.agency ? `Agency: ${input.agency as string}` : undefined) ??
      (input.funding_category as string) ??
      "all grants";

    const citation = {
      id: `[GRANTS-${Date.now()}]`,
      source: "Grants.gov",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Grants.gov: ${queryDesc}\n\n**${formatNumber(response.data.total)} opportunities found** (source: ${response.data.source})\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.count > 0 ? "HIGH" : "MEDIUM",
      truncated: response.data.hasMore,
    };
  },
};

// ─── get_grant_detail ─────────────────────────────────────────

const getGrantDetail: DataSourceTool = {
  name: "get_grant_detail",
  description:
    "Retrieve details for a specific grant opportunity by its Grants.gov opportunity ID. " +
    "Returns title, agency, funding amounts, open/close dates, and eligibility information.",
  inputSchema: {
    type: "object",
    properties: {
      opportunity_id: { type: "string", description: "Grants.gov opportunity ID (numeric string)" },
    },
    required: ["opportunity_id"],
  },
  layer: 2,
  sources: ["grants-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const opportunityId = input.opportunity_id as string;
    const response = await grantsGovClient.getOpportunity(opportunityId);

    const citation = {
      id: `[GRANTS-DETAIL-${Date.now()}]`,
      source: "Grants.gov",
      query: opportunityId,
      resultCount: response.data ? 1 : 0,
    };

    if (!response.data || response.status === 404) {
      return {
        content: `## Grant Opportunity: ${opportunityId}\n\nOpportunity not found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "LOW",
        truncated: false,
      };
    }

    const grant = response.data;
    const sections: string[] = [];
    sections.push(`### ${grant.title}`);
    sections.push(`**Opportunity ID:** ${grant.opportunity_id}`);
    if (grant.opportunity_number) sections.push(`**Opportunity Number:** ${grant.opportunity_number}`);
    sections.push(`**Agency:** ${grant.agency}`);
    sections.push(`**Funding Category:** ${grant.funding_category}`);
    sections.push(`**Status:** ${grant.status}`);
    if (grant.open_date) sections.push(`**Open Date:** ${formatDate(grant.open_date)}`);
    if (grant.close_date) sections.push(`**Close Date:** ${formatDate(grant.close_date)}`);
    if (grant.estimated_funding) sections.push(`**Estimated Total Funding:** $${grant.estimated_funding}`);
    if (grant.award_ceiling) sections.push(`**Award Ceiling:** $${grant.award_ceiling}`);
    if (grant.award_floor) sections.push(`**Award Floor:** $${grant.award_floor}`);
    if (grant.url) sections.push(`**URL:** ${grant.url}`);

    return {
      content: `## Grant Opportunity: ${opportunityId}\n\n${sections.join("\n\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const grantsGovTools: DataSourceTool[] = [
  searchGrants,
  getGrantDetail,
];

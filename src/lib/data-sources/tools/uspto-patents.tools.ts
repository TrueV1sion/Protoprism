// src/lib/data-sources/tools/uspto-patents.tools.ts
/**
 * USPTO PatentsView Layer 2 Granular Tools
 *
 * 2 tools that wrap USPTO PatentsView Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { usptoPatentsClient } from "../clients/uspto-patents";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_patents ───────────────────────────────────────────

const searchPatents: DataSourceTool = {
  name: "search_patents",
  description:
    "Search US patents via USPTO PatentsView. Filter by keyword, assignee organization, inventor, " +
    "CPC classification code, or date range. Returns a markdown table of matching patents.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword search in patent abstracts" },
      assignee: { type: "string", description: "Assignee organization name (e.g., 'Johnson & Johnson')" },
      inventor: { type: "string", description: "Inventor first or last name" },
      cpc_section: {
        type: "string",
        description: "CPC classification code prefix (e.g., 'A61' for medical devices)",
      },
      date_from: { type: "string", description: "Grant date start (YYYY-MM-DD)" },
      date_to: { type: "string", description: "Grant date end (YYYY-MM-DD)" },
      limit: { type: "number", description: "Max results (default 25)" },
    },
  },
  layer: 2,
  sources: ["uspto-patents"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await usptoPatentsClient.searchPatents({
      query: input.query as string | undefined,
      assignee: input.assignee as string | undefined,
      inventor: input.inventor as string | undefined,
      cpc_section: input.cpc_section as string | undefined,
      date_from: input.date_from as string | undefined,
      date_to: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 25,
    });

    const patents = response.data.patents ?? [];

    const headers = ["Patent #", "Title", "Assignee", "Grant Date", "Citations"];
    const rows = patents.slice(0, MAX_TABLE_ROWS_LAYER_2).map((p) => [
      p.patent_number,
      p.patent_title.slice(0, 55),
      (p.assignees?.[0]?.assignee_organization || "—").slice(0, 35),
      formatDate(p.patent_date ?? ""),
      String(p.patent_num_cited_by_us_patents ?? 0),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc =
      (input.query as string) ??
      (input.assignee as string) ??
      (input.inventor as string) ??
      (input.cpc_section as string) ??
      "all";

    const citation = {
      id: `[USPTO-SEARCH-${Date.now()}]`,
      source: "USPTO PatentsView",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Patent Search: ${queryDesc}\n\n**${formatNumber(response.data.total)} patents found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: patents.length < response.data.total,
    };
  },
};

// ─── get_patent ───────────────────────────────────────────────

const getPatent: DataSourceTool = {
  name: "get_patent",
  description:
    "Retrieve full details for a specific US patent by patent number. " +
    "Returns title, abstract, assignees, inventors, CPC classifications, and citation count.",
  inputSchema: {
    type: "object",
    properties: {
      patent_number: {
        type: "string",
        description: "US patent number (e.g., '10123456', 'US10123456B2')",
      },
    },
    required: ["patent_number"],
  },
  layer: 2,
  sources: ["uspto-patents"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await usptoPatentsClient.getPatent(input.patent_number as string);

    const patents = response.data.patents ?? [];
    const queryDesc = input.patent_number as string;

    if (patents.length === 0) {
      const citation = {
        id: `[USPTO-PATENT-${Date.now()}]`,
        source: "USPTO PatentsView",
        query: queryDesc,
        resultCount: 0,
      };
      return {
        content: `## Patent: ${queryDesc}\n\nPatent not found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "LOW",
        truncated: false,
      };
    }

    const p = patents[0];
    const sections: string[] = [
      `### US Patent ${p.patent_number}: ${p.patent_title}`,
      `**Grant Date:** ${formatDate(p.patent_date ?? "")}`,
    ];

    if (p.assignees?.length) {
      sections.push(
        `**Assignees:** ${p.assignees.map((a) => a.assignee_organization || "—").join("; ")}`,
      );
    }
    if (p.inventors?.length) {
      sections.push(
        `**Inventors:** ${p.inventors.map((i) => `${i.inventor_first_name} ${i.inventor_last_name}`).join("; ")}`,
      );
    }
    if (p.cpcs?.length) {
      sections.push(
        `**CPC Classes:** ${p.cpcs.map((c) => c.cpc_group_id || "").filter(Boolean).join(", ")}`,
      );
    }
    if (p.patent_num_cited_by_us_patents !== undefined) {
      sections.push(`**Forward Citations:** ${p.patent_num_cited_by_us_patents}`);
    }
    if (p.patent_num_claims !== undefined) {
      sections.push(`**Claims:** ${p.patent_num_claims}`);
    }
    if (p.patent_abstract) {
      sections.push(`\n**Abstract:** ${p.patent_abstract.slice(0, 800)}`);
    }

    const citation = {
      id: `[USPTO-PATENT-${Date.now()}]`,
      source: "USPTO PatentsView",
      query: queryDesc,
      resultCount: 1,
    };

    return {
      content: `## Patent: ${queryDesc}\n\n${sections.join("\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const usptoPatentsTools: DataSourceTool[] = [
  searchPatents,
  getPatent,
];

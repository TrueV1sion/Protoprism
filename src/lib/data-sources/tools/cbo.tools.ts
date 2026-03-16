// src/lib/data-sources/tools/cbo.tools.ts
/**
 * CBO (Congressional Budget Office) Layer 2 Granular Tools
 *
 * 2 tools that wrap CBO Layer 1 client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable content + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { cboClient } from "../clients/cbo";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_cbo_reports ──────────────────────────────────────

const searchCboReports: DataSourceTool = {
  name: "search_cbo_reports",
  description:
    "Search Congressional Budget Office (CBO) reports and publications by keyword. " +
    "Returns recent CBO analyses, budget outlooks, economic forecasts, and policy studies.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keyword or topic (e.g., 'Medicare costs', 'defense spending')" },
      limit: { type: "number", description: "Max results to return (default 15, max 50)" },
    },
    required: ["query"],
  },
  layer: 2,
  sources: ["cbo"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;
    const limit = (input.limit as number | undefined) ?? 15;

    const response = await cboClient.searchPublications({ query, limit });

    if (response.data.items.length === 0) {
      const citation = {
        id: `[CBO-SEARCH-${Date.now()}]`,
        source: "Congressional Budget Office",
        query,
        resultCount: 0,
      };
      return {
        content: `## CBO Reports: ${query}\n\nNo publications found for this query.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "MEDIUM",
        truncated: false,
      };
    }

    const headers = ["Title", "Date", "Link"];
    const rows = response.data.items.slice(0, MAX_TABLE_ROWS_LAYER_2).map((item) => [
      item.title.slice(0, 80),
      formatDate(item.pubDate),
      item.link.slice(0, 60),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);

    const citation = {
      id: `[CBO-SEARCH-${Date.now()}]`,
      source: "Congressional Budget Office",
      query,
      resultCount: response.data.total,
    };

    return {
      content: `## CBO Reports: ${query}\n\n**${formatNumber(response.data.total)} publications found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── get_cbo_cost_estimates ──────────────────────────────────

const getCboCostEstimates: DataSourceTool = {
  name: "get_cbo_cost_estimates",
  description:
    "Retrieve the most recent CBO cost estimates for legislation. These analyses score how proposed laws " +
    "would affect the federal budget and mandatory spending over 10-year windows.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max results to return (default 15, max 50)" },
    },
  },
  layer: 2,
  sources: ["cbo"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const limit = (input.limit as number | undefined) ?? 15;

    const response = await cboClient.getCostEstimates({ limit });

    if (response.data.items.length === 0) {
      const citation = {
        id: `[CBO-CE-${Date.now()}]`,
        source: "Congressional Budget Office",
        query: "cost estimates",
        resultCount: 0,
      };
      return {
        content: `## CBO Cost Estimates\n\nNo cost estimates available.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "MEDIUM",
        truncated: false,
      };
    }

    const headers = ["Title", "Date", "Description"];
    const rows = response.data.items.slice(0, MAX_TABLE_ROWS_LAYER_2).map((item) => [
      item.title.slice(0, 70),
      formatDate(item.pubDate),
      item.description.slice(0, 100),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);

    const citation = {
      id: `[CBO-CE-${Date.now()}]`,
      source: "Congressional Budget Office",
      query: "recent cost estimates",
      resultCount: response.data.total,
    };

    return {
      content: `## CBO Cost Estimates\n\n**${formatNumber(response.data.total)} cost estimates**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const cboTools: DataSourceTool[] = [
  searchCboReports,
  getCboCostEstimates,
];

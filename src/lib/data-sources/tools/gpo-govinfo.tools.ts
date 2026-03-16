// src/lib/data-sources/tools/gpo-govinfo.tools.ts
/**
 * GPO GovInfo Layer 2 Granular Tools
 *
 * 2 tools that wrap GPO GovInfo Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { gpoGovinfoClient } from "../clients/gpo-govinfo";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
  dig,
} from "../format";

// ─── search_govinfo ──────────────────────────────────────────

const searchGovinfo: DataSourceTool = {
  name: "search_govinfo",
  description:
    "Search GovInfo (GPO) for federal documents: bills, congressional records, Federal Register notices, " +
    "executive orders, regulations, and other government publications. Returns markdown table of matching documents.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Full-text search query" },
      collections: { type: "string", description: "Comma-separated collection codes (e.g., 'BILLS,CREC,FR')" },
      date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
      date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
      page_size: { type: "number", description: "Results per page (default 10, max 100)" },
    },
    required: ["query"],
  },
  layer: 2,
  sources: ["govinfo"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await gpoGovinfoClient.search({
      query: input.query as string,
      collections: input.collections as string | undefined,
      pageSize: (input.page_size as number | undefined) ?? 10,
      dateIssuedStartDate: input.date_from as string | undefined,
      dateIssuedEndDate: input.date_to as string | undefined,
    });

    const headers = ["Title", "Collection", "Date", "Package ID"];
    const rows = response.data.packages.map((pkg) => [
      (dig(pkg, "title") || dig(pkg, "packageId")).slice(0, 80),
      dig(pkg, "collectionCode"),
      formatDate(dig(pkg, "dateIssued")),
      dig(pkg, "packageId"),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.totalCount);
    const queryDesc = input.query as string;

    const citation = {
      id: `[GOVINFO-SEARCH-${Date.now()}]`,
      source: "GPO GovInfo",
      query: queryDesc,
      resultCount: response.data.totalCount,
    };

    return {
      content: `## GovInfo Search: ${queryDesc}\n\n**${formatNumber(response.data.totalCount)} documents found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.totalCount > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.totalCount,
    };
  },
};

// ─── get_govinfo_document ────────────────────────────────────

const getGovinfoDocument: DataSourceTool = {
  name: "get_govinfo_document",
  description:
    "Retrieve metadata for a specific GovInfo document by package ID (e.g., 'BILLS-118hr1-ih', 'FR-2024-12345'). " +
    "Returns title, collection, date, and document details.",
  inputSchema: {
    type: "object",
    properties: {
      package_id: { type: "string", description: "GovInfo package ID (e.g., 'BILLS-118hr1-ih')" },
    },
    required: ["package_id"],
  },
  layer: 2,
  sources: ["govinfo"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const packageId = input.package_id as string;
    const response = await gpoGovinfoClient.getPackageSummary(packageId);

    const sections: string[] = [];

    if (response.status === 404 || !response.data.packageId) {
      const citation = {
        id: `[GOVINFO-DOC-${Date.now()}]`,
        source: "GPO GovInfo",
        query: packageId,
        resultCount: 0,
      };
      return {
        content: `## GovInfo Document: ${packageId}\n\nDocument not found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "LOW",
        truncated: false,
      };
    }

    sections.push(`### ${response.data.title ?? response.data.packageId}`);
    if (response.data.collectionCode) sections.push(`**Collection:** ${response.data.collectionCode}`);
    if (response.data.dateIssued) sections.push(`**Date Issued:** ${formatDate(response.data.dateIssued)}`);
    if (response.data.lastModified) sections.push(`**Last Modified:** ${formatDate(response.data.lastModified)}`);
    sections.push(`**Package ID:** ${response.data.packageId}`);

    const detailKeys = ["granules", "related", "download"] as const;
    for (const key of detailKeys) {
      const val = response.data.details[key];
      if (val) sections.push(`**${key}:** ${JSON.stringify(val).slice(0, 200)}`);
    }

    const citation = {
      id: `[GOVINFO-DOC-${Date.now()}]`,
      source: "GPO GovInfo",
      query: packageId,
      resultCount: 1,
    };

    return {
      content: `## GovInfo Document: ${packageId}\n\n${sections.join("\n\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const gpoGovinfoTools: DataSourceTool[] = [
  searchGovinfo,
  getGovinfoDocument,
];

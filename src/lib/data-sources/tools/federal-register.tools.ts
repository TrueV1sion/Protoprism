// src/lib/data-sources/tools/federal-register.tools.ts
/**
 * Federal Register Layer 2 Granular Tools
 *
 * 2 tools that wrap Federal Register Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { federalRegisterClient } from "../clients/federal-register";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_federal_register ─────────────────────────────────

const searchFederalRegister: DataSourceTool = {
  name: "search_federal_register",
  description:
    "Search Federal Register documents including rules, proposed rules, notices, and presidential documents. " +
    "Returns a markdown table of matching documents with type, agency, date, and link.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Full-text search query" },
      document_type: {
        type: "array",
        items: { type: "string", enum: ["RULE", "PRORULE", "NOTICE", "PRESDOCU"] },
        description: "Document type filter: RULE, PRORULE, NOTICE, PRESDOCU",
      },
      agencies: {
        type: "array",
        items: { type: "string" },
        description: "Agency slug(s) to filter by (e.g., ['health-and-human-services-department'])",
      },
      date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
      date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
      significant: { type: "boolean", description: "Filter to significant/major rules only" },
      limit: { type: "number", description: "Max results (default 20, max 100)" },
    },
  },
  layer: 2,
  sources: ["federal-register"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await federalRegisterClient.searchDocuments({
      query: input.query as string | undefined,
      document_type: input.document_type as Array<"RULE" | "PRORULE" | "NOTICE" | "PRESDOCU"> | undefined,
      agencies: input.agencies as string[] | undefined,
      date_from: input.date_from as string | undefined,
      date_to: input.date_to as string | undefined,
      significant: input.significant as boolean | undefined,
      limit: (input.limit as number | undefined) ?? 20,
    });

    const headers = ["Doc #", "Type", "Title", "Agency", "Date"];
    const rows = response.data.results.map((r) => [
      r.document_number,
      r.type,
      r.title.slice(0, 60),
      (r.agencies?.[0]?.name || "—").slice(0, 40),
      formatDate(r.publication_date),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = (input.query as string) ?? "all documents";

    const citation = {
      id: `[FR-SEARCH-${Date.now()}]`,
      source: "Federal Register",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Federal Register: ${queryDesc}\n\n**${formatNumber(response.data.total)} documents found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── get_federal_register_document ───────────────────────────

const getFederalRegisterDocument: DataSourceTool = {
  name: "get_federal_register_document",
  description:
    "Retrieve full details for a specific Federal Register document by document number. " +
    "Returns title, abstract, agency, dates, CFR references, and links to HTML/PDF.",
  inputSchema: {
    type: "object",
    properties: {
      document_number: {
        type: "string",
        description: "Federal Register document number (e.g., '2024-01234')",
      },
    },
    required: ["document_number"],
  },
  layer: 2,
  sources: ["federal-register"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await federalRegisterClient.getDocument(
      input.document_number as string,
    );

    const doc = response.data;
    const queryDesc = input.document_number as string;

    if (!doc || response.status === 404) {
      const citation = {
        id: `[FR-DOC-${Date.now()}]`,
        source: "Federal Register",
        query: queryDesc,
        resultCount: 0,
      };
      return {
        content: `## Federal Register Document: ${queryDesc}\n\nDocument not found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "LOW",
        truncated: false,
      };
    }

    const sections: string[] = [
      `### ${doc.title}`,
      `**Document Number:** ${doc.document_number}`,
      `**Type:** ${doc.type}${doc.subtype ? ` / ${doc.subtype}` : ""}`,
      `**Agency:** ${doc.agencies?.map((a) => a.name).join(", ") || "—"}`,
      `**Published:** ${formatDate(doc.publication_date)}`,
    ];

    if (doc.effective_on) sections.push(`**Effective:** ${formatDate(doc.effective_on)}`);
    if (doc.comments_close_on) sections.push(`**Comment Deadline:** ${formatDate(doc.comments_close_on)}`);
    if (doc.abstract) sections.push(`\n**Abstract:** ${doc.abstract.slice(0, 600)}`);
    if (doc.action) sections.push(`**Action:** ${doc.action.slice(0, 200)}`);
    if (doc.cfr_references?.length) {
      const refs = doc.cfr_references.map((r) => `${r.title} CFR Part ${r.part}`).join(", ");
      sections.push(`**CFR References:** ${refs}`);
    }
    sections.push(`**HTML:** ${doc.html_url}`);
    sections.push(`**PDF:** ${doc.pdf_url}`);

    const citation = {
      id: `[FR-DOC-${Date.now()}]`,
      source: "Federal Register",
      query: queryDesc,
      resultCount: 1,
    };

    return {
      content: `## Federal Register Document: ${queryDesc}\n\n${sections.join("\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const federalRegisterTools: DataSourceTool[] = [
  searchFederalRegister,
  getFederalRegisterDocument,
];

// src/lib/data-sources/tools/sec-edgar.tools.ts
/**
 * SEC EDGAR Layer 2 Granular Tools
 *
 * 3 tools that wrap SEC EDGAR Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { secEdgarClient } from "../clients/sec-edgar";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_sec_filings ───────────────────────────────────────

const searchSecFilings: DataSourceTool = {
  name: "search_sec_filings",
  description:
    "Full-text search across SEC EDGAR filings (10-K, 10-Q, 8-K, etc.). " +
    "Returns a markdown table of matching filings with company, form type, date, and link.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Full-text search query" },
      forms: {
        type: "array",
        items: { type: "string" },
        description: "Filter by form types (e.g., ['10-K', '10-Q', '8-K'])",
      },
      date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
      date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
      limit: { type: "number", description: "Max results (default 10, max 100)" },
    },
    required: ["query"],
  },
  layer: 2,
  sources: ["sec-edgar"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await secEdgarClient.searchFilings({
      query: input.query as string,
      forms: input.forms as string[] | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Company", "Form", "Filed", "Description", "CIK"];
    const rows = response.data.results.map((r) => [
      r.company.slice(0, 40),
      r.form_type,
      formatDate(r.filed_date),
      (r.description || "—").slice(0, 60),
      r.cik,
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = input.query as string;

    const citation = {
      id: `[SEC-FILINGS-${Date.now()}]`,
      source: "SEC EDGAR EFTS",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## SEC Filings: ${queryDesc}\n\n**${formatNumber(response.data.total)} filings found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── get_company_facts ───────────────────────────────────────

const getCompanyFacts: DataSourceTool = {
  name: "get_company_facts",
  description:
    "Retrieve XBRL financial facts for a company by CIK number. " +
    "Returns structured financial data including revenue, assets, liabilities, and other reported metrics.",
  inputSchema: {
    type: "object",
    properties: {
      cik: { type: "string", description: "SEC CIK number (e.g., '0000320193' for Apple)" },
      fact_namespace: {
        type: "string",
        description: "XBRL namespace to filter (e.g., 'us-gaap', 'dei')",
      },
      fact_name: {
        type: "string",
        description: "Fact name to filter by (e.g., 'Revenues', 'Assets')",
      },
    },
    required: ["cik"],
  },
  layer: 2,
  sources: ["sec-edgar"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await secEdgarClient.getCompanyFacts({
      cik: input.cik as string,
      factNamespace: input.fact_namespace as string | undefined,
      factName: input.fact_name as string | undefined,
    });

    const { company_name, cik, facts, total_facts } = response.data;

    const headers = ["Namespace", "Fact", "Label", "Units"];
    const rows = facts.slice(0, MAX_TABLE_ROWS_LAYER_2).map((f) => [
      f.namespace,
      f.fact_name.slice(0, 40),
      (f.label || "—").slice(0, 50),
      Object.keys(f.units).join(", ") || "—",
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, total_facts);
    const queryDesc = `${company_name} (CIK: ${cik})`;

    const citation = {
      id: `[SEC-FACTS-${Date.now()}]`,
      source: "SEC EDGAR XBRL",
      query: queryDesc,
      resultCount: total_facts,
    };

    return {
      content: `## XBRL Facts: ${queryDesc}\n\n**${formatNumber(total_facts)} facts found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: total_facts > 0 ? "HIGH" : "MEDIUM",
      truncated: facts.length > MAX_TABLE_ROWS_LAYER_2,
    };
  },
};

// ─── search_sec_companies ────────────────────────────────────

const searchSecCompanies: DataSourceTool = {
  name: "search_sec_companies",
  description:
    "Search for public companies by name or ticker symbol in the SEC EDGAR database. " +
    "Returns company name, CIK, and ticker. Use to look up a CIK before retrieving filings or facts.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Company name or ticker symbol to search for",
      },
    },
    required: ["query"],
  },
  layer: 2,
  sources: ["sec-edgar"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await secEdgarClient.searchCompany({
      query: input.query as string,
    });

    const headers = ["Company", "Ticker", "CIK"];
    const rows = response.data.results.map((r) => [
      r.company_name.slice(0, 50),
      r.ticker || "—",
      r.cik,
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = input.query as string;

    const citation = {
      id: `[SEC-COMPANY-${Date.now()}]`,
      source: "SEC EDGAR Tickers",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Company Search: ${queryDesc}\n\n**${formatNumber(response.data.total)} companies found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const secEdgarTools: DataSourceTool[] = [
  searchSecFilings,
  getCompanyFacts,
  searchSecCompanies,
];

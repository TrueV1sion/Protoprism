// src/lib/data-sources/tools/congress-gov.tools.ts
/**
 * Congress.gov Layer 2 Granular Tools
 *
 * 2 tools that wrap Congress.gov Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { congressGovClient } from "../clients/congress-gov";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
  dig,
} from "../format";

// ─── search_congress_bills ────────────────────────────────────

const searchCongressBills: DataSourceTool = {
  name: "search_congress_bills",
  description:
    "Search bills in the US Congress. Filter by keyword, congress number, bill type, " +
    "or date range. Returns a markdown table of matching bills with number, title, and status.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword search across bill titles and text" },
      congress: {
        type: "number",
        description: "Congress number (e.g., 118 for the 118th Congress, 2023-2024)",
      },
      bill_type: {
        type: "string",
        description: "Bill type: hr (House bill), s (Senate bill), hjres, sjres, hconres, sconres, hres, sres",
      },
      date_from: {
        type: "string",
        description: "Start datetime filter (ISO 8601, e.g., '2023-01-01T00:00:00Z')",
      },
      date_to: {
        type: "string",
        description: "End datetime filter (ISO 8601, e.g., '2024-12-31T23:59:59Z')",
      },
      limit: { type: "number", description: "Max results (default 20)" },
    },
  },
  layer: 2,
  sources: ["congress-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await congressGovClient.searchBills({
      query: input.query as string | undefined,
      congress: input.congress as number | undefined,
      billType: input.bill_type as string | undefined,
      fromDateTime: input.date_from as string | undefined,
      toDateTime: input.date_to as string | undefined,
      sort: "updateDate",
      limit: (input.limit as number | undefined) ?? 20,
    });

    const body = response.data.data as Record<string, unknown>;
    const bills = (body.bills as Array<Record<string, unknown>>) ?? [];
    const pagination = response.data.pagination;
    const total = pagination?.count ?? bills.length;

    const headers = ["Bill", "Title", "Congress", "Latest Action", "Updated"];
    const rows = bills.slice(0, MAX_TABLE_ROWS_LAYER_2).map((b) => [
      `${dig(b, "type")} ${dig(b, "number")}`.trim(),
      dig(b, "title").slice(0, 55),
      String(dig(b, "congress")),
      dig(b, "latestAction.text", "—").slice(0, 50),
      formatDate(dig(b, "updateDate", "—")),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, total);
    const queryDesc = (input.query as string) ?? `Congress ${input.congress ?? "all"}`;

    const citation = {
      id: `[CONGRESS-BILLS-${Date.now()}]`,
      source: "Congress.gov",
      query: queryDesc,
      resultCount: total,
    };

    return {
      content: `## Congressional Bills: ${queryDesc}\n\n**${formatNumber(total)} bills found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: bills.length > 0 ? "HIGH" : "MEDIUM",
      truncated: bills.length < total,
    };
  },
};

// ─── get_congress_bill ────────────────────────────────────────

const getCongressBill: DataSourceTool = {
  name: "get_congress_bill",
  description:
    "Retrieve full details for a specific Congressional bill by congress number, type, and bill number. " +
    "Returns title, sponsors, committees, latest actions, and bill text links.",
  inputSchema: {
    type: "object",
    properties: {
      congress: {
        type: "number",
        description: "Congress number (e.g., 118)",
      },
      bill_type: {
        type: "string",
        description: "Bill type: hr, s, hjres, sjres, hconres, sconres, hres, sres",
      },
      bill_number: {
        type: "number",
        description: "Bill number (e.g., 1234)",
      },
    },
    required: ["congress", "bill_type", "bill_number"],
  },
  layer: 2,
  sources: ["congress-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const congress = input.congress as number;
    const billType = input.bill_type as string;
    const billNumber = input.bill_number as number;

    const response = await congressGovClient.getBill(congress, billType, billNumber);

    const body = (response.data.data ?? {}) as Record<string, unknown>;
    const bill = (body.bill as Record<string, unknown>) ?? {};
    const queryDesc = `${congress}th Congress ${billType.toUpperCase()} ${billNumber}`;

    if (response.status === 404 || !body || Object.keys(bill).length === 0) {
      const citation = {
        id: `[CONGRESS-BILL-${Date.now()}]`,
        source: "Congress.gov",
        query: queryDesc,
        resultCount: 0,
      };
      return {
        content: `## Congressional Bill: ${queryDesc}\n\nBill not found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "LOW",
        truncated: false,
      };
    }

    const sections: string[] = [
      `### ${dig(bill, "type")} ${dig(bill, "number")}: ${dig(bill, "title")}`,
      `**Congress:** ${dig(bill, "congress")}`,
      `**Origin Chamber:** ${dig(bill, "originChamber", "—")}`,
      `**Introduced:** ${formatDate(dig(bill, "introducedDate", "—"))}`,
    ];

    const sponsor = bill.sponsors as Array<Record<string, string>> | undefined;
    if (sponsor?.length) {
      sections.push(
        `**Sponsor:** ${sponsor[0].firstName ?? ""} ${sponsor[0].lastName ?? ""} (${sponsor[0].party ?? "—"}-${sponsor[0].state ?? "—"})`,
      );
    }

    const latestAction = bill.latestAction as Record<string, string> | undefined;
    if (latestAction) {
      sections.push(`**Latest Action (${formatDate(latestAction.actionDate ?? "")}):** ${(latestAction.text ?? "—").slice(0, 200)}`);
    }

    const summary = bill.summary as Record<string, string> | undefined;
    if (summary?.text) {
      sections.push(`\n**Summary:** ${summary.text.slice(0, 600)}`);
    }

    const citation = {
      id: `[CONGRESS-BILL-${Date.now()}]`,
      source: "Congress.gov",
      query: queryDesc,
      resultCount: 1,
    };

    return {
      content: `## Congressional Bill: ${queryDesc}\n\n${sections.join("\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const congressGovTools: DataSourceTool[] = [
  searchCongressBills,
  getCongressBill,
];

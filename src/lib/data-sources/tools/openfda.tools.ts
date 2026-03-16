// src/lib/data-sources/tools/openfda.tools.ts
/**
 * openFDA Layer 2 Granular Tools
 *
 * 6 tools that wrap openFDA Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { openfdaClient } from "../clients/openfda";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
  dig,
} from "../format";

// ─── search_adverse_events ───────────────────────────────────

const searchAdverseEvents: DataSourceTool = {
  name: "search_adverse_events",
  description:
    "Search FDA adverse event reports (FAERS) by drug name, reaction, seriousness, or date range. " +
    "Returns markdown table of matching reports with reactions and outcomes.",
  inputSchema: {
    type: "object",
    properties: {
      drug_name: { type: "string", description: "Drug brand or generic name" },
      reaction: { type: "string", description: "Adverse reaction term (MedDRA preferred term)" },
      serious: { type: "boolean", description: "Filter to serious events only" },
      date_from: { type: "string", description: "Start date (YYYYMMDD)" },
      date_to: { type: "string", description: "End date (YYYYMMDD)" },
      limit: { type: "number", description: "Max results (default 10, max 100)" },
    },
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.searchAdverseEvents({
      drugName: input.drug_name as string | undefined,
      reaction: input.reaction as string | undefined,
      serious: input.serious as boolean | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Report ID", "Drug", "Reactions", "Serious", "Date"];
    const rows = response.data.results.map((r) => [
      dig(r, "safetyreportid"),
      dig(r, "patient.drug.0.openfda.brand_name.0", dig(r, "patient.drug.0.openfda.generic_name.0", "Unknown")),
      ((dig(r, "patient.reaction") === "—") ? "—" :
        (r.patient as Record<string, unknown>)?.reaction
          ? ((r.patient as Record<string, unknown>).reaction as Array<Record<string, string>>)
              .map((rx) => rx.reactionmeddrapt).slice(0, 3).join(", ")
          : "—"),
      (r as Record<string, unknown>).serious === 1 ? "Yes" : "No",
      formatDate(dig(r, "receivedate")),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = (input.drug_name as string) ?? (input.reaction as string) ?? "all";

    const citation = {
      id: `[FDA-AE-${Date.now()}]`,
      source: "openFDA FAERS",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Adverse Events: ${queryDesc}\n\n**${formatNumber(response.data.total)} reports found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── count_adverse_events ────────────────────────────────────

const countAdverseEvents: DataSourceTool = {
  name: "count_adverse_events",
  description:
    "Count adverse events by a specific field (e.g., patient.reaction.reactionmeddrapt). " +
    "Returns top values and their counts. Useful for identifying most common reactions.",
  inputSchema: {
    type: "object",
    properties: {
      field: { type: "string", description: "Field to count by (e.g., 'patient.reaction.reactionmeddrapt')" },
      drug_name: { type: "string", description: "Drug brand or generic name to filter by" },
      date_from: { type: "string", description: "Start date (YYYYMMDD)" },
      date_to: { type: "string", description: "End date (YYYYMMDD)" },
      limit: { type: "number", description: "Number of top values to return (default 10)" },
    },
    required: ["field"],
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.countAdverseEvents({
      field: input.field as string,
      drugName: input.drug_name as string | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Value", "Count"];
    const rows = response.data.results.map((r) => [
      String((r as Record<string, unknown>).term ?? "Unknown"),
      formatNumber((r as Record<string, unknown>).count as number ?? 0),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = (input.drug_name as string) ?? "all drugs";

    const citation = {
      id: `[FDA-AE-COUNT-${Date.now()}]`,
      source: "openFDA FAERS",
      query: `${input.field as string} for ${queryDesc}`,
      resultCount: response.data.total,
    };

    return {
      content: `## AE Counts by ${input.field as string}: ${queryDesc}\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── search_drug_labels ──────────────────────────────────────

const searchDrugLabels: DataSourceTool = {
  name: "search_drug_labels",
  description:
    "Search FDA drug labeling (SPL) by brand name, generic name, or manufacturer. " +
    "Returns indications, warnings, and contraindications in markdown.",
  inputSchema: {
    type: "object",
    properties: {
      brand_name: { type: "string", description: "Brand name (e.g., Humira)" },
      generic_name: { type: "string", description: "Generic name (e.g., adalimumab)" },
      manufacturer: { type: "string", description: "Manufacturer name" },
      query: { type: "string", description: "Free-text search across all label sections" },
      limit: { type: "number", description: "Max results (default 5)" },
    },
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.searchDrugLabels({
      brandName: input.brand_name as string | undefined,
      genericName: input.generic_name as string | undefined,
      manufacturer: input.manufacturer as string | undefined,
      query: input.query as string | undefined,
      limit: (input.limit as number | undefined) ?? 5,
    });

    const sections: string[] = [];
    for (const label of response.data.results) {
      const name = dig(label, "openfda.brand_name.0", dig(label, "openfda.generic_name.0", "Unknown"));
      const mfr = dig(label, "openfda.manufacturer_name.0");
      sections.push(`### ${name} (${mfr})`);

      const indications = dig(label, "indications_and_usage.0");
      if (indications !== "—") sections.push(`**Indications:** ${indications.slice(0, 500)}`);

      const warnings = dig(label, "warnings.0", dig(label, "boxed_warning.0"));
      if (warnings !== "—") sections.push(`**Warnings:** ${warnings.slice(0, 500)}`);

      const contraindications = dig(label, "contraindications.0");
      if (contraindications !== "—") sections.push(`**Contraindications:** ${contraindications.slice(0, 300)}`);
    }

    const queryDesc = (input.brand_name ?? input.generic_name ?? input.query ?? "all") as string;
    const citation = {
      id: `[FDA-LABEL-${Date.now()}]`,
      source: "openFDA Drug Labels",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## Drug Labels: ${queryDesc}\n\n${sections.join("\n\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── search_drug_recalls ─────────────────────────────────────

const searchDrugRecalls: DataSourceTool = {
  name: "search_drug_recalls",
  description:
    "Search FDA drug enforcement/recall data. Returns recall classification, reason, and status.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search" },
      classification: { type: "string", description: "Recall class: 'Class I', 'Class II', or 'Class III'" },
      status: { type: "string", description: "Recall status (e.g., 'Ongoing', 'Terminated')" },
      date_from: { type: "string", description: "Start date (YYYYMMDD)" },
      date_to: { type: "string", description: "End date (YYYYMMDD)" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.searchRecalls({
      query: input.query as string | undefined,
      classification: input.classification as string | undefined,
      status: input.status as string | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Date", "Classification", "Product", "Reason", "Status"];
    const rows = response.data.results.map((r) => [
      formatDate(dig(r, "report_date")),
      dig(r, "classification"),
      dig(r, "product_description").slice(0, 80),
      dig(r, "reason_for_recall").slice(0, 80),
      dig(r, "status"),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const citation = {
      id: `[FDA-RECALL-${Date.now()}]`,
      source: "openFDA Enforcement",
      query: (input.query as string) ?? "all",
      resultCount: response.data.total,
    };

    return {
      content: `## Drug Recalls\n\n**${formatNumber(response.data.total)} recalls found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── search_510k ─────────────────────────────────────────────

const search510k: DataSourceTool = {
  name: "search_510k",
  description:
    "Search FDA 510(k) premarket device clearance data. Returns device clearance decisions, applicants, and product codes.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search" },
      applicant: { type: "string", description: "Applicant/company name" },
      device_name: { type: "string", description: "Device name" },
      product_code: { type: "string", description: "FDA product code" },
      date_from: { type: "string", description: "Start date (YYYYMMDD)" },
      date_to: { type: "string", description: "End date (YYYYMMDD)" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.search510k({
      query: input.query as string | undefined,
      applicant: input.applicant as string | undefined,
      deviceName: input.device_name as string | undefined,
      productCode: input.product_code as string | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["510(k) #", "Device", "Applicant", "Decision", "Date"];
    const rows = response.data.results.map((r) => [
      dig(r, "k_number"),
      dig(r, "device_name").slice(0, 60),
      dig(r, "applicant").slice(0, 40),
      dig(r, "decision_code"),
      formatDate(dig(r, "decision_date")),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const citation = {
      id: `[FDA-510K-${Date.now()}]`,
      source: "openFDA 510(k)",
      query: (input.device_name ?? input.applicant ?? input.query ?? "all") as string,
      resultCount: response.data.total,
    };

    return {
      content: `## 510(k) Clearances\n\n**${formatNumber(response.data.total)} clearances found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── search_device_events ────────────────────────────────────

const searchDeviceEvents: DataSourceTool = {
  name: "search_device_events",
  description:
    "Search FDA medical device adverse event reports (MAUDE). Returns device problem reports, manufacturers, and event types.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search" },
      device_name: { type: "string", description: "Device generic name" },
      manufacturer: { type: "string", description: "Manufacturer name" },
      event_type: { type: "string", description: "Event type (e.g., 'Malfunction', 'Injury', 'Death')" },
      date_from: { type: "string", description: "Start date (YYYYMMDD)" },
      date_to: { type: "string", description: "End date (YYYYMMDD)" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
  },
  layer: 2,
  sources: ["openfda"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await openfdaClient.searchDeviceEvents({
      query: input.query as string | undefined,
      deviceName: input.device_name as string | undefined,
      manufacturer: input.manufacturer as string | undefined,
      eventType: input.event_type as string | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Report #", "Device", "Manufacturer", "Event Type", "Date"];
    const rows = response.data.results.map((r) => [
      dig(r, "mdr_report_key"),
      dig(r, "device.0.generic_name").slice(0, 50),
      dig(r, "device.0.manufacturer_d_name").slice(0, 40),
      dig(r, "event_type"),
      formatDate(dig(r, "date_received")),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const citation = {
      id: `[FDA-DEVICE-${Date.now()}]`,
      source: "openFDA MAUDE",
      query: (input.device_name ?? input.manufacturer ?? input.query ?? "all") as string,
      resultCount: response.data.total,
    };

    return {
      content: `## Device Event Reports\n\n**${formatNumber(response.data.total)} reports found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const openfdaTools: DataSourceTool[] = [
  searchAdverseEvents,
  countAdverseEvents,
  searchDrugLabels,
  searchDrugRecalls,
  search510k,
  searchDeviceEvents,
];

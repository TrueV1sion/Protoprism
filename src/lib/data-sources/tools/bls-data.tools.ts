// src/lib/data-sources/tools/bls-data.tools.ts
/**
 * Bureau of Labor Statistics Layer 2 Granular Tools
 *
 * 2 tools that wrap BLS Public Data API Layer 1 client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { blsDataClient } from "../clients/bls-data";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── Healthcare CPI Series Catalog ───────────────────────────
// Curated BLS series IDs for healthcare cost tracking

const HEALTHCARE_SERIES: Record<string, { id: string; label: string }> = {
  medical_care:         { id: "CUUR0000SAM",  label: "Medical Care (All Urban)" },
  hospital:             { id: "CUUR0000SAM2",  label: "Hospital & Related Services" },
  prescription_drugs:   { id: "CUUR0000SAM23", label: "Prescription Drugs" },
  health_insurance:     { id: "CUUR0000SAM24", label: "Health Insurance" },
  medical_supplies:     { id: "CUUR0000SAM3",  label: "Medical Supplies" },
  physician_services:   { id: "CUUR0000SAM21", label: "Physician Services" },
};

// ─── search_bls_series ────────────────────────────────────────

const searchBlsSeries: DataSourceTool = {
  name: "search_bls_series",
  description:
    "Fetch BLS time series data for one or more series IDs from the Bureau of Labor Statistics. " +
    "Returns annual or monthly values for the requested years. Useful for CPI, employment, and wage data.",
  inputSchema: {
    type: "object",
    properties: {
      series_ids: {
        type: "array",
        items: { type: "string" },
        description: "BLS series IDs to fetch (e.g., ['CUUR0000SAM', 'CUUR0000SA0'])",
      },
      start_year: { type: "number", description: "Start year (e.g., 2020)" },
      end_year: { type: "number", description: "End year (e.g., 2024)" },
      annual_average: {
        type: "boolean",
        description: "Include annual average values (default false)",
      },
    },
    required: ["series_ids", "start_year", "end_year"],
  },
  layer: 2,
  sources: ["bls"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const seriesIds = input.series_ids as string[];
    const startYear = input.start_year as number;
    const endYear = input.end_year as number;

    const response = await blsDataClient.getTimeSeries({
      seriesIds,
      startYear,
      endYear,
      annualAverage: input.annual_average as boolean | undefined,
    });

    const sections: string[] = [];

    for (const series of response.data.series) {
      const recentData = series.data.slice(0, MAX_TABLE_ROWS_LAYER_2);
      const headers = ["Year", "Period", "Value"];
      const rows = recentData.map((d) => [
        d.year,
        d.periodName || d.period,
        d.value,
      ]);

      sections.push(`### Series: ${series.seriesID}`);
      sections.push(markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, series.data.length));
    }

    const queryDesc = seriesIds.join(", ");
    const citation = {
      id: `[BLS-SERIES-${Date.now()}]`,
      source: "Bureau of Labor Statistics",
      query: queryDesc,
      dateRange: `${startYear}–${endYear}`,
      resultCount: response.data.series.reduce((acc, s) => acc + s.data.length, 0),
    };

    return {
      content: `## BLS Time Series: ${queryDesc} (${startYear}–${endYear})\n\n${sections.join("\n\n")}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.series.length > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── get_healthcare_cpi ───────────────────────────────────────

const getHealthcareCpi: DataSourceTool = {
  name: "get_healthcare_cpi",
  description:
    "Retrieve Consumer Price Index (CPI) data for healthcare categories from the Bureau of Labor Statistics. " +
    "Available categories: medical_care, hospital, prescription_drugs, health_insurance, medical_supplies, physician_services.",
  inputSchema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "string",
          enum: Object.keys(HEALTHCARE_SERIES),
        },
        description: "Healthcare CPI categories to retrieve. Defaults to all categories.",
      },
      start_year: { type: "number", description: "Start year (e.g., 2020). Defaults to 5 years ago." },
      end_year: { type: "number", description: "End year (e.g., 2024). Defaults to current year." },
    },
  },
  layer: 2,
  sources: ["bls"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const currentYear = new Date().getFullYear();
    const startYear = (input.start_year as number | undefined) ?? currentYear - 5;
    const endYear = (input.end_year as number | undefined) ?? currentYear;

    const requestedCategories = (input.categories as string[] | undefined) ?? Object.keys(HEALTHCARE_SERIES);
    const validCategories = requestedCategories.filter((c) => c in HEALTHCARE_SERIES);

    if (validCategories.length === 0) {
      const citation = {
        id: `[BLS-HCPI-${Date.now()}]`,
        source: "Bureau of Labor Statistics",
        query: "healthcare CPI",
        resultCount: 0,
      };
      return {
        content: `## Healthcare CPI\n\nNo valid categories specified. Available: ${Object.keys(HEALTHCARE_SERIES).join(", ")}\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: { queriedAt: new Date().toISOString(), source: "Bureau of Labor Statistics" },
        confidence: "LOW",
        truncated: false,
      };
    }

    const seriesIds = validCategories.map((c) => HEALTHCARE_SERIES[c].id);
    const seriesLabels: Record<string, string> = {};
    validCategories.forEach((c) => {
      seriesLabels[HEALTHCARE_SERIES[c].id] = HEALTHCARE_SERIES[c].label;
    });

    const response = await blsDataClient.getTimeSeries({
      seriesIds,
      startYear,
      endYear,
      annualAverage: true,
    });

    // Build a single consolidated table: one row per series showing most recent annual values
    const headers = ["Category", "Latest Year", "CPI Value", "Source Series"];
    const rows: string[][] = [];

    for (const series of response.data.series) {
      const annualData = series.data.filter((d) => d.period === "M13" || d.periodName === "Annual");
      const latest = annualData[0] ?? series.data[0];
      if (latest) {
        rows.push([
          seriesLabels[series.seriesID] ?? series.seriesID,
          latest.year,
          latest.value,
          series.seriesID,
        ]);
      }
    }

    const summaryTable = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, rows.length);

    // Also provide year-over-year table for the primary medical_care series
    const primarySeriesId = HEALTHCARE_SERIES["medical_care"].id;
    const primarySeries = response.data.series.find((s) => s.seriesID === primarySeriesId);
    let trendSection = "";
    if (primarySeries) {
      const trendHeaders = ["Year", "Period", "CPI Value"];
      const trendRows = primarySeries.data.slice(0, 10).map((d) => [
        d.year,
        d.periodName || d.period,
        d.value,
      ]);
      trendSection = `\n\n### Medical Care CPI Trend\n${markdownTable(trendHeaders, trendRows, 10, primarySeries.data.length)}`;
    }

    const queryDesc = `Healthcare CPI (${startYear}–${endYear})`;
    const citation = {
      id: `[BLS-HCPI-${Date.now()}]`,
      source: "Bureau of Labor Statistics",
      query: queryDesc,
      dateRange: `${startYear}–${endYear}`,
      resultCount: formatNumber(response.data.series.reduce((acc, s) => acc + s.data.length, 0)),
    };

    return {
      content: `## ${queryDesc}\n\n${summaryTable}${trendSection}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.series.length > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const blsDataTools: DataSourceTool[] = [
  searchBlsSeries,
  getHealthcareCpi,
];

// src/lib/data-sources/tools/who-gho.tools.ts
/**
 * WHO Global Health Observatory Layer 2 Granular Tools
 *
 * 2 tools that wrap WHO GHO Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { whoGhoClient } from "../clients/who-gho";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── search_who_indicators ────────────────────────────────────

const searchWhoIndicators: DataSourceTool = {
  name: "search_who_indicators",
  description:
    "Search available indicators in the WHO Global Health Observatory (GHO). " +
    "Returns a markdown table of matching indicator codes and names. " +
    "Use indicator codes with get_who_indicator_data to retrieve actual data.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "Keyword to search indicator names (e.g., 'mortality', 'diabetes', 'vaccination')",
      },
      limit: { type: "number", description: "Max results (default 20, max 100)" },
    },
  },
  layer: 2,
  sources: ["who-gho"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await whoGhoClient.listIndicators({
      keyword: input.keyword as string | undefined,
      limit: (input.limit as number | undefined) ?? 20,
    });

    const headers = ["Indicator Code", "Indicator Name"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((ind) => [
      ind.IndicatorCode,
      ind.IndicatorName.slice(0, 80),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.count);
    const queryDesc = (input.keyword as string) ?? "all indicators";

    const citation = {
      id: `[WHO-INDICATORS-${Date.now()}]`,
      source: "WHO Global Health Observatory",
      query: queryDesc,
      resultCount: response.data.count,
    };

    return {
      content: `## WHO Indicators: ${queryDesc}\n\n**${formatNumber(response.data.count)} indicators found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.count > 0 ? "HIGH" : "MEDIUM",
      truncated: response.data.results.length < response.data.count,
    };
  },
};

// ─── get_who_indicator_data ───────────────────────────────────

const getWhoIndicatorData: DataSourceTool = {
  name: "get_who_indicator_data",
  description:
    "Retrieve data for a specific WHO Global Health Observatory indicator. " +
    "Filter by country, year range, and sex. Returns a markdown table of data points " +
    "with country, year, and numeric values.",
  inputSchema: {
    type: "object",
    properties: {
      indicator_code: {
        type: "string",
        description: "WHO GHO indicator code (e.g., 'WHOSIS_000001' for life expectancy, 'NCD_BMI_MEAN' for BMI)",
      },
      country: {
        type: "string",
        description: "ISO 3-letter country code (e.g., 'USA', 'GBR', 'CHN'). Omit for all countries.",
      },
      year_from: { type: "number", description: "Start year (e.g., 2015)" },
      year_to: { type: "number", description: "End year (e.g., 2023)" },
      sex: {
        type: "string",
        description: "Sex filter: 'BTSX' (both), 'MLE' (male), 'FMLE' (female)",
      },
      limit: { type: "number", description: "Max data points (default 50)" },
    },
    required: ["indicator_code"],
  },
  layer: 2,
  sources: ["who-gho"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const indicatorCode = input.indicator_code as string;

    const response = await whoGhoClient.getIndicatorData({
      indicatorCode,
      country: input.country as string | undefined,
      yearFrom: input.year_from as number | undefined,
      yearTo: input.year_to as number | undefined,
      sex: input.sex as string | undefined,
      limit: (input.limit as number | undefined) ?? 50,
    });

    const dataPoints = response.data.results;

    const headers = ["Country", "Year", "Sex", "Value", "Low", "High"];
    const rows = dataPoints.slice(0, MAX_TABLE_ROWS_LAYER_2).map((dp) => [
      dp.SpatialDim ?? "—",
      String(dp.TimeDim ?? "—"),
      dp.Dim1 ?? "—",
      dp.Value ?? (dp.NumericValue !== null && dp.NumericValue !== undefined ? String(dp.NumericValue) : "—"),
      dp.Low !== null && dp.Low !== undefined ? String(dp.Low) : "—",
      dp.High !== null && dp.High !== undefined ? String(dp.High) : "—",
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.count);

    const geoDesc = (input.country as string) ?? "all countries";
    const yearRange = input.year_from || input.year_to
      ? ` (${input.year_from ?? ""}–${input.year_to ?? ""})`
      : "";
    const queryDesc = `${indicatorCode} — ${geoDesc}${yearRange}`;

    const citation = {
      id: `[WHO-DATA-${Date.now()}]`,
      source: "WHO Global Health Observatory",
      query: queryDesc,
      resultCount: response.data.count,
    };

    return {
      content: `## WHO Data: ${indicatorCode}\n\n**${formatNumber(response.data.count)} data points** — ${geoDesc}${yearRange}\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.count > 0 ? "HIGH" : "MEDIUM",
      truncated: dataPoints.length < response.data.count,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const whoGhoTools: DataSourceTool[] = [
  searchWhoIndicators,
  getWhoIndicatorData,
];

// src/lib/data-sources/tools/oecd-health.tools.ts
/**
 * OECD Health Statistics Layer 2 Granular Tools
 *
 * 2 tools that wrap OECD Health Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { oecdHealthClient } from "../clients/oecd-health";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── search_oecd_indicators ──────────────────────────────────

const searchOecdIndicators: DataSourceTool = {
  name: "search_oecd_indicators",
  description:
    "Search OECD Health Statistics for specific indicators such as life expectancy, physician density, " +
    "hospital beds, or health outcomes. Returns country-level time series data in a markdown table.",
  inputSchema: {
    type: "object",
    properties: {
      indicator: {
        type: "string",
        description: "Indicator to retrieve: 'life_expectancy', 'doctors', or a custom dataflow ID",
        enum: ["life_expectancy", "doctors"],
      },
      countries: {
        type: "array",
        items: { type: "string" },
        description: "ISO 3-letter country codes (e.g., ['USA','GBR','FRA']). Leave empty for all OECD members.",
      },
      start_year: { type: "number", description: "Start year for time series (e.g., 2015)" },
      end_year: { type: "number", description: "End year for time series (e.g., 2023)" },
    },
    required: ["indicator"],
  },
  layer: 2,
  sources: ["oecd-health"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const indicator = input.indicator as string;
    const countries = input.countries as string[] | undefined;
    const startYear = input.start_year as number | undefined;
    const endYear = input.end_year as number | undefined;

    let response;
    let indicatorLabel: string;

    if (indicator === "life_expectancy") {
      response = await oecdHealthClient.getLifeExpectancy({ countries, startYear, endYear });
      indicatorLabel = "Life Expectancy (Years)";
    } else if (indicator === "doctors") {
      response = await oecdHealthClient.getDoctors({ countries, startYear, endYear });
      indicatorLabel = "Physicians (Per 1,000 population)";
    } else {
      // Fallback: treat as a generic dataflow with the indicator as both IDs
      response = await oecdHealthClient.getHealthData({
        dataflowId: indicator,
        indicatorId: indicator,
        countries,
        startYear,
        endYear,
      });
      indicatorLabel = indicator;
    }

    const observations = response.data.observations;
    const headers = ["Country", "Year", "Value", "Unit"];
    const rows = observations.slice(0, MAX_TABLE_ROWS_LAYER_2).map((obs) => [
      obs.country,
      obs.year,
      obs.value !== null ? String(obs.value) : "—",
      obs.unit || response.data.unit,
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.totalObservations);
    const queryDesc = `${indicatorLabel}${countries ? ` — ${countries.join(", ")}` : " — all OECD"}`;

    const citation = {
      id: `[OECD-${Date.now()}]`,
      source: "OECD Health Statistics (SDMX)",
      query: queryDesc,
      resultCount: response.data.totalObservations,
    };

    return {
      content: `## OECD Health: ${queryDesc}\n\n**${formatNumber(response.data.totalObservations)} observations**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.totalObservations > 0 ? "HIGH" : "MEDIUM",
      truncated: observations.length < response.data.totalObservations,
    };
  },
};

// ─── get_oecd_health_expenditures ────────────────────────────

const getOecdHealthExpenditures: DataSourceTool = {
  name: "get_oecd_health_expenditures",
  description:
    "Get OECD health expenditure data as % of GDP for OECD member countries. " +
    "Useful for cross-country comparisons of healthcare spending and fiscal analysis.",
  inputSchema: {
    type: "object",
    properties: {
      countries: {
        type: "array",
        items: { type: "string" },
        description: "ISO 3-letter country codes (e.g., ['USA','GBR','DEU']). Leave empty for all OECD members.",
      },
      start_year: { type: "number", description: "Start year (e.g., 2015)" },
      end_year: { type: "number", description: "End year (e.g., 2023)" },
    },
  },
  layer: 2,
  sources: ["oecd-health"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const countries = input.countries as string[] | undefined;
    const startYear = input.start_year as number | undefined;
    const endYear = input.end_year as number | undefined;

    const response = await oecdHealthClient.getHealthExpenditures({ countries, startYear, endYear });

    const observations = response.data.observations;
    const headers = ["Country", "Year", "% GDP"];
    const rows = observations.slice(0, MAX_TABLE_ROWS_LAYER_2).map((obs) => [
      obs.country,
      obs.year,
      obs.value !== null ? `${obs.value}%` : "—",
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.totalObservations);
    const scope = countries ? countries.join(", ") : "all OECD members";
    const queryDesc = `Health Expenditure as % GDP — ${scope}`;

    const citation = {
      id: `[OECD-EXP-${Date.now()}]`,
      source: "OECD Health Statistics (SHA)",
      query: queryDesc,
      resultCount: response.data.totalObservations,
    };

    return {
      content: `## OECD Health Expenditures: ${scope}\n\n**${formatNumber(response.data.totalObservations)} observations**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.totalObservations > 0 ? "HIGH" : "MEDIUM",
      truncated: observations.length < response.data.totalObservations,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const oecdHealthTools: DataSourceTool[] = [
  searchOecdIndicators,
  getOecdHealthExpenditures,
];

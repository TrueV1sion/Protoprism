// src/lib/data-sources/tools/census-bureau.tools.ts
/**
 * Census Bureau Layer 2 Granular Tools
 *
 * 2 tools that wrap Census Bureau Layer 1 API client calls and return
 * markdown-formatted ToolResult responses.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { censusBureauClient } from "../clients/census-bureau";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── search_census_data ───────────────────────────────────────

const searchCensusData: DataSourceTool = {
  name: "search_census_data",
  description:
    "Query American Community Survey (ACS) data from the US Census Bureau. " +
    "Retrieve demographic, economic, or health variables for specified geographies. " +
    "Returns a markdown table of Census records.",
  inputSchema: {
    type: "object",
    properties: {
      year: { type: "number", description: "Survey year (e.g., 2022)" },
      variables: {
        type: "array",
        items: { type: "string" },
        description: "ACS variable codes to retrieve (e.g., ['B27001_001E', 'NAME'])",
      },
      geography: {
        type: "string",
        description: "Geography specification (e.g., 'state:*', 'county:*&in=state:06', 'us')",
      },
      dataset: {
        type: "string",
        description: "ACS dataset path (default: 'acs/acs5'). Options: acs/acs5, acs/acs1",
      },
    },
    required: ["year", "variables", "geography"],
  },
  layer: 2,
  sources: ["census-bureau"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const year = input.year as number;
    const variables = input.variables as string[];
    const geography = input.geography as string;
    const dataset = (input.dataset as string | undefined) ?? "acs/acs5";

    const response = await censusBureauClient.getAcsData({
      year,
      variables,
      geography,
      dataset,
    });

    const { headers, records, totalRecords } = response.data;

    const tableHeaders = headers.length > 0 ? headers : variables;
    const rows = records.slice(0, MAX_TABLE_ROWS_LAYER_2).map((rec) =>
      tableHeaders.map((h) => {
        const val = rec[h];
        if (val === null || val === undefined) return "—";
        if (typeof val === "number") return formatNumber(val);
        return String(val);
      }),
    );

    const table = markdownTable(tableHeaders, rows, MAX_TABLE_ROWS_LAYER_2, totalRecords);
    const queryDesc = `ACS ${dataset} (${year}) — ${variables.slice(0, 3).join(", ")}${variables.length > 3 ? "..." : ""}`;

    const citation = {
      id: `[CENSUS-ACS-${Date.now()}]`,
      source: "US Census Bureau ACS",
      query: queryDesc,
      resultCount: totalRecords,
    };

    return {
      content: `## Census Data: ${queryDesc}\n\n**${formatNumber(totalRecords)} records**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: totalRecords > 0 ? "HIGH" : "MEDIUM",
      truncated: records.length > MAX_TABLE_ROWS_LAYER_2,
    };
  },
};

// ─── get_health_insurance ────────────────────────────────────

const getHealthInsurance: DataSourceTool = {
  name: "get_health_insurance",
  description:
    "Retrieve Small Area Health Insurance Estimates (SAHIE) from the Census Bureau. " +
    "Returns insured/uninsured counts and percentages by state or county, optionally filtered by age and income category.",
  inputSchema: {
    type: "object",
    properties: {
      year: { type: "number", description: "Estimate year (e.g., 2022)" },
      state_fips: {
        type: "string",
        description: "Two-digit state FIPS code (e.g., '06' for California). Omit for all states.",
      },
      county_fips: {
        type: "string",
        description: "Three-digit county FIPS code (requires state_fips)",
      },
      age_category: {
        type: "string",
        description: "Age category code: 0=all ages, 1=under 65, 2=18-64, 3=40-64, 4=50-64, 5=17 and under",
      },
      income_category: {
        type: "string",
        description: "Income category (% of poverty level): 0=all, 1=<=200%, 2=<=250%, 3=<=138%, 4=<=400%, 5=138-400%",
      },
    },
  },
  layer: 2,
  sources: ["census-bureau"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await censusBureauClient.getSahieData({
      year: input.year as number | undefined,
      stateFips: input.state_fips as string | undefined,
      countyFips: input.county_fips as string | undefined,
      ageCat: input.age_category as string | undefined,
      incomeCat: input.income_category as string | undefined,
    });

    const { records, totalRecords } = response.data;

    // Readable column mapping for SAHIE variables
    const displayColumns = [
      { key: "NAME", label: "Area" },
      { key: "STABREV", label: "State" },
      { key: "NIC_PT", label: "Insured Count" },
      { key: "NUI_PT", label: "Uninsured Count" },
      { key: "PCTIC_PT", label: "% Insured" },
      { key: "PCTUI_PT", label: "% Uninsured" },
    ];

    const headers = displayColumns.map((c) => c.label);
    const rows = records.slice(0, MAX_TABLE_ROWS_LAYER_2).map((rec) =>
      displayColumns.map(({ key }) => {
        const val = rec[key];
        if (val === null || val === undefined) return "—";
        if (typeof val === "number") {
          // Percentages have decimal points
          return key.startsWith("PCT") ? `${val.toFixed(1)}%` : formatNumber(val);
        }
        return String(val);
      }),
    );

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, totalRecords);

    const geoDesc = input.state_fips
      ? input.county_fips
        ? `County ${input.county_fips as string}, State ${input.state_fips as string}`
        : `State FIPS ${input.state_fips as string}`
      : "All States";

    const queryDesc = `SAHIE Health Insurance Estimates — ${geoDesc}${input.year ? ` (${input.year as number})` : ""}`;
    const citation = {
      id: `[CENSUS-SAHIE-${Date.now()}]`,
      source: "US Census Bureau SAHIE",
      query: queryDesc,
      resultCount: totalRecords,
    };

    return {
      content: `## Health Insurance Estimates: ${geoDesc}\n\n**${formatNumber(totalRecords)} areas**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: totalRecords > 0 ? "HIGH" : "MEDIUM",
      truncated: records.length > MAX_TABLE_ROWS_LAYER_2,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const censusBureauTools: DataSourceTool[] = [
  searchCensusData,
  getHealthInsurance,
];

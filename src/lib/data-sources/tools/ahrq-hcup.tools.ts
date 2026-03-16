// src/lib/data-sources/tools/ahrq-hcup.tools.ts
/**
 * AHRQ HCUP Layer 2 Granular Tools
 *
 * 2 tools that wrap AHRQ HCUP Layer 1 client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { ahrqHcupClient } from "../clients/ahrq-hcup";
import type { HCUPDiagnosisStats, HCUPProcedureStats } from "../clients/ahrq-hcup";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── Helpers ─────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function isDiagnosisStats(data: HCUPDiagnosisStats | HCUPProcedureStats): data is HCUPDiagnosisStats {
  return "icd10_category" in data;
}

// ─── search_hcup_statistics ──────────────────────────────────

const searchHcupStatistics: DataSourceTool = {
  name: "search_hcup_statistics",
  description:
    "Search AHRQ HCUP (Healthcare Cost and Utilization Project) statistics for specific diagnoses or procedures. " +
    "Returns annual hospitalization volumes, aggregate costs, mean costs, mortality rates, and length of stay.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Condition or procedure to search (e.g., 'heart failure', 'hip replacement', 'sepsis')" },
      data_type: {
        type: "string",
        description: "Data type: 'inpatient', 'emergency', or 'all' (default: 'all')",
        enum: ["inpatient", "emergency", "all"],
      },
      limit: { type: "number", description: "Max results to return (default 10)" },
    },
    required: ["query"],
  },
  layer: 2,
  sources: ["ahrq-hcup"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await ahrqHcupClient.searchAll({
      query: input.query as string,
      dataType: input.data_type as "inpatient" | "emergency" | "all" | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    if (response.data.results.length === 0) {
      const citation = {
        id: `[HCUP-${Date.now()}]`,
        source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)",
        query: input.query as string,
        resultCount: 0,
      };
      return {
        content: `## HCUP Statistics: ${input.query as string}\n\nNo matching conditions or procedures found.\n\n${formatCitations([citation])}`,
        citations: [citation],
        vintage: response.vintage,
        confidence: "MEDIUM",
        truncated: false,
      };
    }

    const headers = ["Condition/Procedure", "Type", "Annual Cases", "Mean Cost", "Aggregate Cost"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((item) => {
      const d = item.data;
      const mortalityNote = isDiagnosisStats(d) && d.mortality_rate !== undefined
        ? ` (${(d.mortality_rate * 100).toFixed(1)}% mortality)`
        : "";
      return [
        d.name + mortalityNote,
        item.result_type.replace("_", " "),
        formatNumber(d.annual_discharges),
        formatCurrency(d.mean_cost),
        formatCurrency(d.aggregate_cost),
      ];
    });

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);

    const citation = {
      id: `[HCUP-${Date.now()}]`,
      source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)",
      query: response.data.query,
      resultCount: response.data.total,
    };

    return {
      content: `## HCUP Statistics: ${response.data.query}\n\n**${response.data.total} matching records** (data through 2021)\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── get_hcup_top_conditions ─────────────────────────────────

const getHcupTopConditions: DataSourceTool = {
  name: "get_hcup_top_conditions",
  description:
    "Get the top conditions or diagnoses from AHRQ HCUP ranked by hospitalization volume, aggregate cost, " +
    "mean cost, mortality rate, or length of stay. Useful for identifying high-burden conditions in U.S. hospitals or EDs.",
  inputSchema: {
    type: "object",
    properties: {
      ranked_by: {
        type: "string",
        description: "Ranking metric: 'hospitalizations', 'aggregate_cost', 'mean_cost', 'mortality', or 'los'",
        enum: ["hospitalizations", "aggregate_cost", "mean_cost", "mortality", "los"],
      },
      setting: {
        type: "string",
        description: "Care setting: 'inpatient' (hospital stays) or 'emergency' (ED visits)",
        enum: ["inpatient", "emergency"],
      },
      limit: { type: "number", description: "Number of top conditions to return (default 10, max 20)" },
    },
  },
  layer: 2,
  sources: ["ahrq-hcup"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const rankedBy = (input.ranked_by as "hospitalizations" | "aggregate_cost" | "mean_cost" | "mortality" | "los" | undefined) ?? "hospitalizations";
    const setting = (input.setting as "inpatient" | "emergency" | undefined) ?? "inpatient";
    const limit = (input.limit as number | undefined) ?? 10;

    const response = await ahrqHcupClient.getTopConditions({ rankedBy, setting, limit });

    const rankLabel: Record<string, string> = {
      hospitalizations: "Annual Cases",
      aggregate_cost: "Aggregate Cost",
      mean_cost: "Mean Cost",
      mortality: "Mortality Rate",
      los: "Mean LOS (days)",
    };

    const headers = ["#", "Condition", "ICD-10", "Annual Cases", rankLabel[rankedBy] ?? rankedBy];
    const rows = response.data.conditions.slice(0, MAX_TABLE_ROWS_LAYER_2).map((cond, idx) => {
      let rankValue: string;
      switch (rankedBy) {
        case "hospitalizations": rankValue = formatNumber(cond.annual_discharges); break;
        case "aggregate_cost": rankValue = formatCurrency(cond.aggregate_cost); break;
        case "mean_cost": rankValue = formatCurrency(cond.mean_cost); break;
        case "mortality": rankValue = cond.mortality_rate !== undefined ? `${(cond.mortality_rate * 100).toFixed(1)}%` : "—"; break;
        case "los": rankValue = cond.mean_los !== undefined ? `${cond.mean_los.toFixed(1)}` : "—"; break;
        default: rankValue = "—";
      }
      return [
        String(idx + 1),
        cond.name,
        cond.icd10_category,
        formatNumber(cond.annual_discharges),
        rankValue,
      ];
    });

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc = `Top ${limit} ${setting} conditions by ${rankedBy.replace("_", " ")}`;

    const citation = {
      id: `[HCUP-TOP-${Date.now()}]`,
      source: "AHRQ HCUP (NIS/NEDS Statistical Briefs)",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## HCUP Top Conditions: ${setting} by ${rankedBy.replace("_", " ")}\n\n**Data through 2021**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: "HIGH",
      truncated: false,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const ahrqHcupTools: DataSourceTool[] = [
  searchHcupStatistics,
  getHcupTopConditions,
];

/**
 * AHRQ HCUP MCP Server
 *
 * Provides AI agents with access to healthcare cost and utilization
 * statistics from AHRQ's Healthcare Cost and Utilization Project (HCUP).
 * Designed for the Protoprism healthcare AI research platform.
 *
 * Supports stdio (default) and streamable HTTP transports.
 * No API key required — uses curated embedded reference data from
 * HCUP Statistical Briefs and Fast Stats publications.
 *
 * Data covers:
 * - National Inpatient Sample (NIS) — hospital inpatient stays
 * - Nationwide Emergency Department Sample (NEDS) — ED visits
 * - Procedure-level statistics — common hospital procedures
 * - Cost trends — longitudinal healthcare spending data
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchAll,
  getDiagnosisByName,
  getProcedureByName,
  getCostTrends,
  getTopConditions,
  truncateResponse,
  getDataSourceInfo,
} from "./api-client.js";

import type {
  DiagnosisStats,
  ProcedureStats,
  TrendCategory,
  TrendMetric,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "ahrq-hcup",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Build a standard tool success response with truncation handling.
 */
function successResponse(data: unknown) {
  const serialized = JSON.stringify(data, null, 2);
  const { text, truncated } = truncateResponse(serialized);

  if (truncated) {
    return {
      content: [{ type: "text" as const, text }],
    };
  }

  return {
    content: [{ type: "text" as const, text: serialized }],
  };
}

/**
 * Build a standard tool error response.
 */
function errorResponse(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unknown error occurred",
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

/**
 * Format a diagnosis record for API output.
 */
function formatDiagnosis(d: DiagnosisStats) {
  return {
    name: d.name,
    icd10_category: d.icd10_category,
    setting: d.setting,
    year: d.year,
    annual_discharges: d.annual_discharges,
    mean_cost_usd: d.mean_cost,
    mean_length_of_stay_days: d.mean_los,
    in_hospital_mortality_pct: d.mortality_rate,
    aggregate_national_cost_usd: d.aggregate_cost,
    age_distribution_pct: d.age_distribution,
    payer_distribution_pct: d.payer_distribution,
    description: d.description,
  };
}

/**
 * Format a procedure record for API output.
 */
function formatProcedure(p: ProcedureStats) {
  return {
    name: p.name,
    icd10_pcs_category: p.icd10_pcs_category,
    year: p.year,
    annual_procedures: p.annual_procedures,
    mean_cost_usd: p.mean_cost,
    mean_length_of_stay_days: p.mean_los,
    aggregate_national_cost_usd: p.aggregate_cost,
    payer_distribution_pct: p.payer_distribution,
    description: p.description,
  };
}

// ─── Tool 1: Search Statistics ───────────────────────────────

server.registerTool(
  "hcup_search_statistics",
  {
    title: "Search HCUP Statistics",
    description:
      "Search HCUP statistical data by topic, diagnosis, or procedure. " +
      "Returns curated statistics from AHRQ's Healthcare Cost and Utilization Project " +
      "including hospitalizations, costs, length of stay, mortality, and payer distribution. " +
      "Covers inpatient stays, emergency department visits, and hospital procedures. " +
      "Data sourced from HCUP NIS (National Inpatient Sample) and NEDS (Nationwide Emergency Department Sample).",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Search query — condition name, procedure, diagnosis, or topic. " +
              "E.g., 'heart failure', 'hip replacement', 'diabetes', 'sepsis', 'chest pain'. " +
              "Supports common abbreviations like CHF, AMI, COPD, CABG, TKA.",
          ),
        data_type: z
          .enum(["inpatient", "emergency", "pediatric", "all"])
          .default("all")
          .describe(
            "Type of data to search: 'inpatient' (hospital stays from NIS), " +
              "'emergency' (ED visits from NEDS), 'pediatric' (pediatric stays), " +
              "or 'all' (search across all data types). Default: 'all'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of results to return (1-50, default 10)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const results = searchAll(args.query, args.data_type, args.limit);

      if (results.length === 0) {
        return successResponse({
          query: args.query,
          data_type: args.data_type,
          total: 0,
          message:
            "No matching statistics found. Try broader search terms or common condition names " +
            "(e.g., 'heart failure', 'pneumonia', 'knee replacement').",
          data_source: getDataSourceInfo().citation,
        });
      }

      const formattedResults = results.map((r) => {
        const base = {
          match_score: Math.round(r.score * 100) / 100,
          result_type: r.result_type,
        };

        if (r.result_type === "procedure") {
          return {
            ...base,
            ...formatProcedure(r.data as ProcedureStats),
          };
        } else {
          return {
            ...base,
            ...formatDiagnosis(r.data as DiagnosisStats),
          };
        }
      });

      return successResponse({
        query: args.query,
        data_type: args.data_type,
        total: formattedResults.length,
        results: formattedResults,
        data_source: getDataSourceInfo().citation,
        disclaimer: getDataSourceInfo().disclaimer,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 2: Get Diagnosis Stats ─────────────────────────────

server.registerTool(
  "hcup_get_diagnosis_stats",
  {
    title: "Get HCUP Diagnosis Statistics",
    description:
      "Get comprehensive statistics for a specific diagnosis by ICD-10 category or common name. " +
      "Returns number of hospitalizations, average charges, length of stay, in-hospital mortality, " +
      "age distribution, and payer mix. Searches both inpatient (NIS) and emergency (NEDS) data. " +
      "Includes data from HCUP Statistical Briefs.",
    inputSchema: z
      .object({
        diagnosis: z
          .string()
          .describe(
            "Diagnosis to look up — common name or ICD-10 category. " +
              "E.g., 'septicemia', 'pneumonia', 'heart failure', 'AMI', 'I50', 'A40-A41'. " +
              "Also accepts abbreviations: CHF, COPD, AKI, CVA, UTI, DKA.",
          ),
        year: z
          .number()
          .int()
          .min(2016)
          .max(2022)
          .optional()
          .describe(
            "Data year (2016-2022). Default: most recent available (2021). " +
              "Note: embedded data is primarily from 2021; trend data covers 2016-2022.",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const result = getDiagnosisByName(args.diagnosis);

      if (!result) {
        // Try a broader fuzzy search
        const searchResults = searchAll(args.diagnosis, "all", 5);
        const diagnosisResults = searchResults.filter(
          (r) =>
            r.result_type === "inpatient_diagnosis" ||
            r.result_type === "ed_diagnosis",
        );

        if (diagnosisResults.length > 0) {
          return successResponse({
            query: args.diagnosis,
            exact_match: false,
            message:
              "No exact match found. Here are the closest matching diagnoses:",
            suggestions: diagnosisResults.map((r) => ({
              name: (r.data as DiagnosisStats).name,
              setting: (r.data as DiagnosisStats).setting,
              match_score: Math.round(r.score * 100) / 100,
            })),
            data_source: getDataSourceInfo().citation,
          });
        }

        return successResponse({
          query: args.diagnosis,
          exact_match: false,
          message:
            "No matching diagnosis found. Available diagnoses include: " +
            "septicemia, osteoarthritis, heart failure, pneumonia, COPD, AMI, " +
            "diabetes, hip fracture, cellulitis, renal failure, UTI, stroke, " +
            "respiratory failure, mood disorders, back problems, appendicitis.",
          data_source: getDataSourceInfo().citation,
        });
      }

      const { data, setting } = result;

      // If a year was requested and it differs from the data year, note this
      const yearNote =
        args.year && args.year !== data.year
          ? `Requested year ${args.year}. Closest available data is from ${data.year}. ` +
            "Use hcup_cost_trends for year-over-year data."
          : null;

      return successResponse({
        query: args.diagnosis,
        exact_match: true,
        year_note: yearNote,
        diagnosis: formatDiagnosis(data),
        data_source: getDataSourceInfo().citation,
        disclaimer: getDataSourceInfo().disclaimer,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 3: Get Procedure Stats ─────────────────────────────

server.registerTool(
  "hcup_get_procedure_stats",
  {
    title: "Get HCUP Procedure Statistics",
    description:
      "Get statistics for a specific hospital procedure from HCUP data. " +
      "Returns number of procedures, average cost, length of stay, aggregate national cost, " +
      "and payer distribution. Based on National Inpatient Sample (NIS) data.",
    inputSchema: z
      .object({
        procedure: z
          .string()
          .describe(
            "Procedure to look up — common name or abbreviation. " +
              "E.g., 'knee replacement', 'CABG', 'cesarean section', 'spinal fusion', " +
              "'cholecystectomy', 'PCI', 'appendectomy', 'hip replacement'.",
          ),
        year: z
          .number()
          .int()
          .min(2016)
          .max(2022)
          .optional()
          .describe(
            "Data year (2016-2022). Default: most recent available (2021).",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const result = getProcedureByName(args.procedure);

      if (!result) {
        // Try a broader fuzzy search
        const searchResults = searchAll(args.procedure, "all", 5);
        const procedureResults = searchResults.filter(
          (r) => r.result_type === "procedure",
        );

        if (procedureResults.length > 0) {
          return successResponse({
            query: args.procedure,
            exact_match: false,
            message:
              "No exact match found. Here are the closest matching procedures:",
            suggestions: procedureResults.map((r) => ({
              name: (r.data as ProcedureStats).name,
              match_score: Math.round(r.score * 100) / 100,
            })),
            data_source: getDataSourceInfo().citation,
          });
        }

        return successResponse({
          query: args.procedure,
          exact_match: false,
          message:
            "No matching procedure found. Available procedures include: " +
            "knee replacement, hip replacement, CABG, PCI, cesarean section, " +
            "cholecystectomy, spinal fusion, appendectomy, colectomy, hysterectomy, " +
            "laminectomy, cardiac catheterization, pacemaker/defibrillator, hernia repair.",
          data_source: getDataSourceInfo().citation,
        });
      }

      const yearNote =
        args.year && args.year !== result.year
          ? `Requested year ${args.year}. Closest available data is from ${result.year}. ` +
            "Use hcup_cost_trends for year-over-year data."
          : null;

      return successResponse({
        query: args.procedure,
        exact_match: true,
        year_note: yearNote,
        procedure: formatProcedure(result),
        data_source: getDataSourceInfo().citation,
        disclaimer: getDataSourceInfo().disclaimer,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 4: Cost Trends ─────────────────────────────────────

const TREND_CATEGORIES: [TrendCategory, ...TrendCategory[]] = [
  "all_hospitalizations",
  "emergency_visits",
  "surgical",
  "maternal",
  "mental_health",
  "cardiovascular",
  "orthopedic",
];

const TREND_METRICS: [TrendMetric, ...TrendMetric[]] = [
  "aggregate_cost",
  "mean_cost",
  "stays",
  "los",
];

server.registerTool(
  "hcup_cost_trends",
  {
    title: "Get HCUP Cost Trends",
    description:
      "Get healthcare cost and utilization trend data across years (2016-2022). " +
      "Returns time-series data showing annual values and year-over-year changes " +
      "for aggregate costs, mean costs, number of stays/visits, and length of stay. " +
      "Covers major categories: all hospitalizations, emergency visits, surgical, " +
      "maternal, mental health, cardiovascular, and orthopedic. " +
      "Data from HCUP Fast Stats publications.",
    inputSchema: z
      .object({
        category: z
          .enum(TREND_CATEGORIES)
          .default("all_hospitalizations")
          .describe(
            "Category of healthcare data for trend analysis. Options: " +
              "'all_hospitalizations' (overall hospital inpatient), " +
              "'emergency_visits' (ED utilization), " +
              "'surgical' (operating room procedures), " +
              "'maternal' (childbirth/delivery), " +
              "'mental_health' (psychiatric/substance use), " +
              "'cardiovascular' (heart and vascular conditions), " +
              "'orthopedic' (bone/joint conditions and procedures). " +
              "Default: 'all_hospitalizations'.",
          ),
        metric: z
          .enum(TREND_METRICS)
          .default("aggregate_cost")
          .describe(
            "Metric to retrieve trends for. Options: " +
              "'aggregate_cost' (total national spending), " +
              "'mean_cost' (average cost per stay/visit), " +
              "'stays' (total number of stays/visits), " +
              "'los' (mean length of stay or ED duration). " +
              "Default: 'aggregate_cost'.",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const trendData = getCostTrends(args.category, args.metric);

      if (!trendData) {
        return successResponse({
          category: args.category,
          metric: args.metric,
          error: "No trend data available for this category/metric combination.",
          available_categories: TREND_CATEGORIES,
          available_metrics: TREND_METRICS,
        });
      }

      return successResponse({
        category: trendData.category,
        metric: trendData.metric,
        unit: trendData.unit,
        years_covered: `${trendData.data_points[0].year}-${trendData.data_points[trendData.data_points.length - 1].year}`,
        data_points: trendData.data_points.map((dp) => ({
          year: dp.year,
          value: dp.value,
          year_over_year_change_pct: dp.yoy_change,
        })),
        source_note: trendData.source_note,
        data_source: getDataSourceInfo().citation,
        disclaimer: getDataSourceInfo().disclaimer,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 5: Top Conditions ──────────────────────────────────

server.registerTool(
  "hcup_top_conditions",
  {
    title: "Get HCUP Top Conditions",
    description:
      "Get the top conditions ranked by hospitalizations, cost, mortality, or length of stay. " +
      "Returns a ranked list of conditions with comprehensive statistics including " +
      "number of discharges, mean cost, LOS, mortality rate, and payer distribution. " +
      "Useful for understanding which conditions drive the most healthcare utilization and spending.",
    inputSchema: z
      .object({
        ranked_by: z
          .enum([
            "hospitalizations",
            "aggregate_cost",
            "mean_cost",
            "mortality",
            "los",
          ])
          .default("hospitalizations")
          .describe(
            "Metric to rank conditions by. Options: " +
              "'hospitalizations' (total annual discharges — most common conditions), " +
              "'aggregate_cost' (total national spending — most expensive conditions overall), " +
              "'mean_cost' (average cost per stay — most expensive per case), " +
              "'mortality' (in-hospital mortality rate — deadliest conditions), " +
              "'los' (mean length of stay — longest hospitalizations). " +
              "Default: 'hospitalizations'.",
          ),
        setting: z
          .enum(["inpatient", "emergency"])
          .default("inpatient")
          .describe(
            "Healthcare setting: 'inpatient' (hospital stays from NIS) or " +
              "'emergency' (ED visits from NEDS). Default: 'inpatient'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(20)
          .describe("Number of top conditions to return (1-30, default 20)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      const topConditions = getTopConditions(
        args.ranked_by,
        args.setting,
        args.limit,
      );

      const rankLabel = {
        hospitalizations: "Annual Discharges (highest first)",
        aggregate_cost: "Total National Cost (highest first)",
        mean_cost: "Mean Cost per Stay (highest first)",
        mortality: "In-Hospital Mortality Rate (highest first)",
        los: "Mean Length of Stay (longest first)",
      }[args.ranked_by];

      return successResponse({
        ranked_by: args.ranked_by,
        rank_description: rankLabel,
        setting: args.setting,
        total: topConditions.length,
        conditions: topConditions.map((d, idx) => ({
          rank: idx + 1,
          ...formatDiagnosis(d),
        })),
        data_source: getDataSourceInfo().citation,
        disclaimer: getDataSourceInfo().disclaimer,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isHttp =
    args.includes("--http") ||
    process.env.TRANSPORT?.toLowerCase() === "http" ||
    process.env.TRANSPORT?.toLowerCase() === "streamable-http";

  if (isHttp) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const portFlag = args.indexOf("--port");
    const port =
      portFlag !== -1 && args[portFlag + 1]
        ? parseInt(args[portFlag + 1], 10)
        : parseInt(process.env.PORT ?? "3024", 10);

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", server: "ahrq-hcup-mcp" }),
        );
        return;
      }

      // MCP endpoint
      if (req.url === "/mcp" || req.url === "/") {
        const sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(sessionTransport);
        await sessionTransport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, () => {
      console.error(
        `[ahrq-hcup-mcp] HTTP server listening on port ${port}`,
      );
      console.error(
        `[ahrq-hcup-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[ahrq-hcup-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[ahrq-hcup-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[ahrq-hcup-mcp] Fatal error:", error);
  process.exit(1);
});

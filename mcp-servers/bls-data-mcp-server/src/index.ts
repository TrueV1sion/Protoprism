/**
 * BLS Data MCP Server
 *
 * Model Context Protocol server providing access to the Bureau of Labor
 * Statistics Public Data API v2. Focuses on healthcare economic indicators
 * for use by Protoprism AI agents (ANALYST-FINANCIAL, MACRO-CONTEXT,
 * ANALYST-STRATEGIC archetypes).
 *
 * Tools:
 *   1. bls_get_series       - Fetch raw time series data
 *   2. bls_search_series    - Search curated healthcare series catalog
 *   3. bls_get_healthcare_cpi - Healthcare CPI convenience wrapper
 *   4. bls_get_healthcare_employment - Healthcare employment convenience wrapper
 *   5. bls_compare_series   - Side-by-side series comparison
 *
 * Transports: stdio (default) or HTTP (--http flag)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { BLSApiClient } from "./api-client.js";
import type { BLSSeriesResult, BLSDataPoint } from "./api-client.js";
import {
  CHARACTER_LIMIT,
  HEALTHCARE_CPI_SERIES,
  HEALTHCARE_EMPLOYMENT_SERIES,
  HEALTHCARE_SERIES_CATALOG,
  BLS_SURVEYS,
  type BLSSurvey,
  type CatalogEntry,
} from "./constants.js";

// ─── Shared Client ───────────────────────────────────────────

const client = new BLSApiClient();

// ─── Helpers ─────────────────────────────────────────────────

/** Current year for default parameter values */
const currentYear = new Date().getFullYear();

/**
 * Truncate text output to CHARACTER_LIMIT, appending a warning if truncated.
 */
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const truncated = text.slice(0, CHARACTER_LIMIT - 100);
  return (
    truncated +
    "\n\n[OUTPUT TRUNCATED - Results exceeded character limit. Narrow your date range or request fewer series.]"
  );
}

/**
 * Format a single data point into a readable line.
 */
function formatDataPoint(dp: BLSDataPoint): string {
  let line = `  ${dp.year} ${dp.periodName}: ${dp.value}`;

  if (dp.calculations) {
    const nets = dp.calculations.net_changes;
    const pcts = dp.calculations.pct_changes;
    const parts: string[] = [];
    if (nets) {
      for (const [period, val] of Object.entries(nets)) {
        if (val && val !== "") parts.push(`net ${period}: ${val}`);
      }
    }
    if (pcts) {
      for (const [period, val] of Object.entries(pcts)) {
        if (val && val !== "") parts.push(`pct ${period}: ${val}%`);
      }
    }
    if (parts.length > 0) {
      line += ` (${parts.join(", ")})`;
    }
  }

  if (dp.footnotes?.length > 0) {
    const notes = dp.footnotes
      .filter((fn) => fn.text && fn.text.trim() !== "")
      .map((fn) => fn.text)
      .join("; ");
    if (notes) line += ` [${notes}]`;
  }

  return line;
}

/**
 * Format series results into human-readable text.
 */
function formatSeriesResults(series: BLSSeriesResult[]): string {
  const sections: string[] = [];

  for (const s of series) {
    const lines: string[] = [`Series: ${s.seriesID}`];
    lines.push(`Data points: ${s.data.length}`);
    lines.push("---");

    // BLS returns data in reverse chronological order; reverse for display
    const sorted = [...s.data].reverse();

    for (const dp of sorted) {
      lines.push(formatDataPoint(dp));
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Score how well a catalog entry matches a search query.
 * Returns 0 for no match, higher for better matches.
 */
function scoreCatalogEntry(entry: CatalogEntry, queryTokens: string[]): number {
  let score = 0;
  const nameL = entry.name.toLowerCase();
  const descL = entry.description.toLowerCase();

  for (const token of queryTokens) {
    // Exact keyword match (highest weight)
    if (entry.keywords.includes(token)) score += 10;
    // Name contains token
    if (nameL.includes(token)) score += 5;
    // Description contains token
    if (descL.includes(token)) score += 2;
  }

  return score;
}

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "bls-data-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool 1: bls_get_series ──────────────────────────────────

server.registerTool(
  "bls_get_series",
  {
    title: "Get BLS Time Series Data",
    description:
      "Fetch time series data from the Bureau of Labor Statistics API for one or more series IDs. " +
      "Returns periodic observations (monthly, quarterly, annual) with values and optional calculations " +
      "(net/percent changes). Use bls_search_series to discover series IDs if needed. " +
      "Rate limits: 25 requests/day without API key, 500/day with key.",
    inputSchema: z
      .object({
        series_ids: z
          .array(z.string())
          .min(1)
          .max(50)
          .describe(
            "BLS series IDs to fetch (e.g., ['CUUR0000SAM', 'CES6562000001']). Max 50 per request.",
          ),
        start_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("Start year for the data range (e.g., 2020)"),
        end_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("End year for the data range (e.g., 2024)"),
        calculations: z
          .boolean()
          .optional()
          .describe(
            "Include net and percent change calculations between periods. Default: false.",
          ),
        annual_average: z
          .boolean()
          .optional()
          .describe(
            "Include annual average values in addition to periodic data. Default: false.",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const results = await client.getTimeSeries({
        seriesIds: args.series_ids,
        startYear: args.start_year,
        endYear: args.end_year,
        calculations: args.calculations,
        annualAverage: args.annual_average,
      });

      const output = formatSeriesResults(results);

      const header =
        `BLS Time Series Data (${args.start_year}-${args.end_year})\n` +
        `Series requested: ${args.series_ids.join(", ")}\n` +
        `API key: ${client.hasApiKey() ? "configured" : "not set (limited to 25 req/day)"}\n` +
        `========================================\n\n`;

      return {
        content: [{ type: "text", text: truncate(header + output) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching BLS data: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: bls_search_series ───────────────────────────────

server.registerTool(
  "bls_search_series",
  {
    title: "Search BLS Series",
    description:
      "Search for BLS series by keyword from a curated catalog of healthcare-related economic indicators. " +
      "Returns matching series IDs with descriptions. The BLS API does not have a native search endpoint, " +
      "so this searches a curated mapping of ~30 healthcare-relevant series. " +
      "Use the returned series IDs with bls_get_series to fetch actual data.",
    inputSchema: z
      .object({
        query: z
          .string()
          .min(1)
          .describe(
            'Keyword search query (e.g., "healthcare employment", "hospital CPI", "pharmaceutical wages")',
          ),
        survey: z
          .enum(["CE", "CU", "LA", "SM", "WM", "PC"])
          .optional()
          .describe(
            "Optional BLS survey filter: CE=Employment, CU=CPI, LA=Unemployment, SM=State Employment, WM=Wages, PC=PPI",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async (args) => {
    try {
      // Tokenize query
      const queryTokens = args.query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);

      if (queryTokens.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Search query too short. Provide meaningful keywords like 'healthcare employment' or 'hospital CPI'.",
            },
          ],
          isError: true,
        };
      }

      // Filter by survey if specified
      let catalog = HEALTHCARE_SERIES_CATALOG;
      if (args.survey) {
        catalog = catalog.filter((entry) => entry.survey === args.survey);
      }

      // Score and rank
      const scored = catalog
        .map((entry) => ({
          entry,
          score: scoreCatalogEntry(entry, queryTokens),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        const surveyNote = args.survey
          ? ` in survey ${args.survey} (${BLS_SURVEYS[args.survey as BLSSurvey]})`
          : "";

        return {
          content: [
            {
              type: "text",
              text:
                `No matching series found for "${args.query}"${surveyNote}.\n\n` +
                "Try broader keywords like:\n" +
                "  - 'healthcare employment' or 'hospital jobs'\n" +
                "  - 'medical CPI' or 'drug prices'\n" +
                "  - 'hospital PPI' or 'physician price'\n" +
                "  - 'wages healthcare' or 'earnings hospital'\n\n" +
                "Available surveys: CE (Employment), CU (CPI), LA (Unemployment), PC (PPI)",
            },
          ],
        };
      }

      // Format results
      const lines: string[] = [
        `Search results for: "${args.query}"${args.survey ? ` (survey: ${args.survey})` : ""}`,
        `Found ${scored.length} matching series`,
        "========================================",
        "",
      ];

      for (const { entry, score } of scored) {
        lines.push(`Series ID: ${entry.seriesId}`);
        lines.push(`Name: ${entry.name}`);
        lines.push(`Description: ${entry.description}`);
        lines.push(`Survey: ${entry.survey} (${BLS_SURVEYS[entry.survey]})`);
        lines.push(`Relevance: ${score}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: truncate(lines.join("\n")) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching series: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 3: bls_get_healthcare_cpi ──────────────────────────

server.registerTool(
  "bls_get_healthcare_cpi",
  {
    title: "Get Healthcare CPI Data",
    description:
      "Get Consumer Price Index data for healthcare categories. Convenience tool that maps " +
      "healthcare categories to the correct BLS series IDs and includes net/percent change calculations. " +
      "Categories: medical_care (all), hospital, prescription_drugs, health_insurance, medical_supplies, physician_services. " +
      "If no category specified, returns the overall medical care CPI.",
    inputSchema: z
      .object({
        start_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("Start year (e.g., 2020)"),
        end_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("End year (e.g., 2024)"),
        category: z
          .enum([
            "medical_care",
            "hospital",
            "prescription_drugs",
            "health_insurance",
            "medical_supplies",
            "physician_services",
          ])
          .optional()
          .describe(
            'Healthcare CPI category. Defaults to "medical_care" (overall medical care index).',
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const category = args.category ?? "medical_care";
      const mapping = HEALTHCARE_CPI_SERIES[category];

      if (!mapping) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown CPI category: ${category}. Valid: ${Object.keys(HEALTHCARE_CPI_SERIES).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const results = await client.getTimeSeries({
        seriesIds: [mapping.seriesId],
        startYear: args.start_year,
        endYear: args.end_year,
        calculations: true,
      });

      const output = formatSeriesResults(results);

      const header =
        `Healthcare CPI: ${mapping.description}\n` +
        `Category: ${category}\n` +
        `Series ID: ${mapping.seriesId}\n` +
        `Period: ${args.start_year}-${args.end_year}\n` +
        `Includes: net and percent changes\n` +
        `========================================\n\n`;

      return {
        content: [{ type: "text", text: truncate(header + output) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching healthcare CPI: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 4: bls_get_healthcare_employment ───────────────────

server.registerTool(
  "bls_get_healthcare_employment",
  {
    title: "Get Healthcare Employment Data",
    description:
      "Get healthcare sector employment data from BLS Current Employment Statistics (CES). " +
      "Convenience tool mapping healthcare sectors to CES series IDs. Returns employment counts in thousands, " +
      "seasonally adjusted. Sectors: all_healthcare, hospitals, nursing_facilities, ambulatory, pharma_manufacturing, home_health. " +
      "If no sector specified, returns overall healthcare employment.",
    inputSchema: z
      .object({
        start_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("Start year (e.g., 2020)"),
        end_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("End year (e.g., 2024)"),
        sector: z
          .enum([
            "all_healthcare",
            "hospitals",
            "nursing_facilities",
            "ambulatory",
            "pharma_manufacturing",
            "home_health",
          ])
          .optional()
          .describe(
            'Healthcare employment sector. Defaults to "all_healthcare".',
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const sector = args.sector ?? "all_healthcare";
      const mapping = HEALTHCARE_EMPLOYMENT_SERIES[sector];

      if (!mapping) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown sector: ${sector}. Valid: ${Object.keys(HEALTHCARE_EMPLOYMENT_SERIES).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const results = await client.getTimeSeries({
        seriesIds: [mapping.seriesId],
        startYear: args.start_year,
        endYear: args.end_year,
        calculations: true,
      });

      const output = formatSeriesResults(results);

      const header =
        `Healthcare Employment: ${mapping.description}\n` +
        `Sector: ${sector}\n` +
        `Series ID: ${mapping.seriesId}\n` +
        `Period: ${args.start_year}-${args.end_year}\n` +
        `Units: thousands, seasonally adjusted\n` +
        `Includes: net and percent changes\n` +
        `========================================\n\n`;

      return {
        content: [{ type: "text", text: truncate(header + output) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching healthcare employment: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 5: bls_compare_series ──────────────────────────────

server.registerTool(
  "bls_compare_series",
  {
    title: "Compare BLS Series",
    description:
      "Compare multiple BLS time series side by side for a given date range. " +
      "Fetches 2-5 series and aligns them by time period for easy comparison. " +
      "Useful for comparing healthcare CPI vs general CPI, or employment across sectors. " +
      "Use bls_search_series to discover series IDs first.",
    inputSchema: z
      .object({
        series_ids: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe(
            "BLS series IDs to compare (2-5 series). Example: ['CUUR0000SAM', 'CUUR0000SA0'] to compare medical vs general CPI.",
          ),
        start_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("Start year (e.g., 2020)"),
        end_year: z
          .number()
          .int()
          .min(1913)
          .max(currentYear)
          .describe("End year (e.g., 2024)"),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const results = await client.getTimeSeries({
        seriesIds: args.series_ids,
        startYear: args.start_year,
        endYear: args.end_year,
        calculations: true,
      });

      // Build a comparison table keyed by year-period
      const allPeriods = new Map<
        string,
        Map<string, string>
      >();

      for (const series of results) {
        for (const dp of series.data) {
          const key = `${dp.year}-${dp.period}`;
          if (!allPeriods.has(key)) {
            allPeriods.set(key, new Map());
          }
          allPeriods.get(key)!.set(series.seriesID, dp.value);
        }
      }

      // Sort periods chronologically
      const sortedKeys = [...allPeriods.keys()].sort();

      // Build aligned table
      const seriesIds = results.map((r) => r.seriesID);
      const lines: string[] = [];

      // Header
      lines.push(
        `Comparison: ${args.start_year}-${args.end_year}`,
      );
      lines.push(`Series: ${seriesIds.join(" | ")}`);
      lines.push("========================================");
      lines.push("");

      // Column header
      const colWidth = 15;
      const periodCol = "Period".padEnd(12);
      const headerCols = seriesIds.map((id) =>
        id.length > colWidth ? id.slice(0, colWidth) : id.padEnd(colWidth),
      );
      lines.push(`${periodCol} ${headerCols.join(" ")}`);
      lines.push("-".repeat(12 + (colWidth + 1) * seriesIds.length));

      // Data rows
      for (const key of sortedKeys) {
        const periodValues = allPeriods.get(key)!;
        const periodLabel = key.padEnd(12);
        const values = seriesIds.map((id) => {
          const val = periodValues.get(id) ?? "-";
          return val.padEnd(colWidth);
        });
        lines.push(`${periodLabel} ${values.join(" ")}`);
      }

      // Summary stats per series
      lines.push("");
      lines.push("Summary Statistics");
      lines.push("------------------");

      for (const series of results) {
        const values = series.data
          .map((dp) => parseFloat(dp.value))
          .filter((v) => !isNaN(v));

        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const latest = values[0]; // BLS returns most recent first

          lines.push(`${series.seriesID}:`);
          lines.push(`  Min: ${min.toFixed(1)}, Max: ${max.toFixed(1)}, Avg: ${avg.toFixed(1)}, Latest: ${latest.toFixed(1)}`);
          lines.push(`  Observations: ${values.length}`);
        }
      }

      return {
        content: [{ type: "text", text: truncate(lines.join("\n")) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error comparing series: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Transport & Startup ─────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const useHttp = args.includes("--http");

  if (useHttp) {
    // HTTP transport via StreamableHTTP
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const { createServer } = await import("node:http");
    const { randomUUID } = await import("node:crypto");

    const PORT = parseInt(process.env.PORT ?? "3002", 10);

    const httpServer = createServer(async (req, res) => {
      // Health check
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            server: "bls-data-mcp-server",
            apiKey: client.hasApiKey() ? "configured" : "not set",
          }),
        );
        return;
      }

      // MCP endpoint
      if (req.url === "/mcp" || req.url === "/") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        await server.connect(transport);

        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(PORT, () => {
      console.error(
        `[bls-data-mcp-server] HTTP transport listening on port ${PORT}`,
      );
      console.error(
        `[bls-data-mcp-server] API key: ${client.hasApiKey() ? "configured" : "not set (limited to 25 req/day)"}`,
      );
    });
  } else {
    // Default: stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("[bls-data-mcp-server] Started on stdio transport");
    console.error(
      `[bls-data-mcp-server] API key: ${client.hasApiKey() ? "configured" : "not set (limited to 25 req/day)"}`,
    );
  }
}

main().catch((error) => {
  console.error("[bls-data-mcp-server] Fatal error:", error);
  process.exit(1);
});

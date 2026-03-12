/**
 * OECD Health Statistics MCP Server
 *
 * Provides AI agents with access to the OECD Health Statistics public API
 * for querying health expenditure, health status/outcomes, health resources,
 * and cross-country health system comparisons. Designed for the Protoprism
 * healthcare AI research platform.
 *
 * Used by agent archetypes: MACRO-CONTEXT, ANALYST-STRATEGIC, RESEARCHER-DATA
 *
 * Supports stdio (default) and streamable HTTP transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  fetchOECDData,
  truncateResponse,
} from "./api-client.js";
import {
  ALL_INDICATORS,
  INDICATOR_MAP,
  VALID_INDICATOR_IDS,
  VALID_COUNTRY_CODES,
  VALID_CATEGORIES,
  OECD_COUNTRIES,
  HEALTH_EXPENDITURE_INDICATORS,
  HEALTH_STATUS_INDICATORS,
  HEALTH_RESOURCES_INDICATORS,
  HEALTH_WORKFORCE_INDICATORS,
  PHARMA_INDICATORS,
  type IndicatorCategory,
} from "./constants.js";

// ── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "oecd-health",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ── Helper: Validate Countries ──────────────────────────────

function validateCountries(countries: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const c of countries) {
    const upper = c.toUpperCase();
    if (VALID_COUNTRY_CODES.includes(upper) || upper === "OECD") {
      valid.push(upper);
    } else {
      invalid.push(c);
    }
  }
  return { valid, invalid };
}

// ── Tool 1: Get Health Expenditure ──────────────────────────

server.registerTool(
  "oecd_get_health_expenditure",
  {
    title: "Get OECD Health Expenditure Data",
    description:
      "Get health spending data from the OECD System of Health Accounts (SHA) dataflow. " +
      "Returns time series with country, year, value, and unit. Filter by country (ISO3 codes), " +
      "measure type (per capita spending, percent of GDP, government share, out-of-pocket share), " +
      "and year range. Covers all 38 OECD member countries.",
    inputSchema: z
      .object({
        measure: z
          .enum([
            "health_exp_per_capita",
            "health_exp_gdp_share",
            "govt_health_exp_share",
            "oop_health_exp_share",
            "pharma_exp_per_capita",
          ])
          .describe(
            "The expenditure measure to retrieve:\n" +
              "- 'health_exp_per_capita': Total health spending per capita in USD PPP\n" +
              "- 'health_exp_gdp_share': Total health spending as % of GDP\n" +
              "- 'govt_health_exp_share': Government/compulsory share of health spending\n" +
              "- 'oop_health_exp_share': Out-of-pocket payments share\n" +
              "- 'pharma_exp_per_capita': Pharmaceutical spending per capita in USD PPP",
          ),
        countries: z
          .array(z.string())
          .default([])
          .describe(
            "ISO3 country codes to filter (e.g., ['USA', 'GBR', 'DEU']). " +
              "Empty array returns all OECD countries. Valid codes: " +
              VALID_COUNTRY_CODES.slice(0, 10).join(", ") +
              ", etc.",
          ),
        start_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("Start year for the time series (e.g., 2010)."),
        end_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("End year for the time series (e.g., 2023)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const indicator = INDICATOR_MAP[args.measure];
    if (!indicator) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `Unknown expenditure measure: ${args.measure}` },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const { valid, invalid } = validateCountries(args.countries);
    if (invalid.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Invalid country codes: ${invalid.join(", ")}. ` +
                  `Valid codes include: ${VALID_COUNTRY_CODES.slice(0, 15).join(", ")}, etc.`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await fetchOECDData(
        indicator,
        valid,
        args.start_year,
        args.end_year,
      );

      const responseText = JSON.stringify(result, null, 2);
      const { text, truncated } = truncateResponse(responseText);
      if (truncated) {
        result.truncated = true;
      }

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error fetching health expenditure data",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool 2: Get Health Status ───────────────────────────────

server.registerTool(
  "oecd_get_health_status",
  {
    title: "Get OECD Health Status Data",
    description:
      "Get health outcomes and status data from the OECD Health Status dataflow. " +
      "Includes life expectancy, infant mortality, avoidable mortality, obesity rates, " +
      "diabetes prevalence, and suicide rates. Returns time series with country, year, " +
      "value, and unit. Filter by indicator, country (ISO3), and year range.",
    inputSchema: z
      .object({
        indicator: z
          .enum([
            "life_exp_birth",
            "life_exp_65",
            "infant_mortality",
            "avoidable_mortality",
            "obesity_rate",
            "diabetes_prevalence",
            "suicide_rate",
          ])
          .describe(
            "The health status indicator to retrieve:\n" +
              "- 'life_exp_birth': Life expectancy at birth (years)\n" +
              "- 'life_exp_65': Life expectancy at age 65 (years)\n" +
              "- 'infant_mortality': Infant deaths per 1,000 live births\n" +
              "- 'avoidable_mortality': Avoidable mortality per 100,000 population\n" +
              "- 'obesity_rate': Measured obesity rate (% of adult population, BMI>=30)\n" +
              "- 'diabetes_prevalence': Diabetes prevalence (% of adults 20-79)\n" +
              "- 'suicide_rate': Suicide mortality per 100,000 population",
          ),
        countries: z
          .array(z.string())
          .default([])
          .describe(
            "ISO3 country codes to filter (e.g., ['USA', 'JPN', 'FRA']). " +
              "Empty array returns all OECD countries.",
          ),
        start_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("Start year for the time series (e.g., 2000)."),
        end_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("End year for the time series (e.g., 2023)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const indicatorDef = INDICATOR_MAP[args.indicator];
    if (!indicatorDef) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `Unknown health status indicator: ${args.indicator}` },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const { valid, invalid } = validateCountries(args.countries);
    if (invalid.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Invalid country codes: ${invalid.join(", ")}. ` +
                  `Valid codes include: ${VALID_COUNTRY_CODES.slice(0, 15).join(", ")}, etc.`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await fetchOECDData(
        indicatorDef,
        valid,
        args.start_year,
        args.end_year,
      );

      const responseText = JSON.stringify(result, null, 2);
      const { text, truncated } = truncateResponse(responseText);
      if (truncated) result.truncated = true;

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error fetching health status data",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool 3: Get Health Resources ────────────────────────────

server.registerTool(
  "oecd_get_health_resources",
  {
    title: "Get OECD Health Resources Data",
    description:
      "Get health system capacity and resource data from the OECD Health Resources dataflow. " +
      "Includes hospital beds, physicians, nurses, CT scanners, MRI scanners, and curative care beds. " +
      "Returns per-capita or per-1000 rates as time series. Filter by resource type, country (ISO3), " +
      "and year range.",
    inputSchema: z
      .object({
        resource_type: z
          .enum([
            "hospital_beds",
            "physicians",
            "nurses",
            "ct_scanners",
            "mri_scanners",
            "curative_beds",
          ])
          .describe(
            "The health resource indicator to retrieve:\n" +
              "- 'hospital_beds': Total hospital beds per 1,000 population\n" +
              "- 'physicians': Practising physicians per 1,000 population\n" +
              "- 'nurses': Practising nurses per 1,000 population\n" +
              "- 'ct_scanners': CT scanners per million population\n" +
              "- 'mri_scanners': MRI scanners per million population\n" +
              "- 'curative_beds': Curative (acute) care beds per 1,000 population",
          ),
        countries: z
          .array(z.string())
          .default([])
          .describe(
            "ISO3 country codes to filter (e.g., ['USA', 'DEU', 'JPN']). " +
              "Empty array returns all OECD countries.",
          ),
        start_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("Start year for the time series (e.g., 2010)."),
        end_year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .optional()
          .describe("End year for the time series (e.g., 2023)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const indicatorDef = INDICATOR_MAP[args.resource_type];
    if (!indicatorDef) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Unknown resource type: ${args.resource_type}`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const { valid, invalid } = validateCountries(args.countries);
    if (invalid.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Invalid country codes: ${invalid.join(", ")}. ` +
                  `Valid codes include: ${VALID_COUNTRY_CODES.slice(0, 15).join(", ")}, etc.`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await fetchOECDData(
        indicatorDef,
        valid,
        args.start_year,
        args.end_year,
      );

      const responseText = JSON.stringify(result, null, 2);
      const { text, truncated } = truncateResponse(responseText);
      if (truncated) result.truncated = true;

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error fetching health resources data",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool 4: Compare Countries ───────────────────────────────

server.registerTool(
  "oecd_compare_countries",
  {
    title: "Compare OECD Countries on Health Metric",
    description:
      "Compare a health metric across multiple OECD countries for a specific year. " +
      "Returns a ranked comparison table with values and the OECD average where available. " +
      "Great for benchmarking health system performance across countries. " +
      "Accepts any indicator ID from the OECD health indicator catalog.",
    inputSchema: z
      .object({
        indicator: z
          .string()
          .describe(
            "The indicator ID to compare. Use oecd_list_indicators to see available IDs. " +
              "Examples: 'life_exp_birth', 'health_exp_per_capita', 'hospital_beds', " +
              "'physicians', 'infant_mortality', 'obesity_rate'.",
          ),
        countries: z
          .array(z.string())
          .min(2)
          .describe(
            "List of ISO3 country codes to compare (minimum 2). " +
              "Examples: ['USA', 'GBR', 'DEU', 'FRA', 'JPN', 'CAN']. " +
              "Include 'OECD' for the OECD average.",
          ),
        year: z
          .number()
          .int()
          .min(1960)
          .max(2030)
          .describe(
            "The year to compare (e.g., 2022). Will return closest available year " +
              "if exact year is not available for all countries.",
          ),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const indicatorDef = INDICATOR_MAP[args.indicator];
    if (!indicatorDef) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Unknown indicator: '${args.indicator}'. ` +
                  `Use oecd_list_indicators to see available indicator IDs. ` +
                  `Examples: ${VALID_INDICATOR_IDS.slice(0, 5).join(", ")}`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const { valid, invalid } = validateCountries(args.countries);
    if (invalid.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Invalid country codes: ${invalid.join(", ")}. ` +
                  `Valid codes include: ${VALID_COUNTRY_CODES.slice(0, 15).join(", ")}, etc.`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    if (valid.length < 2) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "At least 2 valid country codes are required for comparison.",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    try {
      // Fetch data for a small window around the target year to handle data gaps
      const result = await fetchOECDData(
        indicatorDef,
        valid,
        args.year - 2,
        args.year,
      );

      // For each country, find the observation closest to the target year
      const countryLatest: Record<
        string,
        { country: string; countryCode: string; year: string; value: number | null }
      > = {};

      for (const obs of result.observations) {
        if (obs.value === null) continue;

        const existing = countryLatest[obs.countryCode];
        if (
          !existing ||
          Math.abs(parseInt(obs.year) - args.year) <
            Math.abs(parseInt(existing.year) - args.year)
        ) {
          countryLatest[obs.countryCode] = {
            country: obs.country,
            countryCode: obs.countryCode,
            year: obs.year,
            value: obs.value,
          };
        }
      }

      // Build ranked comparison
      const entries = Object.values(countryLatest);

      // Determine sort direction: some indicators are "lower is better"
      const lowerIsBetter = [
        "infant_mortality",
        "avoidable_mortality",
        "obesity_rate",
        "suicide_rate",
      ].includes(args.indicator);

      entries.sort((a, b) => {
        if (a.value === null && b.value === null) return 0;
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return lowerIsBetter ? a.value - b.value : b.value - a.value;
      });

      const comparison = {
        indicator: indicatorDef.id,
        indicatorName: indicatorDef.name,
        unit: indicatorDef.unit,
        targetYear: args.year,
        sortOrder: lowerIsBetter ? "ascending (lower is better)" : "descending (higher is better)",
        countriesCompared: entries.length,
        rankings: entries.map((entry, idx) => ({
          rank: idx + 1,
          country: entry.country,
          countryCode: entry.countryCode,
          value: entry.value,
          year: entry.year,
        })),
        countriesWithNoData: valid.filter((c) => !countryLatest[c]),
      };

      const responseText = JSON.stringify(comparison, null, 2);
      const { text } = truncateResponse(responseText);

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error comparing countries",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool 5: List Indicators ────────────────────────────────

server.registerTool(
  "oecd_list_indicators",
  {
    title: "List OECD Health Indicators",
    description:
      "List available OECD health indicators with descriptions, units, and IDs. " +
      "Filter by category to find specific types of indicators. Use the returned " +
      "indicator IDs with other OECD tools (oecd_get_health_expenditure, " +
      "oecd_get_health_status, oecd_get_health_resources, oecd_compare_countries).",
    inputSchema: z
      .object({
        category: z
          .enum(["expenditure", "status", "resources", "workforce", "pharma", "all"])
          .default("all")
          .describe(
            "Filter indicators by category:\n" +
              "- 'expenditure': Health spending metrics (per capita, % GDP, govt share)\n" +
              "- 'status': Health outcomes (life expectancy, mortality, disease prevalence)\n" +
              "- 'resources': Health system capacity (beds, physicians, nurses, equipment)\n" +
              "- 'workforce': Health workforce training (medical/nursing graduates)\n" +
              "- 'pharma': Pharmaceutical market (sales, generic market share)\n" +
              "- 'all': All available indicators",
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
    let indicators = ALL_INDICATORS;

    if (args.category !== "all") {
      indicators = ALL_INDICATORS.filter(
        (ind) => ind.category === args.category,
      );
    }

    const categoryGroups: Record<string, typeof indicators> = {};
    for (const ind of indicators) {
      if (!categoryGroups[ind.category]) {
        categoryGroups[ind.category] = [];
      }
      categoryGroups[ind.category].push(ind);
    }

    const response = {
      totalIndicators: indicators.length,
      categories: Object.entries(categoryGroups).map(([cat, inds]) => ({
        category: cat,
        count: inds.length,
        indicators: inds.map((ind) => ({
          id: ind.id,
          name: ind.name,
          description: ind.description,
          unit: ind.unit,
          dataflow: ind.dataflow,
          usageHint: getUsageHint(ind),
        })),
      })),
      availableCountries: Object.entries(OECD_COUNTRIES).map(
        ([code, name]) => ({ code, name }),
      ),
      usageNotes: [
        "Use indicator IDs with oecd_get_health_expenditure, oecd_get_health_status, oecd_get_health_resources, or oecd_compare_countries.",
        "Country codes are ISO 3166-1 alpha-3 (e.g., 'USA', 'GBR', 'DEU').",
        "Data availability varies by country and year. Recent years may have gaps.",
        "Use 'OECD' as a country code to get the OECD average where available.",
      ],
    };

    const responseText = JSON.stringify(response, null, 2);
    const { text } = truncateResponse(responseText);

    return {
      content: [{ type: "text" as const, text }],
    };
  },
);

function getUsageHint(ind: { id: string; category: string }): string {
  switch (ind.category) {
    case "expenditure":
      return `Use with oecd_get_health_expenditure(measure='${ind.id}')`;
    case "status":
      return `Use with oecd_get_health_status(indicator='${ind.id}')`;
    case "resources":
      return `Use with oecd_get_health_resources(resource_type='${ind.id}')`;
    default:
      return `Use with oecd_compare_countries(indicator='${ind.id}')`;
  }
}

// ── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  // Support both --http flag and TRANSPORT env var
  const args = process.argv.slice(2);
  const useHttp =
    args.includes("--http") ||
    process.env.TRANSPORT?.toLowerCase() === "http" ||
    process.env.TRANSPORT?.toLowerCase() === "streamable-http";

  if (useHttp) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    // Support --port flag or PORT env var, default 3020
    let port = 3020;
    const portFlagIdx = args.indexOf("--port");
    if (portFlagIdx >= 0 && args[portFlagIdx + 1]) {
      port = parseInt(args[portFlagIdx + 1], 10);
    } else if (process.env.PORT) {
      port = parseInt(process.env.PORT, 10);
    }

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", server: "oecd-health-mcp" }),
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
        `[oecd-health-mcp] HTTP server listening on port ${port}`,
      );
      console.error(
        `[oecd-health-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[oecd-health-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[oecd-health-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[oecd-health-mcp] Fatal error:", error);
  process.exit(1);
});

/**
 * Census Bureau MCP Server
 *
 * Provides tools for querying the US Census Bureau API, focused on
 * healthcare-relevant demographic and insurance data for the Protoprism
 * healthcare AI research platform.
 *
 * Target archetypes: MACRO-CONTEXT, ANALYST-STRATEGIC, RESEARCHER-DATA
 *
 * Supports both stdio and HTTP (SSE) transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { CensusApiClient } from "./api-client.js";
import {
  SERVER_NAME,
  SERVER_VERSION,
  DATASETS,
  AGE_GROUP_VARIABLES,
  HEALTH_INSURANCE_VARIABLES,
  SAHIE_AGE_MAP,
  SAHIE_INCOME_CATEGORIES,
  DEMOGRAPHIC_VARIABLES,
  HEALTHCARE_TABLES,
  FIPS_TO_STATE,
} from "./constants.js";

// ─── Validate API Key ───────────────────────────────────────

const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

if (!CENSUS_API_KEY) {
  console.error(
    "ERROR: CENSUS_API_KEY environment variable is required.\n" +
      "Get a free API key at: https://api.census.gov/data/key_signup.html\n" +
      "Then set: export CENSUS_API_KEY=your_key_here"
  );
  process.exit(1);
}

// ─── Initialize Client & Server ─────────────────────────────

const censusClient = new CensusApiClient({ apiKey: CENSUS_API_KEY });

const server = new McpServer(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Helper: format tool response ───────────────────────────

function toolResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
  };
}

function toolError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// ─── Tool 1: census_get_acs_data ────────────────────────────

server.registerTool(
  "census_get_acs_data",
  {
    title: "Get ACS Data",
    description:
      "Retrieve American Community Survey (ACS) data from the US Census Bureau. " +
      "Query specific variables by code for any geography level. " +
      "Healthcare-relevant tables include: B27001 (Health Insurance Coverage by Age), " +
      "B27010 (Types of Health Insurance), B19013 (Median Income), " +
      "B17001 (Poverty Status), B01001 (Age/Sex Distribution). " +
      "Variable codes end in 'E' for estimates, 'M' for margins of error.",
    inputSchema: z.object({
      year: z
        .number()
        .int()
        .min(2010)
        .max(2023)
        .describe("Survey year (2010-2023). ACS 5-year data is available from 2010, ACS 1-year from 2012."),
      variables: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe(
          'Census variable codes to retrieve. Examples: ["B27001_001E", "B27001_002E"]. ' +
          "Use census_list_variables to discover available codes."
        ),
      geography: z
        .string()
        .describe(
          'Geography specification. Examples: "us" (national), "state:*" (all states), ' +
          '"state:06" (California), "county:*&in=state:06" (all CA counties), ' +
          '"metropolitan statistical area/micropolitan statistical area:*" (all metro areas).'
        ),
      dataset: z
        .enum(["acs5", "acs1"])
        .default("acs5")
        .describe(
          "ACS dataset. 'acs5' = 5-year estimates (more geographic detail, recommended). " +
          "'acs1' = 1-year estimates (most recent, larger areas only)."
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const datasetPath =
        args.dataset === "acs1" ? DATASETS.ACS1 : DATASETS.ACS5;

      // Always include NAME for human-readable geography labels
      const variables = args.variables.includes("NAME")
        ? args.variables
        : ["NAME", ...args.variables];

      const result = await censusClient.getAcsData(
        args.year,
        variables,
        args.geography,
        datasetPath
      );

      return toolResult({
        dataset: `ACS ${args.dataset === "acs1" ? "1-Year" : "5-Year"} Estimates`,
        year: args.year,
        geography: args.geography,
        variablesRequested: args.variables,
        totalRecords: result.totalRecords,
        truncated: result.truncated,
        data: result.records,
      });
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

// ─── Tool 2: census_get_health_insurance ────────────────────

server.registerTool(
  "census_get_health_insurance",
  {
    title: "Get Health Insurance Coverage",
    description:
      "Convenience tool for health insurance coverage data from the ACS (table B27001). " +
      "Returns insured/uninsured counts and calculated rates by age group. " +
      "Useful for MACRO-CONTEXT analysis of coverage gaps and ANALYST-STRATEGIC market sizing.",
    inputSchema: z.object({
      year: z
        .number()
        .int()
        .min(2010)
        .max(2023)
        .describe("Survey year (2010-2023)."),
      state_fips: z
        .string()
        .length(2)
        .optional()
        .describe('2-digit state FIPS code. Example: "06" for California, "36" for New York. Omit for national data.'),
      county_fips: z
        .string()
        .length(3)
        .optional()
        .describe('3-digit county FIPS code (requires state_fips). Example: "037" for Los Angeles County.'),
      age_group: z
        .enum(["all", "under_19", "19_to_64", "65_plus"])
        .default("all")
        .describe(
          "Age group filter. 'all' = full population, 'under_19' = children, " +
          "'19_to_64' = working age, '65_plus' = Medicare-eligible."
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const ageConfig = AGE_GROUP_VARIABLES[args.age_group];
      if (!ageConfig) {
        return toolError(`Invalid age group: ${args.age_group}`);
      }

      // Collect all needed variables
      const allVars = [
        ...new Set([
          ...ageConfig.total,
          ...ageConfig.insured,
          ...ageConfig.uninsured,
        ]),
      ];

      // Build geography string
      let geography: string;
      if (args.county_fips && args.state_fips) {
        geography = `county:${args.county_fips}&in=state:${args.state_fips}`;
      } else if (args.state_fips) {
        geography = `state:${args.state_fips}`;
      } else {
        geography = "us";
      }

      const result = await censusClient.getAcsData(
        args.year,
        ["NAME", ...allVars],
        geography,
        DATASETS.ACS5
      );

      // Calculate insurance rates for each record
      const enrichedRecords = result.records.map((record) => {
        const totalPop = ageConfig.total.reduce(
          (sum, v) => sum + (typeof record[v] === "number" ? (record[v] as number) : 0),
          0
        );

        const insured = ageConfig.insured.reduce(
          (sum, v) => sum + (typeof record[v] === "number" ? (record[v] as number) : 0),
          0
        );

        const uninsured = ageConfig.uninsured.reduce(
          (sum, v) => sum + (typeof record[v] === "number" ? (record[v] as number) : 0),
          0
        );

        const insuredRate =
          totalPop > 0 ? Math.round((insured / totalPop) * 10000) / 100 : null;
        const uninsuredRate =
          totalPop > 0
            ? Math.round((uninsured / totalPop) * 10000) / 100
            : null;

        // Get geography identifiers
        const geoName = record.NAME ?? "Unknown";
        const state = record.state ?? null;
        const county = record.county ?? null;

        return {
          geography: geoName,
          state_fips: state,
          county_fips: county,
          age_group: args.age_group,
          total_population: totalPop,
          insured_count: insured,
          uninsured_count: uninsured,
          insured_rate_pct: insuredRate,
          uninsured_rate_pct: uninsuredRate,
        };
      });

      return toolResult({
        source: "ACS 5-Year Estimates, Table B27001",
        year: args.year,
        age_group: args.age_group,
        totalRecords: enrichedRecords.length,
        truncated: result.truncated,
        data: enrichedRecords,
      });
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

// ─── Tool 3: census_get_sahie ───────────────────────────────

server.registerTool(
  "census_get_sahie",
  {
    title: "Get SAHIE Data",
    description:
      "Retrieve Small Area Health Insurance Estimates (SAHIE) from the Census Bureau. " +
      "Provides modeled uninsured rates at the county level with demographic breakdowns " +
      "by age and income-to-poverty ratio. Ideal for RESEARCHER-DATA granular analysis " +
      "and MACRO-CONTEXT sub-state coverage assessment.",
    inputSchema: z.object({
      year: z
        .number()
        .int()
        .min(2006)
        .max(2022)
        .describe("Data year (2006-2022). SAHIE provides annual estimates."),
      state_fips: z
        .string()
        .length(2)
        .optional()
        .describe('2-digit state FIPS code. Example: "06" for California. Omit for all states.'),
      county_fips: z
        .string()
        .length(3)
        .optional()
        .describe('3-digit county FIPS code (requires state_fips). Example: "037" for Los Angeles County.'),
      age_group: z
        .enum(["0-64", "18-64", "40-64", "50-64", "under_19"])
        .optional()
        .describe(
          "Age group filter. '0-64' = under 65, '18-64' = working age adults, " +
          "'40-64' = older working age, '50-64' = pre-Medicare, 'under_19' = children."
        ),
      income_level: z
        .enum(["all", "below_200pct_fpl", "below_138pct_fpl", "below_400pct_fpl"])
        .optional()
        .describe(
          "Income-to-poverty ratio filter. 'all' = all income levels, " +
          "'below_138pct_fpl' = Medicaid expansion threshold, " +
          "'below_200pct_fpl' = CHIP eligibility range, " +
          "'below_400pct_fpl' = ACA marketplace subsidy threshold."
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const ageCat = args.age_group
        ? SAHIE_AGE_MAP[args.age_group]
        : undefined;
      const incomeCat = args.income_level
        ? SAHIE_INCOME_CATEGORIES[args.income_level]
        : undefined;

      const result = await censusClient.getSahieData({
        year: args.year,
        stateFips: args.state_fips,
        countyFips: args.county_fips,
        ageCat,
        incomeCat,
      });

      // Enrich records with human-readable labels
      const enrichedRecords = result.records.map((record) => {
        const stateAbbr =
          typeof record.STABREV === "string" ? record.STABREV : null;

        return {
          geography: record.NAME,
          state: stateAbbr,
          state_fips: record.state ?? null,
          county_fips: record.county ?? null,
          year: record.time ?? args.year,
          number_insured: record.NIC_PT,
          number_insured_moe: record.NIC_MOE,
          number_uninsured: record.NUI_PT,
          number_uninsured_moe: record.NUI_MOE,
          pct_insured: record.PCTIC_PT,
          pct_insured_moe: record.PCTIC_MOE,
          pct_uninsured: record.PCTUI_PT,
          pct_uninsured_moe: record.PCTUI_MOE,
          age_category: record.AGECAT,
          income_category: record.IPRCAT,
        };
      });

      return toolResult({
        source: "Small Area Health Insurance Estimates (SAHIE)",
        year: args.year,
        filters: {
          age_group: args.age_group ?? "not specified",
          income_level: args.income_level ?? "not specified",
        },
        totalRecords: enrichedRecords.length,
        truncated: result.truncated,
        data: enrichedRecords,
      });
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

// ─── Tool 4: census_get_demographics ────────────────────────

server.registerTool(
  "census_get_demographics",
  {
    title: "Get Demographics",
    description:
      "Convenience tool for common demographic data from the ACS. " +
      "Maps friendly metric names to Census variable codes. " +
      "Available metrics: population, age_distribution, median_income, poverty_rate, education. " +
      "For MACRO-CONTEXT socioeconomic profiling and ANALYST-STRATEGIC market analysis.",
    inputSchema: z.object({
      year: z
        .number()
        .int()
        .min(2010)
        .max(2023)
        .describe("Survey year (2010-2023)."),
      state_fips: z
        .string()
        .length(2)
        .optional()
        .describe('2-digit state FIPS code. Omit for national data. Example: "06" for California.'),
      variables: z
        .enum([
          "population",
          "age_distribution",
          "median_income",
          "poverty_rate",
          "education",
        ])
        .default("population")
        .describe(
          "Demographic metric to retrieve. 'population' = total count (B01001), " +
          "'age_distribution' = age/sex breakdown, 'median_income' = household income (B19013), " +
          "'poverty_rate' = poverty status (B17001), 'education' = educational attainment (B15003)."
        ),
      dataset: z
        .enum(["acs5", "acs1"])
        .default("acs5")
        .describe("ACS dataset. 'acs5' = 5-year (recommended), 'acs1' = 1-year."),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const demoConfig = DEMOGRAPHIC_VARIABLES[args.variables];
      if (!demoConfig) {
        return toolError(`Unknown demographic variable: ${args.variables}`);
      }

      // Build geography
      let geography: string;
      if (args.state_fips) {
        geography = `state:${args.state_fips}`;
      } else {
        geography = "us";
      }

      const datasetPath =
        args.dataset === "acs1" ? DATASETS.ACS1 : DATASETS.ACS5;

      const result = await censusClient.getAcsData(
        args.year,
        ["NAME", ...demoConfig.variables],
        geography,
        datasetPath
      );

      // Enrich records with human-readable labels
      const enrichedRecords = result.records.map((record) => {
        const labeled: Record<string, unknown> = {
          geography: record.NAME,
          state_fips: record.state ?? null,
        };

        for (const varCode of demoConfig.variables) {
          const label =
            demoConfig.labels[varCode] ?? varCode;
          labeled[label] = record[varCode];
        }

        // Calculate derived metrics
        if (args.variables === "poverty_rate") {
          const total =
            typeof record["B17001_001E"] === "number"
              ? record["B17001_001E"]
              : 0;
          const belowPoverty =
            typeof record["B17001_002E"] === "number"
              ? record["B17001_002E"]
              : 0;
          if (total > 0) {
            labeled["poverty_rate_pct"] =
              Math.round((belowPoverty / total) * 10000) / 100;
          }
        }

        return labeled;
      });

      return toolResult({
        source: `ACS ${args.dataset === "acs1" ? "1-Year" : "5-Year"} Estimates`,
        year: args.year,
        metric: args.variables,
        variableCodes: demoConfig.variables,
        variableLabels: demoConfig.labels,
        totalRecords: enrichedRecords.length,
        truncated: result.truncated,
        data: enrichedRecords,
      });
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

// ─── Tool 5: census_list_variables ──────────────────────────

server.registerTool(
  "census_list_variables",
  {
    title: "List Census Variables",
    description:
      "List available variable codes and descriptions for a Census dataset. " +
      "Optionally filter by table prefix to focus on specific topics. " +
      "Healthcare-relevant tables: " +
      Object.entries(HEALTHCARE_TABLES)
        .map(([code, desc]) => `${code} (${desc})`)
        .join(", ") +
      ". Use this tool to discover variable codes before calling census_get_acs_data.",
    inputSchema: z.object({
      year: z
        .number()
        .int()
        .min(2010)
        .max(2023)
        .describe("Dataset year."),
      dataset: z
        .enum(["acs5", "acs1", "sahie"])
        .describe("Census dataset to list variables for."),
      table_prefix: z
        .string()
        .optional()
        .describe(
          'Table prefix to filter variables. Example: "B27001" for health insurance coverage, ' +
          '"B19013" for median income, "B17001" for poverty. Omit for all variables (may be very large).'
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      let datasetStr: string;
      switch (args.dataset) {
        case "acs5":
          datasetStr = DATASETS.ACS5;
          break;
        case "acs1":
          datasetStr = DATASETS.ACS1;
          break;
        case "sahie":
          datasetStr = DATASETS.SAHIE;
          break;
        default:
          return toolError(`Unknown dataset: ${args.dataset}`);
      }

      const result = await censusClient.listVariables(
        args.year,
        datasetStr,
        args.table_prefix
      );

      return toolResult({
        dataset: args.dataset,
        year: args.year,
        table_prefix: args.table_prefix ?? "(all tables)",
        totalVariables: result.variables.length,
        truncated: result.truncated,
        healthcareTablesReference: HEALTHCARE_TABLES,
        variables: result.variables,
      });
    } catch (error) {
      return toolError(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);

// ─── Transport Setup ────────────────────────────────────────

async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

async function startHttpTransport(port: number): Promise<void> {
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (url.pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            server: SERVER_NAME,
            version: SERVER_VERSION,
          })
        );
        return;
      }

      // SSE endpoint - establishes the event stream
      if (url.pathname === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        sessions.set(transport.sessionId, transport);

        transport.onclose = () => {
          sessions.delete(transport.sessionId);
        };

        await server.connect(transport);
        return;
      }

      // Messages endpoint - receives client JSON-RPC messages
      if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
          return;
        }

        const transport = sessions.get(sessionId);
        if (!transport) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        await transport.handlePostMessage(req, res);
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(port, () => {
    console.error(
      `${SERVER_NAME} v${SERVER_VERSION} running on HTTP port ${port}`
    );
    console.error(`  SSE endpoint: http://localhost:${port}/sse`);
    console.error(`  Health check: http://localhost:${port}/health`);
  });
}

// ─── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--http")) {
    const portIdx = args.indexOf("--port");
    const port =
      portIdx !== -1 && args[portIdx + 1]
        ? parseInt(args[portIdx + 1], 10)
        : 3006;
    await startHttpTransport(port);
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

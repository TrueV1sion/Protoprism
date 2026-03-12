/**
 * openFDA MCP Server
 *
 * Provides AI agents with access to the openFDA public API for querying
 * drug labels, adverse events, recalls, 510(k) clearances, and device
 * adverse events. Designed for the Protoprism healthcare AI research platform.
 *
 * Supports stdio and streamable HTTP transports via the TRANSPORT env var.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  makeOpenFDARequest,
  buildSearchQuery,
  quoteValue,
  buildDateRange,
} from "./api-client.js";
import {
  ENDPOINTS,
  DEFAULT_LIMIT,
  DEFAULT_SKIP,
  MAX_RESULTS_PER_REQUEST,
  ADVERSE_EVENT_COUNT_FIELDS,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "openfda",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool: Search Drug Labels ────────────────────────────────

server.registerTool(
  "openfda_search_drug_labels",
  {
    title: "Search Drug Labels",
    description:
      "Search openFDA drug labeling (SPL) data. Returns structured product " +
      "labeling including indications and usage, warnings, dosage and " +
      "administration, contraindications, adverse reactions, drug interactions, " +
      "and more. Useful for regulatory analysis, drug safety research, and " +
      "clinical decision support.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Free-text search query across all drug label fields. " +
              "Use openFDA search syntax (e.g., 'indications_and_usage:diabetes').",
          ),
        brand_name: z
          .string()
          .optional()
          .describe(
            "Filter by brand name (e.g., 'Lipitor', 'Humira'). Case-insensitive.",
          ),
        generic_name: z
          .string()
          .optional()
          .describe(
            "Filter by generic/active ingredient name (e.g., 'atorvastatin', 'adalimumab').",
          ),
        manufacturer: z
          .string()
          .optional()
          .describe(
            "Filter by manufacturer/labeler name (e.g., 'Pfizer', 'AbbVie').",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_SKIP)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const clauses: string[] = [];

    if (args.query) {
      clauses.push(args.query);
    }
    if (args.brand_name) {
      clauses.push(`openfda.brand_name:${quoteValue(args.brand_name)}`);
    }
    if (args.generic_name) {
      clauses.push(`openfda.generic_name:${quoteValue(args.generic_name)}`);
    }
    if (args.manufacturer) {
      clauses.push(
        `openfda.manufacturer_name:${quoteValue(args.manufacturer)}`,
      );
    }

    const search = buildSearchQuery(clauses);
    if (!search) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  "At least one search parameter is required. Provide a query, brand_name, generic_name, or manufacturer.",
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
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DRUG_LABEL,
        search,
        limit: args.limit,
        skip: args.skip,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error searching drug labels",
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

// ─── Tool: Search Adverse Events ─────────────────────────────

server.registerTool(
  "openfda_search_adverse_events",
  {
    title: "Search Adverse Events",
    description:
      "Search openFDA FAERS (FDA Adverse Event Reporting System) data. " +
      "Returns individual adverse event reports including patient demographics, " +
      "reported reactions, suspect drugs, outcomes (hospitalization, death, etc.), " +
      "and reporter information. Essential for pharmacovigilance, safety signal " +
      "detection, and risk assessment.",
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search query across adverse event fields. " +
              "Use openFDA syntax (e.g., 'patient.drug.openfda.brand_name:aspirin').",
          ),
        drug_name: z
          .string()
          .optional()
          .describe(
            "Filter by drug brand or generic name. Searches both " +
              "brand_name and generic_name fields.",
          ),
        reaction: z
          .string()
          .optional()
          .describe(
            "Filter by adverse reaction term (MedDRA preferred term). " +
              "E.g., 'nausea', 'hepatotoxicity', 'rash'.",
          ),
        serious: z
          .boolean()
          .optional()
          .describe(
            "Filter for serious adverse events only (true) or non-serious (false). " +
              "Serious events include death, hospitalization, disability, or life-threatening outcomes.",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Start date for receive date range filter. Format: YYYYMMDD (e.g., '20230101').",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "End date for receive date range filter. Format: YYYYMMDD (e.g., '20231231').",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_SKIP)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const clauses: string[] = [];

    if (args.query) {
      clauses.push(args.query);
    }
    if (args.drug_name) {
      // Search across both brand and generic name fields
      const quoted = quoteValue(args.drug_name);
      clauses.push(
        `(patient.drug.openfda.brand_name:${quoted}+OR+patient.drug.openfda.generic_name:${quoted})`,
      );
    }
    if (args.reaction) {
      clauses.push(
        `patient.reaction.reactionmeddrapt:${quoteValue(args.reaction)}`,
      );
    }
    if (args.serious !== undefined) {
      clauses.push(`serious:${args.serious ? "1" : "2"}`);
    }

    const dateClause = buildDateRange(
      "receivedate",
      args.date_from,
      args.date_to,
    );
    if (dateClause) {
      clauses.push(dateClause);
    }

    try {
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DRUG_EVENT,
        search: buildSearchQuery(clauses),
        limit: args.limit,
        skip: args.skip,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error searching adverse events",
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

// ─── Tool: Count Adverse Events ──────────────────────────────

server.registerTool(
  "openfda_count_adverse_events",
  {
    title: "Count Adverse Events",
    description:
      "Aggregate and count adverse event reports by a specified field. " +
      "Returns frequency counts useful for trend analysis, signal detection, " +
      "and comparative safety profiling. For example, count the most common " +
      "reactions for a drug, or count events over time by receive date.",
    inputSchema: z
      .object({
        field: z
          .enum(ADVERSE_EVENT_COUNT_FIELDS)
          .describe(
            "The field to count/aggregate by. Common choices:\n" +
              "- 'patient.reaction.reactionmeddrapt.exact': Count by reaction type\n" +
              "- 'patient.drug.openfda.brand_name.exact': Count by drug brand name\n" +
              "- 'serious': Count by seriousness (1=serious, 2=not serious)\n" +
              "- 'receivedate': Count by date received (for time trends)\n" +
              "- 'patient.patientsex': Count by patient sex (0=unknown, 1=male, 2=female)",
          ),
        drug_name: z
          .string()
          .optional()
          .describe(
            "Optional: filter counts to a specific drug (brand or generic name).",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Optional: start date for filtering. Format: YYYYMMDD.",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "Optional: end date for filtering. Format: YYYYMMDD.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(DEFAULT_LIMIT)
          .describe(
            "Number of count buckets to return (1-1000, default 10). " +
              "For date fields, higher limits give more granular time series.",
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
    const clauses: string[] = [];

    if (args.drug_name) {
      const quoted = quoteValue(args.drug_name);
      clauses.push(
        `(patient.drug.openfda.brand_name:${quoted}+OR+patient.drug.openfda.generic_name:${quoted})`,
      );
    }

    const dateClause = buildDateRange(
      "receivedate",
      args.date_from,
      args.date_to,
    );
    if (dateClause) {
      clauses.push(dateClause);
    }

    try {
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DRUG_EVENT,
        search: buildSearchQuery(clauses),
        count: args.field,
        limit: args.limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error counting adverse events",
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

// ─── Tool: Search Drug Recalls ───────────────────────────────

server.registerTool(
  "openfda_search_drug_recalls",
  {
    title: "Search Drug Recalls",
    description:
      "Search openFDA drug enforcement/recall reports. Returns recall details " +
      "including reason for recall, distribution pattern, product description, " +
      "recall classification (Class I/II/III), and current status. Critical for " +
      "regulatory monitoring and risk assessment.",
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search across recall fields. " +
              "E.g., 'reason_for_recall:contamination' or 'product_description:tablet'.",
          ),
        classification: z
          .enum(["Class I", "Class II", "Class III"])
          .optional()
          .describe(
            "Filter by recall classification:\n" +
              "- 'Class I': Dangerous or defective, reasonable probability of serious health consequences or death\n" +
              "- 'Class II': May cause temporary or reversible adverse health consequences\n" +
              "- 'Class III': Not likely to cause adverse health consequences",
          ),
        status: z
          .string()
          .optional()
          .describe(
            "Filter by recall status (e.g., 'Ongoing', 'Completed', 'Terminated').",
          ),
        reason: z
          .string()
          .optional()
          .describe(
            "Search within reason_for_recall field (e.g., 'contamination', " +
              "'mislabeled', 'impurity', 'CGMP').",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Start date for report_date range filter. Format: YYYYMMDD.",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "End date for report_date range filter. Format: YYYYMMDD.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_SKIP)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const clauses: string[] = [];

    if (args.query) {
      clauses.push(args.query);
    }
    if (args.classification) {
      clauses.push(`classification:${quoteValue(args.classification)}`);
    }
    if (args.status) {
      clauses.push(`status:${quoteValue(args.status)}`);
    }
    if (args.reason) {
      clauses.push(`reason_for_recall:${quoteValue(args.reason)}`);
    }

    const dateClause = buildDateRange(
      "report_date",
      args.date_from,
      args.date_to,
    );
    if (dateClause) {
      clauses.push(dateClause);
    }

    try {
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DRUG_ENFORCEMENT,
        search: buildSearchQuery(clauses),
        limit: args.limit,
        skip: args.skip,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error searching drug recalls",
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

// ─── Tool: Search 510(k) Clearances ──────────────────────────

server.registerTool(
  "openfda_search_510k",
  {
    title: "Search 510(k) Premarket Notifications",
    description:
      "Search openFDA 510(k) premarket notification data. Returns device " +
      "clearance details including applicant, device name, predicate device, " +
      "product code, decision, decision date, and review panel. Useful for " +
      "competitive intelligence, regulatory pathway analysis, and device " +
      "market research.",
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search across 510(k) fields. " +
              "E.g., 'statement_or_summary:artificial+intelligence'.",
          ),
        applicant: z
          .string()
          .optional()
          .describe(
            "Filter by applicant/company name (e.g., 'Medtronic', 'Boston Scientific').",
          ),
        device_name: z
          .string()
          .optional()
          .describe(
            "Filter by device name (e.g., 'infusion pump', 'stent', 'catheter').",
          ),
        decision: z
          .string()
          .optional()
          .describe(
            "Filter by decision code. Common values: 'SESE' (substantially equivalent), " +
              "'SESP' (substantially equivalent with post-market conditions), " +
              "'SENE' (not substantially equivalent).",
          ),
        product_code: z
          .string()
          .optional()
          .describe(
            "Filter by FDA product code (3-letter code, e.g., 'DXN', 'QAS').",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Start date for decision_date range. Format: YYYYMMDD.",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "End date for decision_date range. Format: YYYYMMDD.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_SKIP)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const clauses: string[] = [];

    if (args.query) {
      clauses.push(args.query);
    }
    if (args.applicant) {
      clauses.push(`applicant:${quoteValue(args.applicant)}`);
    }
    if (args.device_name) {
      clauses.push(`device_name:${quoteValue(args.device_name)}`);
    }
    if (args.decision) {
      clauses.push(`decision_code:${quoteValue(args.decision)}`);
    }
    if (args.product_code) {
      clauses.push(`product_code:${quoteValue(args.product_code)}`);
    }

    const dateClause = buildDateRange(
      "decision_date",
      args.date_from,
      args.date_to,
    );
    if (dateClause) {
      clauses.push(dateClause);
    }

    try {
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DEVICE_510K,
        search: buildSearchQuery(clauses),
        limit: args.limit,
        skip: args.skip,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error searching 510(k) data",
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

// ─── Tool: Search Device Adverse Events ──────────────────────

server.registerTool(
  "openfda_search_device_events",
  {
    title: "Search Device Adverse Events",
    description:
      "Search openFDA MAUDE (Manufacturer and User Facility Device Experience) " +
      "database. Returns medical device adverse event reports including device " +
      "details, event description, patient outcomes, and manufacturer narrative. " +
      "Critical for device safety surveillance, post-market monitoring, and " +
      "competitive risk analysis.",
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search across device event fields. " +
              "E.g., 'mdr_text.text:malfunction'.",
          ),
        device_name: z
          .string()
          .optional()
          .describe(
            "Filter by device generic name " +
              "(e.g., 'infusion pump', 'hip prosthesis', 'pacemaker').",
          ),
        manufacturer: z
          .string()
          .optional()
          .describe(
            "Filter by device manufacturer name (e.g., 'Medtronic', 'Stryker').",
          ),
        event_type: z
          .string()
          .optional()
          .describe(
            "Filter by event type. Values: 'Malfunction', 'Injury', 'Death', 'Other', " +
              "'No answer provided'.",
          ),
        product_code: z
          .string()
          .optional()
          .describe(
            "Filter by FDA product code (3-letter code).",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Start date for date_received range. Format: YYYYMMDD.",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "End date for date_received range. Format: YYYYMMDD.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS_PER_REQUEST)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        skip: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_SKIP)
          .describe("Number of results to skip for pagination (default 0)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    const clauses: string[] = [];

    if (args.query) {
      clauses.push(args.query);
    }
    if (args.device_name) {
      clauses.push(
        `device.generic_name:${quoteValue(args.device_name)}`,
      );
    }
    if (args.manufacturer) {
      clauses.push(
        `device.manufacturer_d_name:${quoteValue(args.manufacturer)}`,
      );
    }
    if (args.event_type) {
      clauses.push(`event_type:${quoteValue(args.event_type)}`);
    }
    if (args.product_code) {
      clauses.push(`device.device_report_product_code:${quoteValue(args.product_code)}`);
    }

    const dateClause = buildDateRange(
      "date_received",
      args.date_from,
      args.date_to,
    );
    if (dateClause) {
      clauses.push(dateClause);
    }

    try {
      const result = await makeOpenFDARequest({
        endpoint: ENDPOINTS.DEVICE_EVENT,
        search: buildSearchQuery(clauses),
        limit: args.limit,
        skip: args.skip,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
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
                    : "Unknown error searching device events",
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

// ─── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  const transport = process.env.TRANSPORT?.toLowerCase();

  if (transport === "http" || transport === "streamable-http") {
    // Dynamic import to avoid pulling in HTTP dependencies when using stdio
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const port = parseInt(process.env.PORT ?? "3001", 10);

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "openfda-mcp" }));
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
      console.error(`[openfda-mcp] HTTP server listening on port ${port}`);
      console.error(
        `[openfda-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[openfda-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[openfda-mcp] Fatal error:", error);
  process.exit(1);
});

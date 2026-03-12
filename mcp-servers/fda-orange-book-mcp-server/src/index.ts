/**
 * FDA Orange Book MCP Server
 *
 * Provides AI agents with access to FDA Orange Book data via the openFDA
 * drugsfda API endpoint. Includes tools for searching approved drug products,
 * querying patent and exclusivity data, and therapeutic equivalence evaluations.
 *
 * Supports stdio and streamable HTTP transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  makeRequest,
  quoteValue,
  buildSearchQuery,
  extractDrugSummary,
  extractPatentInfo,
  extractTEData,
  extractExclusivityData,
} from "./api-client.js";
import type { DrugsFDAResult } from "./api-client.js";
import { MAX_LIMIT, DEFAULT_LIMIT } from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "fda-orange-book",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool 1: Search Drugs ────────────────────────────────────

server.registerTool(
  "orange_book_search_drugs",
  {
    title: "Search Orange Book Drugs",
    description:
      "Search FDA Orange Book approved drug products by brand name, generic name, " +
      "or active ingredient. Returns application number, brand/generic name, " +
      "dosage form, route, sponsor, approval date, and marketing status. " +
      "Useful for drug discovery research, competitive landscape analysis, " +
      "and regulatory intelligence.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "The drug name or ingredient to search for. " +
              "Examples: 'Lipitor', 'metformin', 'atorvastatin calcium'.",
          ),
        search_field: z
          .enum(["brand_name", "generic_name", "active_ingredient"])
          .default("brand_name")
          .describe(
            "Which field to search:\n" +
              "- 'brand_name': Search by brand/trade name (default)\n" +
              "- 'generic_name': Search by generic/INN name\n" +
              "- 'active_ingredient': Search by active ingredient/substance name",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const fieldMap: Record<string, string> = {
        brand_name: "openfda.brand_name",
        generic_name: "openfda.generic_name",
        active_ingredient: "openfda.substance_name",
      };

      const field = fieldMap[args.search_field];
      const search = `${field}:${quoteValue(args.query)}`;

      const result = await makeRequest({
        search,
        limit: args.limit,
      });

      // Extract summaries for each result
      const drugResults = result.results as DrugsFDAResult[];
      const summaries = drugResults.map(extractDrugSummary);

      const output = {
        total: result.total,
        count: summaries.length,
        has_more: result.has_more,
        search_field: args.search_field,
        query: args.query,
        results: summaries,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
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
                    : "Unknown error searching Orange Book drugs",
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

// ─── Tool 2: Get Application Details ─────────────────────────

server.registerTool(
  "orange_book_get_application",
  {
    title: "Get Application Details",
    description:
      "Get full details for a specific NDA or ANDA application number from " +
      "the FDA Orange Book. Returns all product variants, submission history, " +
      "approval dates, active ingredients, and marketing status. " +
      "Use this to drill into a specific drug application after discovering " +
      "it via orange_book_search_drugs.",
    inputSchema: z
      .object({
        application_number: z
          .string()
          .describe(
            "The NDA or ANDA application number. " +
              "Format: 'NDA020702' or 'ANDA090023'. " +
              "Include the NDA/ANDA prefix.",
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
    try {
      const appNum = args.application_number.toUpperCase();
      const search = `openfda.application_number:${quoteValue(appNum)}`;

      const result = await makeRequest({ search, limit: 10 });

      if (result.total === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `No application found for ${appNum}. ` +
                    "Verify the application number format (e.g., NDA020702, ANDA090023).",
                  application_number: appNum,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const drugResults = result.results as DrugsFDAResult[];
      const application = drugResults[0];
      const openfda = application.openfda ?? {};
      const products = application.products ?? [];
      const submissions = application.submissions ?? [];

      const output = {
        application_number: application.application_number ?? appNum,
        brand_name: openfda.brand_name?.join(", ") ?? "N/A",
        generic_name: openfda.generic_name?.join(", ") ?? "N/A",
        sponsor_name: application.sponsor_name ?? "N/A",
        substance_name: openfda.substance_name?.join(", ") ?? "N/A",
        pharm_class: openfda.pharm_class_epc?.join(", ") ?? "N/A",
        route: openfda.route?.join(", ") ?? "N/A",
        product_ndc: openfda.product_ndc?.slice(0, 5) ?? [],
        products: products.map((p) => ({
          product_number: p.product_number ?? "N/A",
          dosage_form: p.dosage_form ?? "N/A",
          route: p.route ?? "N/A",
          marketing_status: p.marketing_status ?? "N/A",
          te_code: p.te_code ?? "N/A",
          reference_drug: p.reference_drug ?? "N/A",
          active_ingredients: (p.active_ingredients ?? []).map((ai) => ({
            name: ai.name ?? "N/A",
            strength: ai.strength ?? "N/A",
          })),
        })),
        submissions: submissions.map((s) => ({
          submission_type: s.submission_type ?? "N/A",
          submission_number: s.submission_number ?? "N/A",
          submission_status: s.submission_status ?? "N/A",
          submission_status_date: s.submission_status_date ?? "N/A",
          submission_class_code: s.submission_class_code ?? "N/A",
          submission_class_description:
            s.submission_class_code_description ?? "N/A",
        })),
        total_products: products.length,
        total_submissions: submissions.length,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
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
                    : "Unknown error fetching application details",
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

// ─── Tool 3: Search Patents ──────────────────────────────────

server.registerTool(
  "orange_book_search_patents",
  {
    title: "Search Drug Patents",
    description:
      "Search for patent information associated with FDA-approved drugs in " +
      "the Orange Book. Returns patent data linked to drug products including " +
      "product details, therapeutic equivalence codes, and marketing status. " +
      "Useful for IP landscape analysis, generic entry timing, and " +
      "Paragraph IV certification research.",
    inputSchema: z
      .object({
        drug_name: z
          .string()
          .describe(
            "Drug name to search for patent data. Searches both brand " +
              "and generic name fields. Examples: 'Lipitor', 'atorvastatin'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-50, default 10)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const quoted = quoteValue(args.drug_name);
      const clauses = [
        `(openfda.brand_name:${quoted}+OR+openfda.generic_name:${quoted})`,
      ];
      const search = buildSearchQuery(clauses);

      const result = await makeRequest({
        search,
        limit: args.limit,
      });

      if (result.total === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: `No patent data found for "${args.drug_name}". ` +
                    "Try a different spelling or use the generic name.",
                  drug_name: args.drug_name,
                  total: 0,
                  results: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const drugResults = result.results as DrugsFDAResult[];
      const patentResults = drugResults.map(extractPatentInfo);

      const output = {
        total: result.total,
        count: patentResults.length,
        has_more: result.has_more,
        drug_name: args.drug_name,
        results: patentResults,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
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
                    : "Unknown error searching patent data",
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

// ─── Tool 4: Therapeutic Equivalence ─────────────────────────

server.registerTool(
  "orange_book_therapeutic_equivalence",
  {
    title: "Therapeutic Equivalence Lookup",
    description:
      "Find therapeutic equivalence (TE) evaluations for a drug from the " +
      "FDA Orange Book. Returns TE codes (e.g., AB, AA, BX) with descriptions, " +
      "reference drug status, dosage forms, strengths, and sponsor info. " +
      "Critical for generic substitution analysis, formulary decisions, and " +
      "understanding bioequivalence status of drug products.",
    inputSchema: z
      .object({
        drug_name: z
          .string()
          .describe(
            "Drug name to look up TE evaluations for. Searches generic " +
              "name field. Examples: 'metformin', 'atorvastatin', 'omeprazole'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(25)
          .describe("Number of results to return (1-50, default 25)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const quoted = quoteValue(args.drug_name);
      const search = `openfda.generic_name:${quoted}`;

      const result = await makeRequest({
        search,
        limit: args.limit,
      });

      if (result.total === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message:
                    `No therapeutic equivalence data found for "${args.drug_name}". ` +
                    "Try the generic name (e.g., 'atorvastatin' instead of 'Lipitor').",
                  drug_name: args.drug_name,
                  total: 0,
                  results: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const drugResults = result.results as DrugsFDAResult[];
      const teResults = drugResults.map(extractTEData);

      // Compute a summary of TE codes across all results
      const teCodeCounts: Record<string, number> = {};
      for (const entry of teResults) {
        const products = entry.products as Array<{ te_code: string }>;
        for (const p of products) {
          if (p.te_code && p.te_code !== "N/A") {
            teCodeCounts[p.te_code] = (teCodeCounts[p.te_code] ?? 0) + 1;
          }
        }
      }

      const output = {
        total: result.total,
        count: teResults.length,
        has_more: result.has_more,
        drug_name: args.drug_name,
        te_code_summary: teCodeCounts,
        results: teResults,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
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
                    : "Unknown error looking up therapeutic equivalence",
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

// ─── Tool 5: Exclusivity Data ────────────────────────────────

server.registerTool(
  "orange_book_exclusivity",
  {
    title: "Drug Exclusivity Lookup",
    description:
      "Search FDA drug exclusivity data from the Orange Book. Returns " +
      "submission history with exclusivity-related class codes, approval " +
      "dates, and marketing statuses. Useful for understanding market " +
      "protection periods (NCE, orphan drug, pediatric), generic entry " +
      "timing, and competitive analysis of drug portfolios.",
    inputSchema: z
      .object({
        drug_name: z
          .string()
          .describe(
            "Drug name to search for exclusivity data. Searches both " +
              "brand and generic name fields. Examples: 'Humira', 'adalimumab'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-50, default 10)."),
      })
      .strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const quoted = quoteValue(args.drug_name);
      const clauses = [
        `(openfda.brand_name:${quoted}+OR+openfda.generic_name:${quoted})`,
      ];
      const search = buildSearchQuery(clauses);

      const result = await makeRequest({
        search,
        limit: args.limit,
      });

      if (result.total === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message:
                    `No exclusivity data found for "${args.drug_name}". ` +
                    "Try a different spelling or the brand/generic name.",
                  drug_name: args.drug_name,
                  total: 0,
                  results: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const drugResults = result.results as DrugsFDAResult[];
      const exclusivityResults = drugResults.map(extractExclusivityData);

      const output = {
        total: result.total,
        count: exclusivityResults.length,
        has_more: result.has_more,
        drug_name: args.drug_name,
        results: exclusivityResults,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
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
                    : "Unknown error looking up exclusivity data",
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
  const args = process.argv.slice(2);
  const useHttp = args.includes("--http");

  if (useHttp) {
    const portArgIndex = args.indexOf("--port");
    const port =
      portArgIndex !== -1 && args[portArgIndex + 1]
        ? parseInt(args[portArgIndex + 1], 10)
        : 3022;

    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const httpServer = http.createServer(async (req, res) => {
      // Health check
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", server: "fda-orange-book-mcp" }),
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
        `[fda-orange-book-mcp] HTTP server listening on port ${port}`,
      );
      console.error(
        `[fda-orange-book-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error(
      "[fda-orange-book-mcp] Server running on stdio transport",
    );
  }
}

main().catch((error) => {
  console.error("[fda-orange-book-mcp] Fatal error:", error);
  process.exit(1);
});

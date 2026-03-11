#!/usr/bin/env node
/**
 * SEC EDGAR MCP Server
 *
 * Provides AI agents with access to SEC EDGAR financial filing data
 * including full-text search, company filings, XBRL facts, and
 * filing content retrieval.
 *
 * Designed for Protoprism's healthcare AI research platform, serving
 * ANALYST-FINANCIAL, ANALYST-STRATEGIC, and ANALYST-RISK archetypes.
 *
 * Supports both stdio and HTTP transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EdgarApiClient } from "./api-client.js";
import {
  SUPPORTED_FORM_TYPES,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_FILINGS_LIMIT,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "sec-edgar-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

const apiClient = new EdgarApiClient();

// ─── Tool: edgar_search_filings ──────────────────────────────

server.tool(
  "edgar_search_filings",
  "Full-text search across SEC EDGAR filings. Search for keywords in 10-K, 10-Q, 8-K, and other SEC filing types. Returns filing metadata including company name, CIK, form type, date, and URL.",
  {
    query: z.string().describe(
      "Search query text (e.g., 'artificial intelligence revenue', 'drug approval pipeline')",
    ),
    forms: z
      .array(z.enum(SUPPORTED_FORM_TYPES))
      .optional()
      .describe(
        "Filter by form types. Options: 10-K (annual), 10-Q (quarterly), 8-K (current events), S-1 (registration), DEF 14A (proxy), 13F (institutional holdings)",
      ),
    date_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Start date filter in YYYY-MM-DD format"),
    date_to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("End date filter in YYYY-MM-DD format"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_LIMIT)
      .default(DEFAULT_SEARCH_LIMIT)
      .describe(`Number of results to return (1-${MAX_SEARCH_LIMIT}, default ${DEFAULT_SEARCH_LIMIT})`),
  },
  async ({ query, forms, date_from, date_to, limit }) => {
    try {
      const result = await apiClient.searchFilings({
        query,
        forms,
        dateFrom: date_from,
        dateTo: date_to,
        limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: result.query,
                total_results: result.total,
                returned: result.results.length,
                filings: result.results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult("edgar_search_filings", error);
    }
  },
);

// ─── Tool: edgar_get_company_filings ─────────────────────────

server.tool(
  "edgar_get_company_filings",
  "Get all recent filings for a specific company by CIK number. Returns filing metadata including form type, date, accession number, and document URL. Use edgar_search_company first to find the CIK.",
  {
    cik: z.string().describe(
      "Company CIK number (10-digit zero-padded, e.g., '0000320193' for Apple). Use edgar_search_company to find CIK by name/ticker.",
    ),
    forms: z
      .array(z.enum(SUPPORTED_FORM_TYPES))
      .optional()
      .describe("Filter by form types (e.g., ['10-K', '10-Q'])"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_FILINGS_LIMIT)
      .describe(`Number of filings to return (1-100, default ${DEFAULT_FILINGS_LIMIT})`),
  },
  async ({ cik, forms, limit }) => {
    try {
      const result = await apiClient.getCompanyFilings({
        cik,
        forms,
        limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                company_name: result.company_name,
                cik: result.cik,
                total_filings: result.total,
                returned: result.filings.length,
                filings: result.filings,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult("edgar_get_company_filings", error);
    }
  },
);

// ─── Tool: edgar_get_company_facts ───────────────────────────

server.tool(
  "edgar_get_company_facts",
  "Get XBRL financial facts for a company from SEC EDGAR. Returns structured financial data points (revenue, net income, assets, etc.) across reporting periods. Useful for financial analysis and trend tracking.",
  {
    cik: z.string().describe(
      "Company CIK number (10-digit zero-padded, e.g., '0000320193' for Apple)",
    ),
    fact_namespace: z
      .enum(["us-gaap", "dei"])
      .optional()
      .describe(
        "XBRL taxonomy namespace filter. 'us-gaap' for financial data (Revenue, NetIncomeLoss, Assets), 'dei' for entity info (EntityCommonStockSharesOutstanding)",
      ),
    fact_name: z
      .string()
      .optional()
      .describe(
        "Filter by specific fact name (case-insensitive partial match). Examples: 'Revenue', 'NetIncomeLoss', 'Assets', 'StockholdersEquity', 'EarningsPerShare'",
      ),
  },
  async ({ cik, fact_namespace, fact_name }) => {
    try {
      const result = await apiClient.getCompanyFacts({
        cik,
        factNamespace: fact_namespace,
        factName: fact_name,
      });

      // Summarize if there are many facts to avoid overwhelming output
      const facts = result.facts;
      const factsToShow = facts.slice(0, 20);
      const truncated = facts.length > 20;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                company_name: result.company_name,
                cik: result.cik,
                total_facts: result.total_facts,
                showing: factsToShow.length,
                truncated,
                facts: factsToShow.map((fact) => ({
                  ...fact,
                  // Only show the most recent data points per unit to keep output manageable
                  units: Object.fromEntries(
                    Object.entries(fact.units).map(([unit, dataPoints]) => [
                      unit,
                      {
                        total_data_points: dataPoints.length,
                        recent: dataPoints.slice(-8),
                      },
                    ]),
                  ),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult("edgar_get_company_facts", error);
    }
  },
);

// ─── Tool: edgar_search_company ──────────────────────────────

server.tool(
  "edgar_search_company",
  "Search for companies by name or ticker symbol. Returns matching companies with their CIK numbers, which are needed for other EDGAR tools (edgar_get_company_filings, edgar_get_company_facts).",
  {
    query: z.string().describe(
      "Company name or ticker symbol to search for (e.g., 'Apple', 'AAPL', 'UnitedHealth', 'UNH')",
    ),
  },
  async ({ query }) => {
    try {
      const result = await apiClient.searchCompany(query);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                total_results: result.total,
                companies: result.results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult("edgar_search_company", error);
    }
  },
);

// ─── Tool: edgar_get_filing_content ──────────────────────────

server.tool(
  "edgar_get_filing_content",
  "Get the actual text content of a specific SEC filing. Returns the filing document text, truncated to 25,000 characters. Use accession_number from search results, or provide a direct filing_url.",
  {
    accession_number: z.string().describe(
      "Filing accession number from search results (e.g., '0000320193-23-000106' or '000032019323000106')",
    ),
    filing_url: z
      .string()
      .url()
      .optional()
      .describe(
        "Direct URL to the filing document. If provided, this URL is fetched directly instead of constructing from accession number.",
      ),
  },
  async ({ accession_number, filing_url }) => {
    try {
      const result = await apiClient.getFilingContent({
        accessionNumber: accession_number,
        filingUrl: filing_url,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                url: result.url,
                character_count: result.character_count,
                truncated: result.truncated,
                content: result.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult("edgar_get_filing_content", error);
    }
  },
);

// ─── Error Helper ────────────────────────────────────────────

function errorResult(toolName: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error);
  console.error(`[${toolName}] Error:`, message);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: true,
            tool: toolName,
            message,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ─── Transport & Startup ─────────────────────────────────────

async function main() {
  const transportMode = process.env.MCP_TRANSPORT ?? "stdio";

  if (transportMode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SEC EDGAR MCP Server running on stdio");
  } else if (transportMode === "http") {
    // HTTP/SSE transport: dynamically import to avoid requiring the module
    // when running in stdio mode
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const port = parseInt(process.env.MCP_PORT ?? "3100", 10);

    const httpServer = http.createServer(async (req, res) => {
      // Health check
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "sec-edgar-mcp-server" }));
        return;
      }

      // MCP endpoint
      if (req.url === "/mcp" || req.url === "/") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, () => {
      console.error(`SEC EDGAR MCP Server running on HTTP port ${port}`);
    });
  } else {
    console.error(`Unknown transport mode: ${transportMode}. Use "stdio" or "http".`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in SEC EDGAR MCP Server:", error);
  process.exit(1);
});

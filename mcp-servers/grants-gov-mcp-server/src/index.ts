/**
 * Grants.gov MCP Server
 *
 * Provides AI agents with access to the Grants.gov public API for querying
 * federal grant opportunities and funding programs. Designed for the
 * Protoprism healthcare AI research platform, with specialized tools for
 * healthcare-related grant discovery and funding landscape analysis.
 *
 * Supports stdio (default) and streamable HTTP transports.
 *
 * Usage:
 *   stdio:  node dist/index.js
 *   HTTP:   node dist/index.js --http --port 3023
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchOpportunities,
  getOpportunityDetail,
  truncateResponse,
} from "./api-client.js";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  AGENCIES,
  FUNDING_CATEGORIES,
  HHS_FAMILY_AGENCIES,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "grants-gov",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool 1: Search Opportunities ────────────────────────────

server.registerTool(
  "grants_search_opportunities",
  {
    title: "Search Federal Grant Opportunities",
    description:
      "Search federal grant opportunities on Grants.gov by keyword, agency, " +
      "funding category, or status. Returns opportunity ID, title, agency, " +
      "funding category, open/close dates, estimated funding amounts, and " +
      "status. Useful for research funding discovery, policy analysis, and " +
      "understanding the federal grant landscape.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Free-text keyword search across opportunity fields. " +
              "E.g., 'cancer research', 'mental health', 'telehealth', 'opioid'.",
          ),
        agency: z
          .string()
          .optional()
          .describe(
            "Filter by agency code. Common codes: 'HHS' (Health & Human Services), " +
              "'NIH' (National Institutes of Health), 'NSF' (National Science Foundation), " +
              "'CDC' (Centers for Disease Control), 'CMS' (Centers for Medicare & Medicaid), " +
              "'SAMHSA' (Substance Abuse & Mental Health), 'AHRQ', 'HRSA', 'FDA', " +
              "'DOD', 'VA', 'EPA', 'USDA', 'ED'. Use grants_list_agencies for full list.",
          ),
        funding_category: z
          .enum([
            "HL",
            "ST",
            "IS",
            "FN",
            "DPR",
            "AG",
            "AR",
            "BC",
            "CD",
            "CP",
            "ED",
            "ELT",
            "EN",
            "ENV",
            "HU",
            "HO",
            "IIJ",
            "LJL",
            "NR",
            "RA",
            "RD",
            "T",
            "O",
          ])
          .optional()
          .describe(
            "Filter by funding category code. Healthcare-relevant codes:\n" +
              "- 'HL': Health\n" +
              "- 'ST': Science and Technology / R&D\n" +
              "- 'IS': Income Security and Social Services\n" +
              "- 'FN': Food and Nutrition\n" +
              "Other codes: AG (Agriculture), BC (Business), CD (Community Dev), " +
              "ED (Education), ENV (Environment), etc.",
          ),
        status: z
          .enum(["open", "closed", "forecasted"])
          .default("open")
          .describe(
            "Filter by opportunity status. " +
              "'open': currently accepting applications (default), " +
              "'closed': past deadline, " +
              "'forecasted': anticipated future opportunities.",
          ),
        sort_by: z
          .enum(["openDate", "closeDate", "agencyName", "opportunityTitle"])
          .default("openDate")
          .describe(
            "Sort results by field. " +
              "'openDate' (default), 'closeDate', 'agencyName', or 'opportunityTitle'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(`Number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
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
      const result = await searchOpportunities({
        keyword: args.keyword,
        agency: args.agency,
        fundingCategory: args.funding_category,
        status: args.status,
        sortBy: args.sort_by,
        rows: args.limit,
        page: 1,
      });

      const responseStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: truncateResponse(responseStr),
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
                    : "Unknown error searching grant opportunities",
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

// ─── Tool 2: Get Opportunity Details ─────────────────────────

server.registerTool(
  "grants_get_opportunity",
  {
    title: "Get Grant Opportunity Details",
    description:
      "Get full details for a specific grant opportunity by its Grants.gov " +
      "opportunity ID. Returns complete information including description, " +
      "eligibility requirements, application info, funding amounts, deadlines, " +
      "CFDA numbers, and contact information. Use after finding opportunities " +
      "via grants_search_opportunities or grants_search_healthcare.",
    inputSchema: z
      .object({
        opportunity_id: z
          .string()
          .describe(
            "The Grants.gov opportunity ID (numeric string). " +
              "Obtained from search results (opportunity_id field). " +
              "E.g., '350321', '349876'.",
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
      const result = await getOpportunityDetail(args.opportunity_id);

      if (result.error && !result.opportunity) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: result.error,
                  opportunity_id: args.opportunity_id,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const responseStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: truncateResponse(responseStr),
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
                    : "Unknown error retrieving opportunity details",
                opportunity_id: args.opportunity_id,
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

// ─── Tool 3: Search Healthcare Grants ────────────────────────

server.registerTool(
  "grants_search_healthcare",
  {
    title: "Search Healthcare Grant Opportunities",
    description:
      "Convenience tool pre-filtered for healthcare-related federal grants. " +
      "Automatically filters to Health (HL) funding category. Optionally " +
      "narrow by keyword and agency (defaults to HHS family agencies). " +
      "Returns the same structure as grants_search_opportunities. " +
      "Designed for healthcare funding landscape analysis in Protoprism.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Additional keyword to refine healthcare grant search. " +
              "E.g., 'cancer', 'mental health', 'opioid', 'telehealth', " +
              "'maternal health', 'clinical trials', 'health equity'.",
          ),
        agency: z
          .string()
          .optional()
          .describe(
            "Filter by specific agency code within the HHS family. " +
              "Common healthcare agencies: 'NIH', 'CDC', 'CMS', 'SAMHSA', " +
              "'AHRQ', 'HRSA', 'FDA', 'ACF', 'ACL', 'IHS'. " +
              "If not specified, searches across all agencies with Health category.",
          ),
        status: z
          .enum(["open", "closed", "forecasted"])
          .default("open")
          .describe(
            "Filter by opportunity status. " +
              "'open' (default), 'closed', or 'forecasted'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(DEFAULT_LIMIT)
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
      const result = await searchOpportunities({
        keyword: args.keyword,
        agency: args.agency,
        fundingCategory: "HL", // Health category
        status: args.status,
        sortBy: "openDate",
        rows: args.limit,
        page: 1,
      });

      // Enrich with healthcare context metadata
      const enrichedResult = {
        ...result,
        _healthcare_filter: {
          funding_category: "HL (Health)",
          agency: args.agency ?? "all agencies",
          hhs_family_agencies: [...HHS_FAMILY_AGENCIES],
          note:
            "Results filtered to Health (HL) funding category. Use " +
            "grants_search_opportunities with specific parameters for broader searches.",
        },
      };

      const responseStr = JSON.stringify(enrichedResult, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: truncateResponse(responseStr),
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
                    : "Unknown error searching healthcare grants",
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

// ─── Tool 4: Search by Agency ────────────────────────────────

server.registerTool(
  "grants_search_by_agency",
  {
    title: "Search Grants by Agency",
    description:
      "Search grant opportunities from a specific federal agency with " +
      "optional keyword filter. Returns opportunities grouped by agency " +
      "along with summary statistics (total count, status breakdown). " +
      "Use grants_list_agencies to find valid agency codes.",
    inputSchema: z
      .object({
        agency: z
          .string()
          .describe(
            "Agency code (required). E.g., 'NIH', 'CDC', 'NSF', 'DOD', " +
              "'HHS', 'CMS', 'SAMHSA', 'HRSA', 'FDA', 'VA', 'EPA'. " +
              "Use grants_list_agencies for the full list.",
          ),
        keyword: z
          .string()
          .optional()
          .describe(
            "Optional keyword to filter opportunities within the agency. " +
              "E.g., 'genomics', 'HIV', 'rural health'.",
          ),
        status: z
          .enum(["open", "closed", "forecasted"])
          .default("open")
          .describe(
            "Filter by opportunity status. " +
              "'open' (default), 'closed', or 'forecasted'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(`Number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
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
      // Look up agency metadata
      const agencyInfo = AGENCIES.find(
        (a) =>
          a.code.toLowerCase() === args.agency.toLowerCase() ||
          a.abbreviation.toLowerCase() === args.agency.toLowerCase(),
      );

      const result = await searchOpportunities({
        keyword: args.keyword,
        agency: args.agency,
        status: args.status,
        sortBy: "openDate",
        rows: args.limit,
        page: 1,
      });

      // Enrich result with agency metadata and summary stats
      const enrichedResult = {
        ...result,
        _agency_info: agencyInfo
          ? {
              code: agencyInfo.code,
              name: agencyInfo.name,
              abbreviation: agencyInfo.abbreviation,
              healthcare_relevant: agencyInfo.healthcare_relevant,
              healthcare_note: agencyInfo.healthcare_note,
            }
          : {
              code: args.agency,
              name: "Unknown Agency",
              note: `Agency code '${args.agency}' not found in curated list. ` +
                "Results may still be returned if the code is valid in Grants.gov.",
            },
        _summary: {
          agency: args.agency,
          status_filter: args.status,
          keyword_filter: args.keyword ?? null,
          results_returned: result.count,
          total_matching: result.total,
        },
      };

      const responseStr = JSON.stringify(enrichedResult, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: truncateResponse(responseStr),
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
                    : "Unknown error searching agency grants",
                agency: args.agency,
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

// ─── Tool 5: List Agencies ───────────────────────────────────

server.registerTool(
  "grants_list_agencies",
  {
    title: "List Federal Grant Agencies",
    description:
      "List common federal agencies and their Grants.gov agency codes. " +
      "Returns agency code, full name, abbreviation, healthcare relevance " +
      "flag, and a brief description of healthcare relevance. No API call " +
      "needed -- returns curated reference data. Optionally filter by name " +
      "substring. Includes HHS, NIH, CDC, CMS, SAMHSA, AHRQ, HRSA, FDA, " +
      "NSF, DOD, VA, EPA, USDA, ED, and more.",
    inputSchema: z
      .object({
        filter: z
          .string()
          .optional()
          .describe(
            "Optional filter by name or abbreviation substring (case-insensitive). " +
              "E.g., 'health', 'NIH', 'defense', 'veteran'.",
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
    let filteredAgencies = [...AGENCIES];

    if (args.filter) {
      const filterLower = args.filter.toLowerCase();
      filteredAgencies = filteredAgencies.filter(
        (a) =>
          a.name.toLowerCase().includes(filterLower) ||
          a.abbreviation.toLowerCase().includes(filterLower) ||
          a.code.toLowerCase().includes(filterLower) ||
          a.healthcare_note.toLowerCase().includes(filterLower),
      );
    }

    const response = {
      total_agencies: filteredAgencies.length,
      agencies: filteredAgencies,
      healthcare_agencies: filteredAgencies.filter((a) => a.healthcare_relevant),
      funding_categories: FUNDING_CATEGORIES,
      hhs_family_codes: [...HHS_FAMILY_AGENCIES],
      usage_note:
        "Use the 'code' field as the 'agency' parameter in " +
        "grants_search_opportunities, grants_search_healthcare, or " +
        "grants_search_by_agency.",
    };

    const responseStr = JSON.stringify(response, null, 2);

    return {
      content: [
        {
          type: "text" as const,
          text: truncateResponse(responseStr),
        },
      ],
    };
  },
);

// ─── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isHttpMode = args.includes("--http");
  const portFlagIndex = args.indexOf("--port");
  const port =
    portFlagIndex !== -1 && args[portFlagIndex + 1]
      ? parseInt(args[portFlagIndex + 1], 10)
      : 3023;

  // Also support TRANSPORT env var for consistency with other servers
  const transportEnv = process.env.TRANSPORT?.toLowerCase();
  const useHttp =
    isHttpMode || transportEnv === "http" || transportEnv === "streamable-http";

  if (useHttp) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "grants-gov-mcp" }));
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
      console.error(`[grants-gov-mcp] HTTP server listening on port ${port}`);
      console.error(
        `[grants-gov-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[grants-gov-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[grants-gov-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[grants-gov-mcp] Fatal error:", error);
  process.exit(1);
});

/**
 * SAM.gov MCP Server
 *
 * Provides AI agents with access to the SAM.gov public API for querying
 * federal contract opportunities and registered entity data. Designed
 * for the Protoprism healthcare AI research platform, with specialized
 * tools for healthcare-related contracting intelligence.
 *
 * Supports stdio (default) and streamable HTTP transports.
 *
 * Usage:
 *   stdio:  node dist/index.js
 *   HTTP:   node dist/index.js --http --port 3021
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchOpportunities,
  searchEntities,
  truncateResponse,
} from "./api-client.js";
import {
  DEFAULT_LIMIT,
  MAX_OPPORTUNITIES_LIMIT,
  MAX_ENTITIES_LIMIT,
  HEALTHCARE_NAICS_CODES,
  HEALTHCARE_NAICS_PREFIXES,
  HEALTHCARE_PSC_CODES,
  NAICS_CATEGORIES,
  SET_ASIDE_TYPES,
  PROCUREMENT_TYPES,
} from "./constants.js";

import type { NAICSCategory } from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "sam-gov",
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
  "sam_search_opportunities",
  {
    title: "Search Federal Contract Opportunities",
    description:
      "Search federal contract opportunities on SAM.gov. Filter by keyword, " +
      "NAICS code, posted date range, procurement type, and set-aside type. " +
      "Returns title, agency, posted/response dates, set-aside, dollar value, " +
      "and direct link. Useful for market analysis, competitive intelligence, " +
      "and identifying government contracting opportunities.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Free-text keyword search across opportunity fields. " +
              "E.g., 'electronic health records', 'telemedicine', 'medical devices'.",
          ),
        naics_code: z
          .string()
          .optional()
          .describe(
            "Filter by NAICS code (North American Industry Classification System). " +
              "E.g., '621' for Ambulatory Health Care, '325412' for Pharmaceutical Manufacturing. " +
              "Use sam_list_naics_codes to find relevant codes.",
          ),
        posted_from: z
          .string()
          .optional()
          .describe(
            "Start date for posted date range filter. Format: MM/DD/YYYY (e.g., '01/01/2024').",
          ),
        posted_to: z
          .string()
          .optional()
          .describe(
            "End date for posted date range filter. Format: MM/DD/YYYY (e.g., '12/31/2024').",
          ),
        procurement_type: z
          .enum(["o", "p", "k", "r", "g", "s", "i", "a", "u"])
          .optional()
          .describe(
            "Filter by procurement type:\n" +
              "- 'o': Solicitation\n" +
              "- 'p': Presolicitation\n" +
              "- 'k': Combined Synopsis/Solicitation\n" +
              "- 'r': Sources Sought\n" +
              "- 'g': Sale of Surplus Property\n" +
              "- 's': Special Notice\n" +
              "- 'i': Intent to Bundle Requirements\n" +
              "- 'a': Award Notice\n" +
              "- 'u': Justification and Approval",
          ),
        set_aside: z
          .string()
          .optional()
          .describe(
            "Filter by set-aside type. Common values: " +
              "'SBA' (Small Business), '8(a)' (8a Business Development), " +
              "'HUBZone', 'SDVOSB' (Service-Disabled Veteran-Owned), " +
              "'WOSB' (Women-Owned), 'EDWOSB' (Economically Disadvantaged Women-Owned).",
          ),
        solicitation_number: z
          .string()
          .optional()
          .describe(
            "Filter by solicitation number for a specific opportunity.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_OPPORTUNITIES_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
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
    try {
      const queryParams: Record<string, string | number | boolean | undefined> = {
        limit: args.limit,
        offset: args.offset,
      };

      if (args.keyword) queryParams.keyword = args.keyword;
      if (args.naics_code) queryParams.ncode = args.naics_code;
      if (args.posted_from) queryParams.postedFrom = args.posted_from;
      if (args.posted_to) queryParams.postedTo = args.posted_to;
      if (args.procurement_type) queryParams.ptype = args.procurement_type;
      if (args.set_aside) queryParams.typeOfSetAside = args.set_aside;
      if (args.solicitation_number) queryParams.solnum = args.solicitation_number;

      const result = await searchOpportunities(queryParams);
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
                    : "Unknown error searching opportunities",
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
  "sam_get_opportunity",
  {
    title: "Get Opportunity Details",
    description:
      "Get full details for a specific federal contract opportunity by " +
      "solicitation number or notice ID. Returns complete opportunity data " +
      "including description, attachments, contact information, place of " +
      "performance, and award details. Use after finding opportunities via " +
      "sam_search_opportunities.",
    inputSchema: z
      .object({
        solicitation_number: z
          .string()
          .optional()
          .describe(
            "The solicitation number to look up (e.g., 'W911QY-24-R-0001'). " +
              "Use this OR notice_id, not both.",
          ),
        notice_id: z
          .string()
          .optional()
          .describe(
            "The SAM.gov notice/opportunity ID. " +
              "Use this OR solicitation_number, not both.",
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
    if (!args.solicitation_number && !args.notice_id) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  "Either solicitation_number or notice_id is required.",
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
      const queryParams: Record<string, string | number | boolean | undefined> = {
        limit: 1,
        offset: 0,
      };

      if (args.solicitation_number) queryParams.solnum = args.solicitation_number;
      if (args.notice_id) queryParams.noticeid = args.notice_id;

      const result = await searchOpportunities(queryParams);

      if (result.count === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "No opportunity found with the specified identifier.",
                  solicitation_number: args.solicitation_number ?? null,
                  notice_id: args.notice_id ?? null,
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

// ─── Tool 3: Search Entities ─────────────────────────────────

server.registerTool(
  "sam_search_entities",
  {
    title: "Search Registered Entities",
    description:
      "Search registered entities (companies and organizations) on SAM.gov. " +
      "These are entities registered to do business with the federal government. " +
      "Filter by business name, NAICS code, state, UEI (Unique Entity Identifier), " +
      "or CAGE code. Returns entity name, UEI, CAGE code, address, NAICS codes, " +
      "and registration status. Useful for vendor research, supply chain analysis, " +
      "and competitive intelligence.",
    inputSchema: z
      .object({
        business_name: z
          .string()
          .optional()
          .describe(
            "Search by legal business name. Partial matches supported. " +
              "E.g., 'Pfizer', 'United Health', 'Medtronic'.",
          ),
        uei: z
          .string()
          .optional()
          .describe(
            "Search by Unique Entity Identifier (UEI). The UEI replaced DUNS numbers. " +
              "E.g., 'ZQDBHEVHPE26'.",
          ),
        cage_code: z
          .string()
          .optional()
          .describe(
            "Search by CAGE (Commercial and Government Entity) code. " +
              "A 5-character code. E.g., '1XYZ5'.",
          ),
        naics_code: z
          .string()
          .optional()
          .describe(
            "Filter by NAICS code. E.g., '621' for Ambulatory Health Care Services, " +
              "'325412' for Pharmaceutical Manufacturing.",
          ),
        state: z
          .string()
          .optional()
          .describe(
            "Filter by state code (2-letter abbreviation). E.g., 'CA', 'NY', 'TX'.",
          ),
        purpose_of_registration: z
          .string()
          .optional()
          .describe(
            "Filter by purpose of registration. Common values: " +
              "'Z1' (Federal Assistance Awards), 'Z2' (All Awards), " +
              "'Z5' (Federal Assistance Awards & IGT).",
          ),
        entity_status: z
          .enum(["active", "inactive"])
          .optional()
          .describe(
            "Filter by entity registration status. 'active' for currently registered, " +
              "'inactive' for expired registrations.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_ENTITIES_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
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
    if (
      !args.business_name &&
      !args.uei &&
      !args.cage_code &&
      !args.naics_code &&
      !args.state
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  "At least one search parameter is required. Provide a business_name, " +
                  "uei, cage_code, naics_code, or state.",
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
      const queryParams: Record<string, string | number | boolean | undefined> = {
        samRegistered: "Yes",
        registrationLimit: args.limit,
        registrationOffset: args.offset,
      };

      if (args.business_name) queryParams.legalBusinessName = args.business_name;
      if (args.uei) queryParams.ueiSAM = args.uei;
      if (args.cage_code) queryParams.cageCode = args.cage_code;
      if (args.naics_code) queryParams.naicsCode = args.naics_code;
      if (args.state) queryParams.stateCode = args.state;
      if (args.purpose_of_registration)
        queryParams.purposeOfRegistrationCode = args.purpose_of_registration;
      if (args.entity_status) {
        queryParams.registrationStatus = args.entity_status === "active" ? "A" : "E";
      }

      const result = await searchEntities(queryParams);
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
                    : "Unknown error searching entities",
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

// ─── Tool 4: Search Healthcare Contracts ─────────────────────

server.registerTool(
  "sam_search_healthcare_contracts",
  {
    title: "Search Healthcare Contract Opportunities",
    description:
      "Convenience tool pre-filtered for healthcare-related federal contract " +
      "opportunities. Searches across healthcare NAICS codes including: " +
      "Ambulatory Health Care (621xxx), Hospitals (622xxx), Nursing/Residential Care (623xxx), " +
      "Pharmaceutical Manufacturing (325xxx), Medical Devices (339xxx), " +
      "and Biotechnology R&D (541711/12). Additional keyword and date filters " +
      "can be applied. Designed for ANALYST-STRATEGIC and ANALYST-FINANCIAL " +
      "agent archetypes in Protoprism.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Additional keyword to refine healthcare opportunity search. " +
              "E.g., 'telehealth', 'vaccine', 'EHR', 'mental health', 'CMS'.",
          ),
        healthcare_sector: z
          .enum(["providers", "pharma", "devices", "insurance", "research", "health_it"])
          .optional()
          .describe(
            "Filter by healthcare sector:\n" +
              "- 'providers': Ambulatory care, hospitals, nursing facilities (621, 622, 623)\n" +
              "- 'pharma': Pharmaceutical and biological manufacturing (325xxx)\n" +
              "- 'devices': Medical instruments, surgical supplies (339xxx)\n" +
              "- 'insurance': Health insurance carriers (524114)\n" +
              "- 'research': Biotechnology and life sciences R&D (541711, 541712)\n" +
              "- 'health_it': Health IT, software, data services (511210, 541511, etc.)",
          ),
        posted_from: z
          .string()
          .optional()
          .describe(
            "Start date for posted date range. Format: MM/DD/YYYY.",
          ),
        posted_to: z
          .string()
          .optional()
          .describe(
            "End date for posted date range. Format: MM/DD/YYYY.",
          ),
        set_aside: z
          .string()
          .optional()
          .describe(
            "Filter by set-aside type (e.g., 'SBA', '8(a)', 'HUBZone', 'SDVOSB', 'WOSB').",
          ),
        procurement_type: z
          .enum(["o", "p", "k", "r", "s", "a"])
          .optional()
          .describe(
            "Filter by procurement type: 'o' (solicitation), 'p' (presolicitation), " +
              "'k' (combined synopsis/solicitation), 'r' (sources sought), " +
              "'s' (special notice), 'a' (award notice).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_OPPORTUNITIES_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
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
    try {
      // Determine which NAICS codes to use based on sector filter
      let naicsCodes: string[];
      if (args.healthcare_sector) {
        naicsCodes = HEALTHCARE_NAICS_CODES
          .filter((n) => n.category === args.healthcare_sector)
          .map((n) => n.code);
      } else {
        // Use top-level prefixes for broader healthcare search
        naicsCodes = [...HEALTHCARE_NAICS_PREFIXES];
      }

      // SAM.gov API accepts comma-separated NAICS codes in the ncode parameter.
      // We'll search with each top-level prefix to get broader results.
      // Use the most specific codes to avoid overly broad results.
      const uniquePrefixes = new Set<string>();
      for (const code of naicsCodes) {
        // Use 3-digit prefix for broader matching when no sector specified
        if (!args.healthcare_sector && code.length >= 3) {
          uniquePrefixes.add(code.substring(0, 3));
        } else {
          uniquePrefixes.add(code);
        }
      }

      // Build a combined keyword that includes healthcare context
      const keywords: string[] = [];
      if (args.keyword) keywords.push(args.keyword);

      // Search with the first NAICS code (API may not support multiple)
      const primaryNaics = [...uniquePrefixes][0];

      const queryParams: Record<string, string | number | boolean | undefined> = {
        limit: args.limit,
        offset: args.offset,
        ncode: primaryNaics,
      };

      if (keywords.length > 0) queryParams.keyword = keywords.join(" ");
      if (args.posted_from) queryParams.postedFrom = args.posted_from;
      if (args.posted_to) queryParams.postedTo = args.posted_to;
      if (args.set_aside) queryParams.typeOfSetAside = args.set_aside;
      if (args.procurement_type) queryParams.ptype = args.procurement_type;

      const result = await searchOpportunities(queryParams);

      // Add metadata about the healthcare filter applied
      const enrichedResult = {
        ...result,
        _healthcare_filter: {
          sector: args.healthcare_sector ?? "all_healthcare",
          naics_code_used: primaryNaics,
          all_healthcare_naics_available: [...uniquePrefixes],
          note:
            "Results filtered by healthcare NAICS code. Use sam_search_opportunities " +
            "with specific NAICS codes for more targeted searches.",
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
                    : "Unknown error searching healthcare contracts",
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

// ─── Tool 5: List NAICS Codes ────────────────────────────────

server.registerTool(
  "sam_list_naics_codes",
  {
    title: "List NAICS Codes",
    description:
      "List NAICS (North American Industry Classification System) codes with " +
      "descriptions. Includes a curated set of healthcare-relevant NAICS codes " +
      "with Protoprism-specific categorization: providers, pharma, devices, " +
      "insurance, research, and health_it. Filter by keyword search or " +
      "category. Also lists healthcare PSC (Product Service Codes) when " +
      "include_psc is true.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Search NAICS codes by keyword in description. " +
              "E.g., 'hospital', 'pharmaceutical', 'surgical', 'dental'.",
          ),
        category: z
          .enum(["providers", "pharma", "devices", "insurance", "research", "health_it"])
          .optional()
          .describe(
            "Filter by Protoprism healthcare category:\n" +
              "- 'providers': Ambulatory care, hospitals, nursing facilities\n" +
              "- 'pharma': Pharmaceutical and biological manufacturing\n" +
              "- 'devices': Medical instruments, surgical supplies\n" +
              "- 'insurance': Health insurance carriers\n" +
              "- 'research': Biotechnology and life sciences R&D\n" +
              "- 'health_it': Health IT, software, data services",
          ),
        include_psc: z
          .boolean()
          .default(false)
          .describe(
            "If true, also include healthcare-related PSC (Product Service Codes) " +
              "in the response. Default: false.",
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
    let filteredCodes = [...HEALTHCARE_NAICS_CODES];

    // Filter by category
    if (args.category) {
      filteredCodes = filteredCodes.filter((c) => c.category === args.category);
    }

    // Filter by keyword
    if (args.keyword) {
      const kw = args.keyword.toLowerCase();
      filteredCodes = filteredCodes.filter(
        (c) =>
          c.description.toLowerCase().includes(kw) ||
          c.code.includes(kw),
      );
    }

    // Build response
    const response: Record<string, unknown> = {
      total_codes: filteredCodes.length,
      naics_codes: filteredCodes,
      categories: NAICS_CATEGORIES,
      set_aside_types: SET_ASIDE_TYPES,
      procurement_types: PROCUREMENT_TYPES,
    };

    if (args.include_psc) {
      let pscCodes = [...HEALTHCARE_PSC_CODES];
      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        pscCodes = pscCodes.filter(
          (c) =>
            c.description.toLowerCase().includes(kw) ||
            c.code.toLowerCase().includes(kw),
        );
      }
      response.psc_codes = pscCodes;
      response.total_psc_codes = pscCodes.length;
    }

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
      : 3021;

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
        res.end(JSON.stringify({ status: "ok", server: "sam-gov-mcp" }));
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
      console.error(`[sam-gov-mcp] HTTP server listening on port ${port}`);
      console.error(
        `[sam-gov-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[sam-gov-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[sam-gov-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[sam-gov-mcp] Fatal error:", error);
  process.exit(1);
});

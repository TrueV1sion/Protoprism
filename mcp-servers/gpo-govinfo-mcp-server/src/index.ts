/**
 * GPO GovInfo MCP Server
 *
 * Provides AI agents with access to the GPO GovInfo public API for querying
 * full-text laws, CFR regulatory text, congressional bills, reports, and
 * hearings. Designed for the Protoprism healthcare AI research platform.
 *
 * Agent archetypes served: LEGISLATIVE-PIPELINE, REGULATORY-RADAR, ANALYST-STRATEGIC
 *
 * Supports stdio (default) and streamable HTTP transports.
 *   stdio:  node dist/index.js
 *   HTTP:   node dist/index.js --http --port 3018
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  makeGovInfoRequest,
  fetchPackageContent,
  truncateResponse,
} from "./api-client.js";
import {
  VALID_COLLECTIONS,
  BILL_TYPES,
  HEALTHCARE_CFR_TITLES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_OFFSET,
  MAX_PAGE_SIZE,
  CHARACTER_LIMIT,
} from "./constants.js";

// ── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "gpo-govinfo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ── Helper: Format a tool response ──────────────────────────

function toolResult(data: unknown): { content: { type: "text"; text: string }[] } {
  const serialized = JSON.stringify(data, null, 2);
  const { text } = truncateResponse(serialized);
  return {
    content: [{ type: "text" as const, text }],
  };
}

function toolError(message: string): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}

// ── Tool 1: govinfo_search ──────────────────────────────────

server.registerTool(
  "govinfo_search",
  {
    title: "Search GovInfo",
    description:
      "Full-text search across GPO GovInfo collections. Search for laws, " +
      "regulations, bills, congressional reports, hearings, and Federal Register " +
      "notices. Filter by collection (BILLS, CFR, FR, PLAW, CRPT, CHRG), date " +
      "range, and page size. Returns title, summary, collection, date, and " +
      "packageId for each result. Paginated via offset.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Full-text search query. Supports boolean operators. " +
              "E.g., 'public health emergency', 'medicare reimbursement rate', " +
              "'opioid AND prescription AND monitoring'.",
          ),
        collection: z
          .enum(VALID_COLLECTIONS)
          .optional()
          .describe(
            "Filter results to a specific collection. Options: " +
              "BILLS (congressional bills), CFR (Code of Federal Regulations), " +
              "FR (Federal Register), PLAW (public laws), CRPT (committee reports), " +
              "CHRG (hearings), CREC (Congressional Record), STATUTE, HDOC, SDOC.",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Start date filter (inclusive). Format: YYYY-MM-DD. " +
              "E.g., '2023-01-01'.",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "End date filter (inclusive). Format: YYYY-MM-DD. " +
              "E.g., '2024-12-31'.",
          ),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe("Number of results per page (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_OFFSET)
          .describe("Offset for pagination (default 0)."),
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
      const params: Record<string, string | number | undefined> = {
        query: args.query,
        pageSize: args.page_size,
        offset: args.offset,
      };

      if (args.collection) {
        params.collection = args.collection;
      }
      if (args.date_from) {
        params.publishDateFrom = args.date_from;
      }
      if (args.date_to) {
        params.publishDateTo = args.date_to;
      }

      const result = await makeGovInfoRequest<SearchResponse>({
        path: "/search",
        params,
      });

      // Format for the agent
      const formatted = {
        count: result.count ?? 0,
        offset: args.offset,
        page_size: args.page_size,
        has_more: (result.nextPage ?? null) !== null,
        next_offset: result.nextPage ? args.offset + args.page_size : null,
        results: (result.results ?? []).map((r: SearchResult) => ({
          title: r.title,
          packageId: r.packageId,
          collection: r.collectionCode,
          date: r.dateIssued ?? r.lastModified,
          url: r.packageLink,
          summary: r.governmentAuthor1
            ? `By: ${r.governmentAuthor1}`
            : undefined,
        })),
      };

      return toolResult(formatted);
    } catch (error) {
      return toolError(
        error instanceof Error
          ? error.message
          : "Unknown error searching GovInfo",
      );
    }
  },
);

// ── Tool 2: govinfo_get_document ────────────────────────────

server.registerTool(
  "govinfo_get_document",
  {
    title: "Get GovInfo Document",
    description:
      "Get full metadata and text content for a specific GovInfo document " +
      "by its packageId. Returns the summary metadata (title, dates, " +
      "collection, category, government authors) and HTML/text content " +
      "truncated to 25,000 characters. Optionally fetch a specific " +
      "granule (section) within the package using granuleId.",
    inputSchema: z
      .object({
        package_id: z
          .string()
          .describe(
            "The GovInfo packageId for the document. Obtained from search results. " +
              "E.g., 'PLAW-117publ328', 'BILLS-118hr1234ih', 'CFR-2024-title42-vol5'.",
          ),
        granule_id: z
          .string()
          .optional()
          .describe(
            "Optional granuleId for a specific section within the package. " +
              "Use govinfo_search or package granule listing to find granule IDs. " +
              "E.g., 'CFR-2024-title42-vol5-sec482-1'.",
          ),
        include_content: z
          .boolean()
          .default(true)
          .describe(
            "Whether to fetch the full HTML/text content of the document. " +
              "Set to false for metadata only. Default: true.",
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
      // Fetch package summary
      const summaryPath = args.granule_id
        ? `/packages/${args.package_id}/granules/${args.granule_id}/summary`
        : `/packages/${args.package_id}/summary`;

      const summary = await makeGovInfoRequest<Record<string, unknown>>({
        path: summaryPath,
      });

      const result: Record<string, unknown> = {
        summary,
      };

      // Optionally fetch content
      if (args.include_content) {
        const content = await fetchPackageContent(
          args.package_id,
          args.granule_id,
        );
        if (content) {
          const { text, truncated } = truncateResponse(content);
          result.content = text;
          result.content_truncated = truncated;
        } else {
          result.content = null;
          result.content_note =
            "Full text content not available in HTML format for this document.";
        }
      }

      return toolResult(result);
    } catch (error) {
      return toolError(
        error instanceof Error
          ? error.message
          : "Unknown error fetching GovInfo document",
      );
    }
  },
);

// ── Tool 3: govinfo_search_cfr ──────────────────────────────

server.registerTool(
  "govinfo_search_cfr",
  {
    title: "Search Code of Federal Regulations",
    description:
      "Search the Code of Federal Regulations (CFR) for regulatory text. " +
      "Convenience wrapper focused on federal regulations. Filter by CFR " +
      "title number (42 = Public Health, 21 = Food & Drugs, 45 = Public " +
      "Welfare), keyword search, and date range. Healthcare-relevant titles: " +
      "Title 21 (FDA), Title 42 (CMS/Medicare/Medicaid/CDC/NIH), " +
      "Title 45 (HHS/HIPAA). Returns regulatory text references with " +
      "packageId for full retrieval.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Search query for CFR text. E.g., 'conditions of participation hospital', " +
              "'drug approval process', 'HIPAA privacy rule', 'Medicare coverage determination'.",
          ),
        cfr_title: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "CFR title number to search within. Healthcare-relevant titles: " +
              "21 (Food and Drugs/FDA), 42 (Public Health/CMS/Medicare/Medicaid), " +
              "45 (Public Welfare/HHS/HIPAA), 29 (Labor/ERISA), " +
              "26 (Internal Revenue/ACA), 38 (Veterans/VA healthcare). " +
              "Omit to search all titles.",
          ),
        date_from: z
          .string()
          .optional()
          .describe("Start date filter. Format: YYYY-MM-DD."),
        date_to: z
          .string()
          .optional()
          .describe("End date filter. Format: YYYY-MM-DD."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe("Number of results per page (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_OFFSET)
          .describe("Offset for pagination (default 0)."),
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
      // Build query with CFR collection filter
      let searchQuery = args.query;
      if (args.cfr_title) {
        searchQuery = `${searchQuery} AND title:${args.cfr_title}`;
      }

      const params: Record<string, string | number | undefined> = {
        query: searchQuery,
        collection: "CFR",
        pageSize: args.page_size,
        offset: args.offset,
      };

      if (args.date_from) {
        params.publishDateFrom = args.date_from;
      }
      if (args.date_to) {
        params.publishDateTo = args.date_to;
      }

      const result = await makeGovInfoRequest<SearchResponse>({
        path: "/search",
        params,
      });

      const titleDescriptions = HEALTHCARE_CFR_TITLES;

      const formatted = {
        count: result.count ?? 0,
        offset: args.offset,
        page_size: args.page_size,
        has_more: (result.nextPage ?? null) !== null,
        next_offset: result.nextPage ? args.offset + args.page_size : null,
        healthcare_cfr_titles_reference: titleDescriptions,
        results: (result.results ?? []).map((r: SearchResult) => ({
          title: r.title,
          packageId: r.packageId,
          collection: r.collectionCode,
          date: r.dateIssued ?? r.lastModified,
          url: r.packageLink,
        })),
      };

      return toolResult(formatted);
    } catch (error) {
      return toolError(
        error instanceof Error
          ? error.message
          : "Unknown error searching CFR",
      );
    }
  },
);

// ── Tool 4: govinfo_search_bills ────────────────────────────

server.registerTool(
  "govinfo_search_bills",
  {
    title: "Search Congressional Bills",
    description:
      "Search congressional bills in GovInfo. Filter by congress number " +
      "(e.g., 118 for the 118th Congress), bill type (hr, s, hjres, sjres), " +
      "keyword, and date range. Returns bill title, package info, and status. " +
      "Use govinfo_get_document with the packageId to retrieve full bill text.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Search query for bill text. E.g., 'drug pricing', " +
              "'mental health parity', 'telehealth expansion', 'prior authorization'.",
          ),
        congress: z
          .number()
          .int()
          .min(93)
          .max(119)
          .optional()
          .describe(
            "Congress number (e.g., 118 for the 118th Congress, 2023-2024). " +
              "GovInfo has bills from the 93rd Congress (1973) onward.",
          ),
        bill_type: z
          .enum(BILL_TYPES)
          .optional()
          .describe(
            "Type of bill: hr (House bill), s (Senate bill), hjres (House joint resolution), " +
              "sjres (Senate joint resolution), hconres (House concurrent resolution), " +
              "sconres (Senate concurrent resolution), hres (House resolution), " +
              "sres (Senate resolution).",
          ),
        date_from: z
          .string()
          .optional()
          .describe("Start date filter. Format: YYYY-MM-DD."),
        date_to: z
          .string()
          .optional()
          .describe("End date filter. Format: YYYY-MM-DD."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe("Number of results per page (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_OFFSET)
          .describe("Offset for pagination (default 0)."),
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
      // Build query with bill-specific filters
      let searchQuery = args.query;
      if (args.congress) {
        searchQuery = `${searchQuery} AND congress:${args.congress}`;
      }
      if (args.bill_type) {
        searchQuery = `${searchQuery} AND billType:${args.bill_type}`;
      }

      const params: Record<string, string | number | undefined> = {
        query: searchQuery,
        collection: "BILLS",
        pageSize: args.page_size,
        offset: args.offset,
      };

      if (args.date_from) {
        params.publishDateFrom = args.date_from;
      }
      if (args.date_to) {
        params.publishDateTo = args.date_to;
      }

      const result = await makeGovInfoRequest<SearchResponse>({
        path: "/search",
        params,
      });

      const formatted = {
        count: result.count ?? 0,
        offset: args.offset,
        page_size: args.page_size,
        has_more: (result.nextPage ?? null) !== null,
        next_offset: result.nextPage ? args.offset + args.page_size : null,
        results: (result.results ?? []).map((r: SearchResult) => ({
          title: r.title,
          packageId: r.packageId,
          collection: r.collectionCode,
          date: r.dateIssued ?? r.lastModified,
          congress: r.congress,
          billType: r.billType,
          billNumber: r.billNumber,
          url: r.packageLink,
          governmentAuthor: r.governmentAuthor1,
        })),
      };

      return toolResult(formatted);
    } catch (error) {
      return toolError(
        error instanceof Error
          ? error.message
          : "Unknown error searching bills",
      );
    }
  },
);

// ── Tool 5: govinfo_recent_publications ─────────────────────

server.registerTool(
  "govinfo_recent_publications",
  {
    title: "Recent GovInfo Publications",
    description:
      "Get recently published documents from GovInfo. Filter by collection " +
      "(BILLS, CFR, FR, PLAW, CRPT, CHRG) and date range. Useful for " +
      "monitoring new laws, regulations, Federal Register notices, and " +
      "congressional reports. Returns a chronological list with metadata. " +
      "Essential for REGULATORY-RADAR tracking of new healthcare regulations.",
    inputSchema: z
      .object({
        collection: z
          .enum(VALID_COLLECTIONS)
          .describe(
            "Collection to check for recent publications. Options: " +
              "BILLS, CFR, FR (Federal Register), PLAW (public laws), " +
              "CRPT (committee reports), CHRG (hearings), CREC (Congressional Record).",
          ),
        start_date: z
          .string()
          .describe(
            "Start of date range (inclusive). Format: YYYY-MM-DDTHH:MM:SSZ " +
              "or YYYY-MM-DD. E.g., '2024-01-01' or '2024-01-01T00:00:00Z'.",
          ),
        end_date: z
          .string()
          .optional()
          .describe(
            "End of date range (inclusive). Defaults to now if omitted. " +
              "Format: YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD.",
          ),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe("Number of results per page (1-100, default 10)."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(DEFAULT_OFFSET)
          .describe("Offset for pagination (default 0)."),
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
      // Normalize dates to ISO format
      const startDate = args.start_date.includes("T")
        ? args.start_date
        : `${args.start_date}T00:00:00Z`;
      const endDate = args.end_date
        ? args.end_date.includes("T")
          ? args.end_date
          : `${args.end_date}T23:59:59Z`
        : new Date().toISOString();

      const params: Record<string, string | number | undefined> = {
        offset: args.offset,
        pageSize: args.page_size,
      };

      const result = await makeGovInfoRequest<CollectionResponse>({
        path: `/collections/${args.collection}/${startDate}/${endDate}`,
        params,
      });

      const formatted = {
        collection: args.collection,
        count: result.count ?? 0,
        offset: args.offset,
        page_size: args.page_size,
        has_more: (result.nextPage ?? null) !== null,
        next_offset: result.nextPage ? args.offset + args.page_size : null,
        packages: (result.packages ?? []).map((pkg: PackageInfo) => ({
          packageId: pkg.packageId,
          title: pkg.title,
          lastModified: pkg.lastModified,
          packageLink: pkg.packageLink,
          docClass: pkg.docClass,
          congress: pkg.congress,
          dateIssued: pkg.dateIssued,
        })),
      };

      return toolResult(formatted);
    } catch (error) {
      return toolError(
        error instanceof Error
          ? error.message
          : "Unknown error fetching recent publications",
      );
    }
  },
);

// ── API Response Types (internal) ───────────────────────────

interface SearchResult {
  title?: string;
  packageId?: string;
  collectionCode?: string;
  dateIssued?: string;
  lastModified?: string;
  packageLink?: string;
  governmentAuthor1?: string;
  congress?: string;
  billType?: string;
  billNumber?: string;
}

interface SearchResponse {
  count?: number;
  message?: string;
  nextPage?: string;
  previousPage?: string;
  results?: SearchResult[];
}

interface PackageInfo {
  packageId?: string;
  title?: string;
  lastModified?: string;
  packageLink?: string;
  docClass?: string;
  congress?: string;
  dateIssued?: string;
}

interface CollectionResponse {
  count?: number;
  message?: string;
  nextPage?: string;
  previousPage?: string;
  packages?: PackageInfo[];
}

// ── Transport & Startup ─────────────────────────────────────

function parseArgs(): { http: boolean; port: number } {
  const args = process.argv.slice(2);
  let http = false;
  let port = 3018;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--http") {
      http = true;
    } else if (args[i] === "--port" && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Also support env vars for backward compatibility
  const transport = process.env.TRANSPORT?.toLowerCase();
  if (transport === "http" || transport === "streamable-http") {
    http = true;
  }
  if (process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
  }

  return { http, port };
}

async function main(): Promise<void> {
  const { http, port } = parseArgs();

  if (http) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const httpModule = await import("node:http");

    const httpServer = httpModule.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", server: "gpo-govinfo-mcp" }),
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
        `[govinfo-mcp] HTTP server listening on port ${port}`,
      );
      console.error(
        `[govinfo-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(
        `[govinfo-mcp] Health check: http://localhost:${port}/health`,
      );
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[govinfo-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[govinfo-mcp] Fatal error:", error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Federal Register MCP Server
 *
 * Provides five read-only tools for searching and retrieving federal
 * regulatory documents, public inspection items, and agency metadata
 * from the Federal Register API (https://www.federalregister.gov/api/v1).
 *
 * Built for Protoprism healthcare AI agents:
 *   LEGISLATIVE-PIPELINE, REGULATORY-RADAR, ANALYST-STRATEGIC
 *
 * Supports both stdio and HTTP (Streamable HTTP) transports:
 *   stdio (default):  node dist/index.js
 *   HTTP:             node dist/index.js --http [--port 4005]
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { FederalRegisterClient } from "./api-client.js";
import {
  CHARACTER_LIMIT,
  DOCUMENT_TYPES,
  HEALTHCARE_AGENCIES,
  DEFAULT_HTTP_PORT,
} from "./constants.js";

// ─── Helpers ────────────────────────────────────────────────

/**
 * Truncate text to CHARACTER_LIMIT, appending a truncation notice.
 */
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT - 100) +
    "\n\n[... TRUNCATED — response exceeded character limit. Narrow your search or request a specific document.]"
  );
}

/**
 * Format a document result into a readable text block.
 */
function formatDocument(
  doc: Record<string, unknown>,
  index?: number,
): string {
  const prefix = index !== undefined ? `--- Document ${index + 1} ---\n` : "";
  const lines: string[] = [prefix];

  if (doc.title) lines.push(`Title: ${doc.title}`);
  if (doc.type) lines.push(`Type: ${doc.type}${doc.subtype ? ` (${doc.subtype})` : ""}`);
  if (doc.document_number) lines.push(`Document Number: ${doc.document_number}`);
  if (doc.citation) lines.push(`Citation: ${doc.citation}`);
  if (doc.publication_date) lines.push(`Published: ${doc.publication_date}`);
  if (doc.effective_on) lines.push(`Effective: ${doc.effective_on}`);
  if (doc.signing_date) lines.push(`Signed: ${doc.signing_date}`);

  // Agencies
  const agencies = doc.agencies as Array<{ name: string; slug: string }> | undefined;
  if (agencies?.length) {
    lines.push(
      `Agencies: ${agencies.map((a) => `${a.name} [${a.slug}]`).join(", ")}`,
    );
  }

  if (doc.action) lines.push(`Action: ${doc.action}`);
  if (doc.dates) lines.push(`Dates: ${doc.dates}`);

  // Abstract
  if (doc.abstract) {
    const abstract = String(doc.abstract);
    lines.push(`Abstract: ${abstract.length > 1000 ? abstract.slice(0, 1000) + "..." : abstract}`);
  }

  // Topics
  const topics = doc.topics as string[] | undefined;
  if (topics?.length) {
    lines.push(`Topics: ${topics.join("; ")}`);
  }

  // CFR references
  const cfr = doc.cfr_references as Array<{ title: number; part: number }> | undefined;
  if (cfr?.length) {
    lines.push(
      `CFR References: ${cfr.map((r) => `${r.title} CFR Part ${r.part}`).join(", ")}`,
    );
  }

  // Dockets & RINs
  const dockets = doc.docket_ids as string[] | undefined;
  if (dockets?.length) lines.push(`Docket IDs: ${dockets.join(", ")}`);

  const rins = doc.regulation_id_numbers as string[] | undefined;
  if (rins?.length) lines.push(`RINs: ${rins.join(", ")}`);

  if (doc.significant) lines.push("Significant: Yes (Economically significant under E.O. 12866)");

  // Comments
  if (doc.comment_url) lines.push(`Comment URL: ${doc.comment_url}`);
  if (doc.comments_close_on) lines.push(`Comments Close: ${doc.comments_close_on}`);

  // URLs
  if (doc.html_url) lines.push(`HTML: ${doc.html_url}`);
  if (doc.pdf_url) lines.push(`PDF: ${doc.pdf_url}`);
  if (doc.raw_text_url) lines.push(`Raw Text: ${doc.raw_text_url}`);

  // Page info
  if (doc.start_page && doc.end_page) {
    lines.push(`Pages: ${doc.start_page}-${doc.end_page} (${doc.page_length ?? "?"} pages)`);
  }

  // Page views
  const views = doc.page_views as { count: number } | undefined;
  if (views?.count) lines.push(`Page Views: ${views.count.toLocaleString()}`);

  // Executive / Presidential
  if (doc.executive_order_number) lines.push(`Executive Order: ${doc.executive_order_number}`);
  if (doc.presidential_document_number) lines.push(`Presidential Doc Number: ${doc.presidential_document_number}`);

  // Excerpts (search highlights)
  if (doc.excerpts) lines.push(`Excerpts: ${doc.excerpts}`);

  return lines.filter(Boolean).join("\n");
}

/**
 * Format a public inspection document.
 */
function formatPublicInspection(
  doc: Record<string, unknown>,
  index: number,
): string {
  const lines: string[] = [`--- Document ${index + 1} ---`];

  if (doc.title) lines.push(`Title: ${doc.title}`);
  if (doc.type) lines.push(`Type: ${doc.type}`);
  if (doc.document_number) lines.push(`Document Number: ${doc.document_number}`);
  if (doc.filing_type) lines.push(`Filing Type: ${doc.filing_type}`);
  if (doc.filed_at) lines.push(`Filed: ${doc.filed_at}`);
  if (doc.publication_date) lines.push(`Expected Publication: ${doc.publication_date}`);

  const agencies = doc.agencies as Array<{ name: string; slug: string }> | undefined;
  if (agencies?.length) {
    lines.push(`Agencies: ${agencies.map((a) => `${a.name} [${a.slug}]`).join(", ")}`);
  }

  if (doc.subject_1) lines.push(`Subject: ${doc.subject_1}`);
  if (doc.subject_2) lines.push(`Subject 2: ${doc.subject_2}`);
  if (doc.subject_3) lines.push(`Subject 3: ${doc.subject_3}`);
  if (doc.num_pages) lines.push(`Pages: ${doc.num_pages}`);

  const dockets = doc.docket_numbers as string[] | undefined;
  if (dockets?.length) lines.push(`Docket Numbers: ${dockets.join(", ")}`);

  if (doc.editorial_note) lines.push(`Editorial Note: ${doc.editorial_note}`);
  if (doc.html_url) lines.push(`HTML: ${doc.html_url}`);
  if (doc.pdf_url) lines.push(`PDF: ${doc.pdf_url}`);

  return lines.join("\n");
}

// ─── Document type schema ───────────────────────────────────

const DocumentTypeEnum = z.enum(["RULE", "PRORULE", "NOTICE", "PRESDOCU"]);

// ─── Server Setup ───────────────────────────────────────────

const client = new FederalRegisterClient();

const server = new McpServer(
  {
    name: "federal-register-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

// ─── Tool 1: fedreg_search_documents ────────────────────────

server.registerTool(
  "fedreg_search_documents",
  {
    title: "Search Federal Register Documents",
    description:
      "Search Federal Register documents (rules, proposed rules, notices, presidential documents). " +
      "Filter by keyword query, document type, agency, date range, topics, and economic significance. " +
      "Returns title, abstract, agencies, publication date, document number, type, and URLs. " +
      "Healthcare-relevant agency slugs include: " +
      Object.entries(HEALTHCARE_AGENCIES)
        .map(([abbr, slug]) => `${abbr}=${slug}`)
        .join(", ") +
      ".",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Full-text search query (e.g., 'Medicare Advantage', 'prior authorization')"),
      document_type: z
        .array(DocumentTypeEnum)
        .optional()
        .describe(
          "Filter by document type: RULE (final rules), PRORULE (proposed rules), " +
          "NOTICE (notices), PRESDOCU (presidential documents)",
        ),
      agencies: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by agency slugs (hyphenated lowercase, e.g., " +
          "'centers-for-medicare-medicaid-services', 'food-and-drug-administration'). " +
          "Use fedreg_list_agencies to discover valid slugs.",
        ),
      date_from: z
        .string()
        .optional()
        .describe("Start date (inclusive) in YYYY-MM-DD format"),
      date_to: z
        .string()
        .optional()
        .describe("End date (inclusive) in YYYY-MM-DD format"),
      topics: z
        .array(z.string())
        .optional()
        .describe("Filter by topic keywords"),
      significant: z
        .boolean()
        .optional()
        .describe(
          "If true, return only economically significant rules " +
          "(under Executive Order 12866, typically $100M+ annual impact)",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of results per page (1-100, default 20)"),
      page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Page number for pagination (default 1)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const result = await client.searchDocuments({
        query: args.query,
        document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
        agencies: args.agencies,
        date_from: args.date_from,
        date_to: args.date_to,
        topics: args.topics,
        significant: args.significant,
        limit: args.limit,
        page: args.page,
      });

      const header = [
        `Federal Register Search Results`,
        `Total: ${result.count.toLocaleString()} documents`,
        `Page: ${args.page ?? 1} of ${result.total_pages}`,
        `Showing: ${result.results.length} results`,
        "",
      ].join("\n");

      const documents = result.results
        .map((doc, i) => formatDocument(doc as unknown as Record<string, unknown>, i))
        .join("\n\n");

      const footer = result.next_page_url
        ? `\n\n[Next page available — increment page parameter to ${(args.page ?? 1) + 1}]`
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + documents + footer),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching Federal Register: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: fedreg_get_document ────────────────────────────

server.registerTool(
  "fedreg_get_document",
  {
    title: "Get Federal Register Document",
    description:
      "Get full details for a specific Federal Register document by its document number. " +
      "Returns comprehensive metadata including abstract, agency info, CFR references, " +
      "effective dates, docket IDs, RINs, page views, and download URLs.",
    inputSchema: z.object({
      document_number: z
        .string()
        .describe(
          "Federal Register document number (e.g., '2024-12345', '2023-28137'). " +
          "Found in search results or Federal Register citations.",
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const doc = await client.getDocument(args.document_number);
      const formatted = formatDocument(doc as unknown as Record<string, unknown>);

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(formatted),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching document ${args.document_number}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 3: fedreg_search_public_inspection ────────────────

server.registerTool(
  "fedreg_search_public_inspection",
  {
    title: "Search Public Inspection Documents",
    description:
      "Search documents currently on public inspection at the Federal Register " +
      "(pre-publication). These are upcoming federal actions that have been filed " +
      "but not yet officially published. Useful for early warning of regulatory changes. " +
      "Filter by agency and document type.",
    inputSchema: z.object({
      agencies: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by agency slugs (e.g., 'centers-for-medicare-medicaid-services'). " +
          "Use fedreg_list_agencies to discover valid slugs.",
        ),
      document_type: z
        .array(DocumentTypeEnum)
        .optional()
        .describe(
          "Filter by document type: RULE, PRORULE, NOTICE, PRESDOCU",
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const result = await client.searchPublicInspection({
        agencies: args.agencies,
        document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
      });

      const header = [
        `Public Inspection Documents`,
        `Total: ${result.count} documents currently on public inspection`,
        `Showing: ${result.results.length} results`,
        "",
      ].join("\n");

      const documents = result.results
        .map((doc, i) => formatPublicInspection(doc as unknown as Record<string, unknown>, i))
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + documents),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching public inspection documents: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 4: fedreg_list_agencies ───────────────────────────

server.registerTool(
  "fedreg_list_agencies",
  {
    title: "List Federal Register Agencies",
    description:
      "List all agencies registered with the Federal Register. Returns agency names, " +
      "slugs (needed for filtering in fedreg_search_documents), abbreviations, and " +
      "parent/child relationships. Optionally filter by a search query.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Optional text to filter agencies by name (case-insensitive). " +
          "E.g., 'health', 'food', 'medicare'.",
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      let agencies = await client.listAgencies();

      // Client-side filtering since the API doesn't support it
      if (args.query) {
        const q = args.query.toLowerCase();
        agencies = agencies.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.short_name?.toLowerCase().includes(q) ?? false) ||
            a.slug.toLowerCase().includes(q) ||
            (a.description?.toLowerCase().includes(q) ?? false),
        );
      }

      const header = [
        `Federal Register Agencies`,
        `Total: ${agencies.length} agencies${args.query ? ` matching "${args.query}"` : ""}`,
        "",
      ].join("\n");

      const agencyLines = agencies.map((a) => {
        const parts = [`${a.name}`];
        if (a.short_name) parts.push(`(${a.short_name})`);
        parts.push(`| slug: ${a.slug}`);
        if (a.parent_id) parts.push(`| parent_id: ${a.parent_id}`);
        if (a.child_slugs?.length) {
          parts.push(`| children: ${a.child_slugs.length}`);
        }
        return parts.join(" ");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + agencyLines.join("\n")),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing agencies: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 5: fedreg_count_by_agency ─────────────────────────

server.registerTool(
  "fedreg_count_by_agency",
  {
    title: "Count Documents by Agency",
    description:
      "Count Federal Register documents published by a specific agency over a time period. " +
      "Useful for trend analysis, regulatory activity monitoring, and comparing agency output. " +
      "Can be filtered by document type to count only rules, proposed rules, or notices.",
    inputSchema: z.object({
      agency_slug: z
        .string()
        .describe(
          "Agency slug (hyphenated lowercase, e.g., 'centers-for-medicare-medicaid-services'). " +
          "Use fedreg_list_agencies to discover valid slugs.",
        ),
      date_from: z
        .string()
        .optional()
        .describe("Start date (inclusive) in YYYY-MM-DD format"),
      date_to: z
        .string()
        .optional()
        .describe("End date (inclusive) in YYYY-MM-DD format"),
      document_type: z
        .array(DocumentTypeEnum)
        .optional()
        .describe(
          "Filter by document type: RULE, PRORULE, NOTICE, PRESDOCU",
        ),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const result = await client.countByAgency({
        agency_slug: args.agency_slug,
        date_from: args.date_from,
        date_to: args.date_to,
        document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
      });

      const lines = [
        `Document Count for Agency: ${result.agency_slug}`,
        `Count: ${result.count.toLocaleString()}`,
      ];

      if (result.date_from || result.date_to) {
        lines.push(
          `Period: ${result.date_from ?? "beginning"} to ${result.date_to ?? "present"}`,
        );
      }

      if (result.document_types?.length) {
        lines.push(`Document Types: ${result.document_types.join(", ")}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error counting documents: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Transport / Startup ────────────────────────────────────

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Federal Register MCP Server running on stdio");
}

async function startHttp(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "federal-register-mcp-server" }));
      return;
    }

    // Only handle /mcp path
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

      if (sessionId && transports.has(sessionId)) {
        // Existing session
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res, body);
        return;
      }

      // New session — check if this is an initialize request
      if (!sessionId && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            transports.set(id, transport);
            console.error(`[HTTP] Session initialized: ${id}`);
          },
        });

        transport.onclose = () => {
          const sid = (transport as unknown as { sessionId?: string }).sessionId;
          if (sid) {
            transports.delete(sid);
            console.error(`[HTTP] Session closed: ${sid}`);
          }
        };

        // Connect a fresh server instance for this session
        const sessionServer = new McpServer(
          { name: "federal-register-mcp-server", version: "1.0.0" },
          { capabilities: { logging: {} } },
        );
        registerAllTools(sessionServer);
        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid or missing session" },
          id: null,
        }),
      );
      return;
    }

    if (req.method === "GET") {
      // SSE stream for existing session
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(400);
      res.end("Invalid session");
      return;
    }

    if (req.method === "DELETE") {
      // Session termination
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        transports.delete(sessionId);
        return;
      }
      res.writeHead(404);
      res.end("Session not found");
      return;
    }

    res.writeHead(405);
    res.end("Method Not Allowed");
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error(
      `Federal Register MCP Server running on http://127.0.0.1:${port}/mcp`,
    );
  });
}

/**
 * Minimal check for a JSON-RPC initialize request.
 */
function isInitializeRequest(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return obj.method === "initialize";
}

/**
 * Register all tools on a given McpServer instance.
 * Used for HTTP transport where each session gets its own server.
 *
 * NOTE: For HTTP mode, this registers the same tools on session-scoped
 * server instances. The main `server` object (used by stdio) already
 * has tools registered above. This function duplicates registration
 * for session servers.
 */
function registerAllTools(srv: McpServer): void {
  // Tool 1: fedreg_search_documents
  srv.registerTool(
    "fedreg_search_documents",
    {
      title: "Search Federal Register Documents",
      description:
        "Search Federal Register documents (rules, proposed rules, notices, presidential documents). " +
        "Filter by keyword query, document type, agency, date range, topics, and economic significance. " +
        "Returns title, abstract, agencies, publication date, document number, type, and URLs. " +
        "Healthcare-relevant agency slugs include: " +
        Object.entries(HEALTHCARE_AGENCIES)
          .map(([abbr, slug]) => `${abbr}=${slug}`)
          .join(", ") +
        ".",
      inputSchema: z.object({
        query: z.string().optional().describe("Full-text search query"),
        document_type: z.array(DocumentTypeEnum).optional().describe("Filter by document type"),
        agencies: z.array(z.string()).optional().describe("Filter by agency slugs"),
        date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
        date_to: z.string().optional().describe("End date YYYY-MM-DD"),
        topics: z.array(z.string()).optional().describe("Filter by topics"),
        significant: z.boolean().optional().describe("Economically significant rules only"),
        limit: z.number().int().min(1).max(100).default(20).describe("Results per page (1-100)"),
        page: z.number().int().min(1).default(1).describe("Page number"),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await client.searchDocuments({
          query: args.query,
          document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
          agencies: args.agencies,
          date_from: args.date_from,
          date_to: args.date_to,
          topics: args.topics,
          significant: args.significant,
          limit: args.limit,
          page: args.page,
        });
        const header = [
          `Federal Register Search Results`,
          `Total: ${result.count.toLocaleString()} documents`,
          `Page: ${args.page ?? 1} of ${result.total_pages}`,
          `Showing: ${result.results.length} results`,
          "",
        ].join("\n");
        const documents = result.results
          .map((doc, i) => formatDocument(doc as unknown as Record<string, unknown>, i))
          .join("\n\n");
        const footer = result.next_page_url
          ? `\n\n[Next page available — increment page parameter to ${(args.page ?? 1) + 1}]`
          : "";
        return { content: [{ type: "text" as const, text: truncate(header + documents + footer) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 2: fedreg_get_document
  srv.registerTool(
    "fedreg_get_document",
    {
      title: "Get Federal Register Document",
      description:
        "Get full details for a specific Federal Register document by its document number.",
      inputSchema: z.object({
        document_number: z.string().describe("Federal Register document number"),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const doc = await client.getDocument(args.document_number);
        return { content: [{ type: "text" as const, text: truncate(formatDocument(doc as unknown as Record<string, unknown>)) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 3: fedreg_search_public_inspection
  srv.registerTool(
    "fedreg_search_public_inspection",
    {
      title: "Search Public Inspection Documents",
      description:
        "Search documents currently on public inspection (pre-publication). Early warning for regulatory changes.",
      inputSchema: z.object({
        agencies: z.array(z.string()).optional().describe("Filter by agency slugs"),
        document_type: z.array(DocumentTypeEnum).optional().describe("Filter by document type"),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await client.searchPublicInspection({
          agencies: args.agencies,
          document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
        });
        const header = [
          `Public Inspection Documents`,
          `Total: ${result.count} documents`,
          `Showing: ${result.results.length} results`,
          "",
        ].join("\n");
        const documents = result.results
          .map((doc, i) => formatPublicInspection(doc as unknown as Record<string, unknown>, i))
          .join("\n\n");
        return { content: [{ type: "text" as const, text: truncate(header + documents) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 4: fedreg_list_agencies
  srv.registerTool(
    "fedreg_list_agencies",
    {
      title: "List Federal Register Agencies",
      description: "List all agencies registered with the Federal Register.",
      inputSchema: z.object({
        query: z.string().optional().describe("Optional text to filter agencies by name"),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        let agencies = await client.listAgencies();
        if (args.query) {
          const q = args.query.toLowerCase();
          agencies = agencies.filter(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              (a.short_name?.toLowerCase().includes(q) ?? false) ||
              a.slug.toLowerCase().includes(q) ||
              (a.description?.toLowerCase().includes(q) ?? false),
          );
        }
        const header = `Federal Register Agencies\nTotal: ${agencies.length}${args.query ? ` matching "${args.query}"` : ""}\n\n`;
        const lines = agencies.map((a) => {
          const parts = [a.name];
          if (a.short_name) parts.push(`(${a.short_name})`);
          parts.push(`| slug: ${a.slug}`);
          return parts.join(" ");
        });
        return { content: [{ type: "text" as const, text: truncate(header + lines.join("\n")) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 5: fedreg_count_by_agency
  srv.registerTool(
    "fedreg_count_by_agency",
    {
      title: "Count Documents by Agency",
      description: "Count Federal Register documents by agency over a time period for trend analysis.",
      inputSchema: z.object({
        agency_slug: z.string().describe("Agency slug"),
        date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
        date_to: z.string().optional().describe("End date YYYY-MM-DD"),
        document_type: z.array(DocumentTypeEnum).optional().describe("Filter by document type"),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await client.countByAgency({
          agency_slug: args.agency_slug,
          date_from: args.date_from,
          date_to: args.date_to,
          document_type: args.document_type as (typeof DOCUMENT_TYPES)[number][] | undefined,
        });
        const lines = [
          `Document Count for Agency: ${result.agency_slug}`,
          `Count: ${result.count.toLocaleString()}`,
        ];
        if (result.date_from || result.date_to) {
          lines.push(`Period: ${result.date_from ?? "beginning"} to ${result.date_to ?? "present"}`);
        }
        if (result.document_types?.length) {
          lines.push(`Document Types: ${result.document_types.join(", ")}`);
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}

// ─── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useHttp = args.includes("--http");

  if (useHttp) {
    const portIndex = args.indexOf("--port");
    const port =
      portIndex !== -1 && args[portIndex + 1]
        ? parseInt(args[portIndex + 1], 10)
        : DEFAULT_HTTP_PORT;
    await startHttp(port);
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

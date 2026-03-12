/**
 * CBO MCP Server
 *
 * Provides AI agents with access to Congressional Budget Office (CBO)
 * publications, cost estimates, budget projections, and healthcare policy
 * analyses. Designed for the Protoprism healthcare AI research platform.
 *
 * Supports stdio (default) and streamable HTTP transports.
 * No API key required - uses public RSS feeds and web pages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  fetchRSSFeed,
  fetchPublication,
  searchPublications,
  truncateResponse,
  type RSSItem,
} from "./api-client.js";
import {
  URLS,
  CBO_TOPICS,
  HEALTHCARE_TOPIC_SLUGS,
  ALL_TOPIC_SLUGS,
  DEFAULT_LIMIT,
  MAX_RESULTS,
} from "./constants.js";

// ─── Server Setup ────────────────────────────────────────────

const server = new McpServer(
  {
    name: "cbo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Filter RSS items by keyword (case-insensitive match on title + description).
 */
function filterByKeyword<T extends RSSItem>(items: T[], keyword?: string): T[] {
  if (!keyword) return items;
  const lower = keyword.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower),
  );
}

/**
 * Filter RSS items by date range.
 */
function filterByDateRange<T extends RSSItem>(
  items: T[],
  dateFrom?: string,
  dateTo?: string,
): T[] {
  if (!dateFrom && !dateTo) return items;

  return items.filter((item) => {
    if (!item.pubDate) return true;
    const itemDate = new Date(item.pubDate);
    if (isNaN(itemDate.getTime())) return true;

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime()) && itemDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime()) && itemDate > to) return false;
    }
    return true;
  });
}

/**
 * Paginate an array of items.
 */
function paginate<T>(items: T[], limit: number, offset: number): T[] {
  return items.slice(offset, offset + limit);
}

/**
 * Build a standard tool success response with truncation handling.
 */
function successResponse(data: unknown) {
  const serialized = JSON.stringify(data, null, 2);
  const { text, truncated } = truncateResponse(serialized);

  if (truncated) {
    return {
      content: [{ type: "text" as const, text }],
    };
  }

  return {
    content: [{ type: "text" as const, text: serialized }],
  };
}

/**
 * Build a standard tool error response.
 */
function errorResponse(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unknown error occurred",
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ─── Tool 1: Search Publications ─────────────────────────────

server.registerTool(
  "cbo_search_publications",
  {
    title: "Search CBO Publications",
    description:
      "Search Congressional Budget Office publications by keyword and optional topic filter. " +
      "Returns publication titles, dates, URLs, descriptions, and CBO publication IDs. " +
      "Covers reports, analyses, cost estimates, and projections published by CBO. " +
      "Useful for finding budget analyses, economic forecasts, and policy impact assessments.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .describe(
            "Search keyword or phrase to find in CBO publications. " +
              "Searches across titles and descriptions. " +
              "E.g., 'Medicare spending', 'ACA repeal', 'drug pricing', 'deficit projections'.",
          ),
        topic: z
          .enum(ALL_TOPIC_SLUGS as [string, ...string[]])
          .optional()
          .describe(
            "Optional CBO topic category to filter by. " +
              "Healthcare topics: health, medicare, medicaid-and-chip, health-insurance. " +
              "Other topics: budget, economy, taxes, social-security, defense-and-national-security, etc.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-50, default 10)."),
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
      let items: RSSItem[];

      if (args.topic) {
        // Fetch topic-specific RSS feed and filter by keyword
        const feedUrl = URLS.TOPIC_RSS(args.topic);
        items = await fetchRSSFeed(feedUrl);
        items = filterByKeyword(items, args.keyword);
      } else {
        // Use the search RSS feed
        items = await searchPublications(args.keyword);
      }

      const total = items.length;
      const paged = paginate(items, args.limit, args.offset);

      return successResponse({
        query: args.keyword,
        topic: args.topic ?? "all",
        total,
        count: paged.length,
        offset: args.offset,
        has_more: args.offset + paged.length < total,
        results: paged.map((item) => ({
          title: item.title,
          url: item.link,
          date: item.pubDate,
          description: item.description,
          publication_id: item.publicationId ?? null,
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 2: Get Publication Detail ──────────────────────────

server.registerTool(
  "cbo_get_publication",
  {
    title: "Get CBO Publication",
    description:
      "Get detailed content for a specific CBO publication by URL or publication ID. " +
      "Fetches the publication page and extracts title, date, summary, key content text, " +
      "and associated topics. Content is returned as extracted text (HTML stripped) " +
      "and truncated to 25,000 characters. Use cbo_search_publications first to find " +
      "publication URLs or IDs.",
    inputSchema: z
      .object({
        url: z
          .string()
          .optional()
          .describe(
            "Full URL of the CBO publication page. " +
              "E.g., 'https://www.cbo.gov/publication/59946'. " +
              "Provide either url or publication_id.",
          ),
        publication_id: z
          .string()
          .optional()
          .describe(
            "CBO publication ID number. " +
              "E.g., '59946'. Will construct URL as https://www.cbo.gov/publication/{id}. " +
              "Provide either url or publication_id.",
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
      let pubUrl: string;

      if (args.url) {
        pubUrl = args.url;
      } else if (args.publication_id) {
        pubUrl = URLS.PUBLICATION(args.publication_id);
      } else {
        return errorResponse(
          new Error(
            "Either 'url' or 'publication_id' is required. " +
              "Use cbo_search_publications to find publication URLs or IDs.",
          ),
        );
      }

      const publication = await fetchPublication(pubUrl);

      return successResponse({
        title: publication.title,
        url: publication.url,
        publication_id: publication.publicationId ?? null,
        date: publication.date ?? null,
        summary: publication.summary ?? null,
        topics: publication.topics ?? [],
        content: publication.content,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 3: Search Cost Estimates ───────────────────────────

server.registerTool(
  "cbo_search_cost_estimates",
  {
    title: "Search CBO Cost Estimates",
    description:
      "Search CBO cost estimates (scores) of proposed legislation. " +
      "CBO cost estimates analyze the budgetary impact of bills and legislative proposals, " +
      "including projected spending changes, revenue effects, and deficit impact over 10-year windows. " +
      "Results include bill title, estimated cost/savings description, date, and link to full estimate. " +
      "Essential for legislative pipeline analysis and budget impact assessment.",
    inputSchema: z
      .object({
        keyword: z
          .string()
          .describe(
            "Search keyword for cost estimates. " +
              "E.g., 'drug pricing', 'Medicare', 'Affordable Care Act', 'appropriations'. " +
              "Matches against bill titles and estimate descriptions.",
          ),
        date_from: z
          .string()
          .optional()
          .describe(
            "Filter estimates published on or after this date. " +
              "Format: YYYY-MM-DD (e.g., '2024-01-01').",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "Filter estimates published on or before this date. " +
              "Format: YYYY-MM-DD (e.g., '2024-12-31').",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-50, default 10)."),
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
      // Fetch cost estimates RSS feed
      let items = await fetchRSSFeed(URLS.COST_ESTIMATES_RSS);

      // Filter by keyword
      items = filterByKeyword(items, args.keyword);

      // Filter by date range
      items = filterByDateRange(items, args.date_from, args.date_to);

      const total = items.length;
      const paged = paginate(items, args.limit, args.offset);

      return successResponse({
        query: args.keyword,
        date_from: args.date_from ?? null,
        date_to: args.date_to ?? null,
        total,
        count: paged.length,
        offset: args.offset,
        has_more: args.offset + paged.length < total,
        results: paged.map((item) => ({
          title: item.title,
          url: item.link,
          date: item.pubDate,
          description: item.description,
          publication_id: item.publicationId ?? null,
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 4: Get Healthcare Publications ─────────────────────

server.registerTool(
  "cbo_get_healthcare_publications",
  {
    title: "Get CBO Healthcare Publications",
    description:
      "Fetch recent CBO publications specifically about healthcare topics. " +
      "Combines publications from health, medicare, medicaid-and-chip, and health-insurance " +
      "topic feeds into a single chronological list. Useful for monitoring CBO healthcare " +
      "policy analysis, spending projections, and program evaluations. " +
      "Returns title, date, topic, URL, and description for each publication.",
    inputSchema: z
      .object({
        topic: z
          .enum(HEALTHCARE_TOPIC_SLUGS as [string, ...string[]])
          .optional()
          .describe(
            "Optional: filter to a specific healthcare topic. " +
              "Options: health, medicare, medicaid-and-chip, health-insurance. " +
              "If omitted, fetches from all four healthcare topic feeds.",
          ),
        keyword: z
          .string()
          .optional()
          .describe(
            "Optional keyword to further filter healthcare publications. " +
              "E.g., 'spending', 'enrollment', 'premiums', 'Part D'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .default(DEFAULT_LIMIT)
          .describe("Number of results to return (1-50, default 10)."),
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
      const topicsToFetch = args.topic
        ? [args.topic]
        : HEALTHCARE_TOPIC_SLUGS;

      // Fetch publications from each healthcare topic feed
      const allItems: (RSSItem & { topic: string })[] = [];

      for (const topicSlug of topicsToFetch) {
        try {
          const feedUrl = URLS.TOPIC_RSS(topicSlug);
          const items = await fetchRSSFeed(feedUrl);
          const topicInfo = CBO_TOPICS.find((t) => t.slug === topicSlug);
          const topicName = topicInfo?.name ?? topicSlug;

          for (const item of items) {
            allItems.push({ ...item, topic: topicName });
          }
        } catch {
          // Skip topics that fail to fetch; continue with others
          console.error(`[cbo-mcp] Failed to fetch topic: ${topicSlug}`);
        }
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      const uniqueItems = allItems.filter((item) => {
        if (seen.has(item.link)) return false;
        seen.add(item.link);
        return true;
      });

      // Sort by date descending (most recent first)
      uniqueItems.sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
        return dateB.getTime() - dateA.getTime();
      });

      // Filter by keyword if provided
      const filtered = args.keyword
        ? filterByKeyword(uniqueItems, args.keyword)
        : uniqueItems;

      const total = filtered.length;
      const paged = paginate(filtered, args.limit, args.offset);

      return successResponse({
        topics_searched: topicsToFetch,
        keyword: args.keyword ?? null,
        total,
        count: paged.length,
        offset: args.offset,
        has_more: args.offset + paged.length < total,
        results: paged.map((item) => ({
          title: item.title,
          url: item.link,
          date: item.pubDate,
          topic: item.topic,
          description: item.description,
          publication_id: item.publicationId ?? null,
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Tool 5: List Topics ────────────────────────────────────

server.registerTool(
  "cbo_list_topics",
  {
    title: "List CBO Topics",
    description:
      "List available CBO topic categories with descriptions. " +
      "Each topic has a slug (used for filtering in other tools), a human-readable name, " +
      "a description of what it covers, and a flag indicating whether it is healthcare-related. " +
      "Use this to discover valid topic slugs for cbo_search_publications and " +
      "cbo_get_healthcare_publications.",
    inputSchema: z
      .object({
        healthcare_only: z
          .boolean()
          .default(false)
          .describe(
            "If true, return only healthcare-related topics. Default false returns all topics.",
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
      const topics = args.healthcare_only
        ? CBO_TOPICS.filter((t) => t.isHealthcareRelated)
        : CBO_TOPICS;

      return successResponse({
        total: topics.length,
        healthcare_topics: CBO_TOPICS.filter((t) => t.isHealthcareRelated)
          .length,
        topics: topics.map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          is_healthcare_related: t.isHealthcareRelated,
          feed_url: URLS.TOPIC_RSS(t.slug),
          page_url: URLS.TOPIC_PAGE(t.slug),
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ─── Transport & Startup ─────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isHttp =
    args.includes("--http") ||
    process.env.TRANSPORT?.toLowerCase() === "http" ||
    process.env.TRANSPORT?.toLowerCase() === "streamable-http";

  if (isHttp) {
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");

    const portFlag = args.indexOf("--port");
    const port =
      portFlag !== -1 && args[portFlag + 1]
        ? parseInt(args[portFlag + 1], 10)
        : parseInt(process.env.PORT ?? "3019", 10);

    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "cbo-mcp" }));
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
      console.error(`[cbo-mcp] HTTP server listening on port ${port}`);
      console.error(
        `[cbo-mcp] MCP endpoint: http://localhost:${port}/mcp`,
      );
      console.error(`[cbo-mcp] Health check: http://localhost:${port}/health`);
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[cbo-mcp] Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("[cbo-mcp] Fatal error:", error);
  process.exit(1);
});

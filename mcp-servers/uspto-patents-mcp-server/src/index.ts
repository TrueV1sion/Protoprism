#!/usr/bin/env node

/**
 * USPTO PatentsView MCP Server
 *
 * Provides patent search, citation analysis, and classification lookup
 * tools via the PatentsView API for healthcare AI research agents.
 *
 * Supports both stdio and HTTP transport modes:
 *   stdio (default): node dist/index.js
 *   HTTP:            node dist/index.js --http [--port PORT]
 *
 * No API key required. Rate limited to 45 requests/minute by PatentsView.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { PatentsViewClient } from "./api-client.js";
import {
  CHARACTER_LIMIT,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PATENT_SEARCH_FIELDS,
  PATENT_DETAIL_FIELDS,
  ASSIGNEE_SEARCH_FIELDS,
  CPC_SEARCH_FIELDS,
  CITATION_FIELDS,
  HEALTHCARE_CPC_SECTIONS,
} from "./constants.js";

// ─── Initialization ─────────────────────────────────────────

const client = new PatentsViewClient();

const server = new McpServer(
  {
    name: "uspto-patents-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Helpers ────────────────────────────────────────────────

/**
 * Truncate a string to the character limit, appending a notice if truncated.
 */
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT - 100) +
    "\n\n[... Output truncated. Refine your query for more specific results.]"
  );
}

/**
 * Format a patent result into a readable string.
 */
function formatPatent(patent: Record<string, unknown>): string {
  const parts: string[] = [];

  const num = patent.patent_number as string | undefined;
  const title = patent.patent_title as string | undefined;
  const date = patent.patent_date as string | undefined;
  const abstract = patent.patent_abstract as string | undefined;
  const citations = patent.patent_num_cited_by_us_patents as number | undefined;

  if (num) parts.push(`Patent: US${num}`);
  if (title) parts.push(`Title: ${title}`);
  if (date) parts.push(`Date: ${date}`);
  if (citations !== undefined) parts.push(`Cited by: ${citations} patents`);

  // Assignees
  const assignees = patent.assignees as
    | Array<{ assignee_organization?: string | null }>
    | undefined;
  if (assignees?.length) {
    const orgs = assignees
      .map((a) => a.assignee_organization)
      .filter(Boolean)
      .join(", ");
    if (orgs) parts.push(`Assignee(s): ${orgs}`);
  }

  // Inventors
  const inventors = patent.inventors as
    | Array<{
        inventor_first_name?: string;
        inventor_last_name?: string;
      }>
    | undefined;
  if (inventors?.length) {
    const names = inventors
      .map((i) => `${i.inventor_first_name ?? ""} ${i.inventor_last_name ?? ""}`.trim())
      .filter(Boolean)
      .join(", ");
    if (names) parts.push(`Inventor(s): ${names}`);
  }

  // CPC Classifications
  const cpcs = patent.cpcs as
    | Array<{
        cpc_group_id?: string;
        cpc_group_title?: string;
        cpc_subsection_id?: string;
        cpc_subsection_title?: string;
      }>
    | undefined;
  if (cpcs?.length) {
    const uniqueCpcs = new Map<string, string>();
    for (const cpc of cpcs) {
      const id = cpc.cpc_group_id ?? cpc.cpc_subsection_id;
      const title = cpc.cpc_group_title ?? cpc.cpc_subsection_title;
      if (id && !uniqueCpcs.has(id)) {
        uniqueCpcs.set(id, title ?? "");
      }
    }
    const cpcList = [...uniqueCpcs.entries()]
      .map(([id, title]) => (title ? `${id} (${title})` : id))
      .join("; ");
    if (cpcList) parts.push(`CPC: ${cpcList}`);
  }

  if (abstract) parts.push(`Abstract: ${abstract}`);

  return parts.join("\n");
}

/**
 * Format citation information for a patent.
 */
function formatCitations(patent: Record<string, unknown>): string {
  const parts: string[] = [];

  const num = patent.patent_number as string | undefined;
  const title = patent.patent_title as string | undefined;
  const totalCitations = patent.patent_num_combined_citations as number | undefined;
  const citedByCount = patent.patent_num_cited_by_us_patents as number | undefined;

  parts.push("=== Citation Analysis ===");
  if (num) parts.push(`Patent: US${num}`);
  if (title) parts.push(`Title: ${title}`);
  if (totalCitations !== undefined)
    parts.push(`Total citations made: ${totalCitations}`);
  if (citedByCount !== undefined)
    parts.push(`Cited by: ${citedByCount} patents`);

  // Cited patents (references this patent makes)
  const cited = patent.cited_patents as
    | Array<{
        cited_patent_number?: string;
        cited_patent_title?: string;
        cited_patent_date?: string;
        cited_patent_category?: string;
      }>
    | undefined;

  if (cited?.length) {
    parts.push(`\n--- References (${cited.length} patents cited) ---`);
    for (const ref of cited.slice(0, 25)) {
      const refParts: string[] = [];
      if (ref.cited_patent_number) refParts.push(`US${ref.cited_patent_number}`);
      if (ref.cited_patent_title) refParts.push(ref.cited_patent_title);
      if (ref.cited_patent_date) refParts.push(`(${ref.cited_patent_date})`);
      if (ref.cited_patent_category) refParts.push(`[${ref.cited_patent_category}]`);
      parts.push(`  - ${refParts.join(" | ")}`);
    }
    if (cited.length > 25) {
      parts.push(`  ... and ${cited.length - 25} more references`);
    }
  }

  // Citing patents (patents that cite this one)
  const citedBy = patent.citedby_patents as
    | Array<{
        citedby_patent_number?: string;
        citedby_patent_title?: string;
        citedby_patent_date?: string;
      }>
    | undefined;

  if (citedBy?.length) {
    parts.push(`\n--- Citing Patents (${citedBy.length} found) ---`);
    for (const citing of citedBy.slice(0, 25)) {
      const citeParts: string[] = [];
      if (citing.citedby_patent_number)
        citeParts.push(`US${citing.citedby_patent_number}`);
      if (citing.citedby_patent_title) citeParts.push(citing.citedby_patent_title);
      if (citing.citedby_patent_date) citeParts.push(`(${citing.citedby_patent_date})`);
      parts.push(`  - ${citeParts.join(" | ")}`);
    }
    if (citedBy.length > 25) {
      parts.push(`  ... and ${citedBy.length - 25} more citing patents`);
    }
  }

  // Assignee (for competitive landscape context)
  const assignees = patent.assignees as
    | Array<{ assignee_organization?: string | null }>
    | undefined;
  if (assignees?.length) {
    const orgs = assignees
      .map((a) => a.assignee_organization)
      .filter(Boolean);
    if (orgs.length) {
      parts.push(`\nAssignee(s): ${orgs.join(", ")}`);
    }
  }

  return parts.join("\n");
}

// ─── Tool: patents_search ───────────────────────────────────

server.registerTool(
  "patents_search",
  {
    title: "Search Patents",
    description:
      "Search USPTO patents by keywords, assignee, inventor, CPC classification, and date range. " +
      "Returns patent numbers, titles, abstracts, assignees, inventors, and CPC codes. " +
      "Healthcare-relevant CPC sections include: A61 (Medical/Veterinary), C07 (Organic Chemistry), " +
      "C12 (Biochemistry/Genetics), G16H (Healthcare Informatics).",
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Full-text search keywords to match against patent abstracts (e.g. 'mRNA vaccine delivery')",
          ),
        assignee: z
          .string()
          .optional()
          .describe(
            "Organization/company name to filter by (e.g. 'Moderna', 'Pfizer')",
          ),
        inventor: z
          .string()
          .optional()
          .describe("Inventor name to search for (first or last name)"),
        cpc_section: z
          .string()
          .optional()
          .describe(
            "CPC classification prefix to filter by (e.g. 'A61' for medical, 'C12' for biochemistry, 'G16H' for healthcare informatics)",
          ),
        date_from: z
          .string()
          .optional()
          .describe("Start date filter in YYYY-MM-DD format"),
        date_to: z
          .string()
          .optional()
          .describe("End date filter in YYYY-MM-DD format"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(`Number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Pagination offset (default 0)"),
      })
      .strict(),
    annotations: {
      title: "Search Patents",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const response = await client.searchPatents(
        {
          query: args.query,
          assignee: args.assignee,
          inventor: args.inventor,
          cpc_section: args.cpc_section,
          date_from: args.date_from,
          date_to: args.date_to,
        },
        args.limit,
        args.offset,
        [...PATENT_SEARCH_FIELDS],
      );

      const patents = response.patents ?? [];
      const total = response.total_patent_count ?? 0;

      if (patents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No patents found matching your search criteria. Try broadening your query or adjusting date filters.",
            },
          ],
        };
      }

      const header = `Found ${total.toLocaleString()} patents (showing ${args.offset + 1}-${args.offset + patents.length}):\n`;
      const separator = "\n" + "─".repeat(60) + "\n";

      const formatted = patents
        .map((p) => formatPatent(p as unknown as Record<string, unknown>))
        .join(separator);

      const pagination =
        args.offset + patents.length < total
          ? `\n\n[Page ${Math.floor(args.offset / args.limit) + 1} of ${Math.ceil(total / args.limit)}. Use offset=${args.offset + args.limit} for next page.]`
          : "";

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + formatted + pagination),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error searching patents: ${message}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool: patents_get_patent ───────────────────────────────

server.registerTool(
  "patents_get_patent",
  {
    title: "Get Patent Details",
    description:
      "Retrieve detailed information for a specific patent by its patent number. " +
      "Returns full patent details including title, abstract, claims count, citations, " +
      "all assignees, inventors with locations, and CPC classifications.",
    inputSchema: z
      .object({
        patent_number: z
          .string()
          .describe(
            "US patent number (e.g. '11234567', '10,987,654', or 'US11234567')",
          ),
      })
      .strict(),
    annotations: {
      title: "Get Patent Details",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      // Normalize: remove 'US' prefix, commas, spaces
      const normalized = args.patent_number
        .replace(/^US/i, "")
        .replace(/[,\s-]/g, "")
        .replace(/^0+/, "");

      const response = await client.getPatent(normalized, [...PATENT_DETAIL_FIELDS]);

      const patents = response.patents ?? [];

      if (patents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No patent found with number "${args.patent_number}". Verify the patent number and try again.`,
            },
          ],
        };
      }

      const patent = patents[0] as unknown as Record<string, unknown>;
      const parts: string[] = [];

      // Basic info
      parts.push(`=== Patent US${patent.patent_number} ===`);
      if (patent.patent_title) parts.push(`Title: ${patent.patent_title}`);
      if (patent.patent_date) parts.push(`Date: ${patent.patent_date}`);
      if (patent.patent_type) parts.push(`Type: ${patent.patent_type}`);
      if (patent.patent_kind) parts.push(`Kind: ${patent.patent_kind}`);
      if (patent.patent_num_claims !== undefined)
        parts.push(`Claims: ${patent.patent_num_claims}`);
      if (patent.patent_num_cited_by_us_patents !== undefined)
        parts.push(`Cited by: ${patent.patent_num_cited_by_us_patents} patents`);
      if (patent.patent_num_combined_citations !== undefined)
        parts.push(`Total citations: ${patent.patent_num_combined_citations}`);

      // Location info
      if (patent.patent_firstnamed_assignee_city || patent.patent_firstnamed_assignee_country) {
        parts.push(
          `Assignee Location: ${patent.patent_firstnamed_assignee_city ?? ""}, ${patent.patent_firstnamed_assignee_country ?? ""}`.trim(),
        );
      }

      // Assignees
      const assignees = patent.assignees as
        | Array<{ assignee_organization?: string | null; assignee_type?: string }>
        | undefined;
      if (assignees?.length) {
        parts.push("\n--- Assignees ---");
        for (const a of assignees) {
          if (a.assignee_organization) {
            const typeStr = a.assignee_type ? ` (Type: ${a.assignee_type})` : "";
            parts.push(`  - ${a.assignee_organization}${typeStr}`);
          }
        }
      }

      // Inventors
      const inventors = patent.inventors as
        | Array<{
            inventor_first_name?: string;
            inventor_last_name?: string;
            inventor_city?: string;
            inventor_state?: string;
            inventor_country?: string;
          }>
        | undefined;
      if (inventors?.length) {
        parts.push("\n--- Inventors ---");
        for (const inv of inventors) {
          const name = `${inv.inventor_first_name ?? ""} ${inv.inventor_last_name ?? ""}`.trim();
          const loc = [inv.inventor_city, inv.inventor_state, inv.inventor_country]
            .filter(Boolean)
            .join(", ");
          parts.push(`  - ${name}${loc ? ` (${loc})` : ""}`);
        }
      }

      // CPC Classifications
      const cpcs = patent.cpcs as
        | Array<{
            cpc_section_id?: string;
            cpc_subsection_id?: string;
            cpc_subsection_title?: string;
            cpc_group_id?: string;
            cpc_group_title?: string;
            cpc_subgroup_id?: string;
            cpc_subgroup_title?: string;
          }>
        | undefined;
      if (cpcs?.length) {
        parts.push("\n--- CPC Classifications ---");
        const seen = new Set<string>();
        for (const cpc of cpcs) {
          const id = cpc.cpc_subgroup_id ?? cpc.cpc_group_id ?? cpc.cpc_subsection_id;
          if (id && !seen.has(id)) {
            seen.add(id);
            const title =
              cpc.cpc_subgroup_title ??
              cpc.cpc_group_title ??
              cpc.cpc_subsection_title;
            parts.push(`  - ${id}${title ? `: ${title}` : ""}`);
          }
        }
      }

      // Cited patents
      const cited = patent.cited_patents as
        | Array<{
            cited_patent_number?: string;
            cited_patent_title?: string;
            cited_patent_date?: string;
          }>
        | undefined;
      if (cited?.length) {
        parts.push(`\n--- References (${cited.length} cited) ---`);
        for (const ref of cited.slice(0, 15)) {
          const refParts: string[] = [];
          if (ref.cited_patent_number) refParts.push(`US${ref.cited_patent_number}`);
          if (ref.cited_patent_title) refParts.push(ref.cited_patent_title);
          if (ref.cited_patent_date) refParts.push(`(${ref.cited_patent_date})`);
          parts.push(`  - ${refParts.join(" | ")}`);
        }
        if (cited.length > 15)
          parts.push(`  ... and ${cited.length - 15} more`);
      }

      // Citing patents
      const citedBy = patent.citedby_patents as
        | Array<{
            citedby_patent_number?: string;
            citedby_patent_title?: string;
            citedby_patent_date?: string;
          }>
        | undefined;
      if (citedBy?.length) {
        parts.push(`\n--- Citing Patents (${citedBy.length} found) ---`);
        for (const c of citedBy.slice(0, 15)) {
          const cParts: string[] = [];
          if (c.citedby_patent_number)
            cParts.push(`US${c.citedby_patent_number}`);
          if (c.citedby_patent_title) cParts.push(c.citedby_patent_title);
          if (c.citedby_patent_date) cParts.push(`(${c.citedby_patent_date})`);
          parts.push(`  - ${cParts.join(" | ")}`);
        }
        if (citedBy.length > 15)
          parts.push(`  ... and ${citedBy.length - 15} more`);
      }

      // Abstract (last, since it can be long)
      if (patent.patent_abstract) {
        parts.push(`\n--- Abstract ---\n${patent.patent_abstract}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(parts.join("\n")),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: "text" as const, text: `Error fetching patent details: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: patents_search_assignees ─────────────────────────

server.registerTool(
  "patents_search_assignees",
  {
    title: "Search Patent Assignees",
    description:
      "Search patent assignees (companies and organizations) by name. " +
      "Returns organizations with their patent counts, date ranges, and recent patents. " +
      "Useful for competitive landscape analysis and identifying key players in a technology area.",
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "Organization name to search for (e.g. 'Johnson & Johnson', 'Medtronic', 'Illumina')",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(`Number of results to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`),
      })
      .strict(),
    annotations: {
      title: "Search Patent Assignees",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const response = await client.searchAssignees(
        args.query,
        args.limit,
        [...ASSIGNEE_SEARCH_FIELDS],
      );

      const assignees = response.assignees ?? [];
      const total = response.total_assignee_count ?? 0;

      if (assignees.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No assignees found matching "${args.query}". Try a broader search term or check spelling.`,
            },
          ],
        };
      }

      const header = `Found ${total.toLocaleString()} assignees matching "${args.query}" (showing top ${assignees.length}):\n`;
      const separator = "\n" + "─".repeat(60) + "\n";

      const formatted = assignees
        .map((a) => {
          const parts: string[] = [];
          if (a.assignee_organization)
            parts.push(`Organization: ${a.assignee_organization}`);
          if (a.assignee_type) parts.push(`Type: ${a.assignee_type}`);
          if (a.assignee_total_num_patents !== undefined)
            parts.push(`Total Patents: ${a.assignee_total_num_patents.toLocaleString()}`);
          if (a.assignee_first_seen_date)
            parts.push(`First Patent: ${a.assignee_first_seen_date}`);
          if (a.assignee_last_seen_date)
            parts.push(`Most Recent: ${a.assignee_last_seen_date}`);

          // Recent patents
          const patents = (a as unknown as Record<string, unknown>)
            .patents as
            | Array<{
                patent_number?: string;
                patent_title?: string;
                patent_date?: string;
              }>
            | undefined;
          if (patents?.length) {
            parts.push("Recent Patents:");
            for (const p of patents.slice(0, 5)) {
              const pParts: string[] = [];
              if (p.patent_number) pParts.push(`US${p.patent_number}`);
              if (p.patent_title) pParts.push(p.patent_title);
              if (p.patent_date) pParts.push(`(${p.patent_date})`);
              parts.push(`  - ${pParts.join(" | ")}`);
            }
            if (patents.length > 5)
              parts.push(`  ... and ${patents.length - 5} more`);
          }

          return parts.join("\n");
        })
        .join(separator);

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + formatted),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          { type: "text" as const, text: `Error searching assignees: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: patents_search_cpc ───────────────────────────────

server.registerTool(
  "patents_search_cpc",
  {
    title: "Search CPC Classifications",
    description:
      "Search CPC (Cooperative Patent Classification) codes and subsections. " +
      "Returns classification codes with patent counts, assignee counts, and inventor counts. " +
      "Healthcare-relevant sections:\n" +
      Object.entries(HEALTHCARE_CPC_SECTIONS)
        .map(([code, desc]) => `  - ${code}: ${desc}`)
        .join("\n"),
    inputSchema: z
      .object({
        query: z
          .string()
          .optional()
          .describe(
            "Text to search in CPC subsection titles (e.g. 'drug delivery', 'diagnostic imaging')",
          ),
        section_id: z
          .string()
          .optional()
          .describe(
            "CPC section/subsection prefix to filter by (e.g. 'A61' for medical, 'A61K' for medicinal preparations, 'G16H' for healthcare informatics)",
          ),
      })
      .strict(),
    annotations: {
      title: "Search CPC Classifications",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      if (!args.query && !args.section_id) {
        // Return healthcare-relevant CPC overview
        const parts = [
          "Healthcare-Relevant CPC Classifications:",
          "",
          ...Object.entries(HEALTHCARE_CPC_SECTIONS).map(
            ([code, desc]) => `  ${code}: ${desc}`,
          ),
          "",
          "Use section_id parameter to explore specific sections (e.g. section_id='A61K' for medicinal preparations).",
          "Use query parameter to search by keyword (e.g. query='surgical robot').",
        ];
        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
        };
      }

      const response = await client.searchCPC(
        { query: args.query, section_id: args.section_id },
        50,
        [...CPC_SEARCH_FIELDS],
      );

      const subsections = response.cpc_subsections ?? [];
      const total = response.total_cpc_subsection_count ?? 0;

      if (subsections.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No CPC classifications found matching your criteria. Try a broader search or different section_id.",
            },
          ],
        };
      }

      const header = `Found ${total} CPC subsections (showing ${subsections.length}):\n\n`;

      const formatted = subsections
        .map((s) => {
          const parts: string[] = [];
          parts.push(`${s.cpc_subsection_id}: ${s.cpc_subsection_title}`);
          if (s.cpc_total_num_patents !== undefined)
            parts.push(`  Patents: ${s.cpc_total_num_patents.toLocaleString()}`);
          if (s.cpc_total_num_assignees !== undefined)
            parts.push(`  Assignees: ${s.cpc_total_num_assignees.toLocaleString()}`);
          if (s.cpc_total_num_inventors !== undefined)
            parts.push(`  Inventors: ${s.cpc_total_num_inventors.toLocaleString()}`);
          return parts.join("\n");
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(header + formatted),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching CPC classifications: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: patents_citation_analysis ────────────────────────

server.registerTool(
  "patents_citation_analysis",
  {
    title: "Patent Citation Analysis",
    description:
      "Analyze the citation network for a specific patent. " +
      "Returns both the patents cited BY this patent (prior art/references) " +
      "and patents that CITE this patent (impact/influence). " +
      "Useful for competitive landscape analysis, technology evolution tracking, " +
      "and identifying key patents in a domain.",
    inputSchema: z
      .object({
        patent_number: z
          .string()
          .describe(
            "US patent number to analyze citations for (e.g. '11234567')",
          ),
      })
      .strict(),
    annotations: {
      title: "Patent Citation Analysis",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const normalized = args.patent_number
        .replace(/^US/i, "")
        .replace(/[,\s-]/g, "")
        .replace(/^0+/, "");

      const response = await client.getCitations(normalized, [
        ...CITATION_FIELDS,
      ]);

      const patents = response.patents ?? [];

      if (patents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No patent found with number "${args.patent_number}". Verify the patent number and try again.`,
            },
          ],
        };
      }

      const patent = patents[0] as unknown as Record<string, unknown>;
      const text = formatCitations(patent);

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(text),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error analyzing citations: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Transport & Startup ────────────────────────────────────

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[USPTO Patents MCP] Running on stdio transport");
}

async function startHttp(port: number): Promise<void> {
  const httpServer = createServer(async (req, res) => {
    // Health check endpoint
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "uspto-patents-mcp-server" }));
      return;
    }

    // MCP endpoint
    if (req.url === "/mcp" || req.url === "/") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(port, () => {
    console.error(
      `[USPTO Patents MCP] HTTP server listening on port ${port}`,
    );
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isHttp = args.includes("--http");

  if (isHttp) {
    const portIndex = args.indexOf("--port");
    const port =
      portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3100;
    await startHttp(port);
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error("[USPTO Patents MCP] Fatal error:", error);
  process.exit(1);
});

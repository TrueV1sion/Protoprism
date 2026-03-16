// src/lib/data-sources/tools/sam-gov.tools.ts
/**
 * SAM.gov Layer 2 Granular Tools
 *
 * 2 tools that wrap SAM.gov Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { samGovClient } from "../clients/sam-gov";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
  dig,
} from "../format";

// ─── search_sam_opportunities ────────────────────────────────

const searchSamOpportunities: DataSourceTool = {
  name: "search_sam_opportunities",
  description:
    "Search SAM.gov federal contract opportunities (solicitations, RFPs, RFQs, awards). " +
    "Filter by keyword, NAICS code, posted dates, or set-aside type. Returns markdown table of matching opportunities.",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "Keyword search query" },
      naics: { type: "string", description: "NAICS industry code (e.g., '541511')" },
      posted_from: { type: "string", description: "Posted from date (MM/DD/YYYY)" },
      posted_to: { type: "string", description: "Posted to date (MM/DD/YYYY)" },
      ntype: { type: "string", description: "Notice type (e.g., 'p' for presolicitation, 'o' for solicitation)" },
      type_of_set_aside: { type: "string", description: "Set-aside type (e.g., 'SBA', 'WOSB', '8A')" },
      limit: { type: "number", description: "Max results (default 10, max 1000)" },
      offset: { type: "number", description: "Results offset for pagination (default 0)" },
    },
  },
  layer: 2,
  sources: ["sam-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await samGovClient.searchOpportunities({
      q: input.q as string | undefined,
      naics: input.naics as string | undefined,
      postedFrom: input.posted_from as string | undefined,
      postedTo: input.posted_to as string | undefined,
      ntype: input.ntype as string | undefined,
      typeOfSetAside: input.type_of_set_aside as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
      offset: (input.offset as number | undefined) ?? 0,
    });

    const headers = ["Title", "Agency", "Type", "Posted", "Due Date"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((opp) => [
      dig(opp, "title").slice(0, 70),
      dig(opp, "fullParentPathName", dig(opp, "organizationHierarchy.0.name", "—")).slice(0, 40),
      dig(opp, "type"),
      formatDate(dig(opp, "postedDate")),
      formatDate(dig(opp, "responseDeadLine", dig(opp, "archiveDate", "—"))),
    ]);

    const total = response.data.total ?? response.data.count;
    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, total ?? undefined);
    const queryDesc = (input.q as string) ?? (input.naics ? `NAICS ${input.naics as string}` : "all opportunities");

    const citation = {
      id: `[SAM-OPP-${Date.now()}]`,
      source: "SAM.gov Opportunities",
      query: queryDesc,
      resultCount: total ?? response.data.count,
    };

    return {
      content: `## SAM.gov Opportunities: ${queryDesc}\n\n**${formatNumber(total ?? response.data.count)} opportunities found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.count > 0 ? "HIGH" : "MEDIUM",
      truncated: response.data.hasMore,
    };
  },
};

// ─── search_sam_entities ─────────────────────────────────────

const searchSamEntities: DataSourceTool = {
  name: "search_sam_entities",
  description:
    "Search SAM.gov for registered business entities (contractors, vendors, grantees). " +
    "Look up by business name, UEI, CAGE code, or NAICS code. Returns registration details and status.",
  inputSchema: {
    type: "object",
    properties: {
      legal_business_name: { type: "string", description: "Business legal name (partial match supported)" },
      uei_sam: { type: "string", description: "Unique Entity Identifier (UEI)" },
      cage_code: { type: "string", description: "CAGE code" },
      naics_code: { type: "string", description: "NAICS code filter" },
      registration_status: { type: "string", description: "Registration status (e.g., 'Active')" },
      limit: { type: "number", description: "Max results (default 10, max 100)" },
      offset: { type: "number", description: "Results offset for pagination (default 0)" },
    },
  },
  layer: 2,
  sources: ["sam-gov"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await samGovClient.searchEntities({
      legalBusinessName: input.legal_business_name as string | undefined,
      ueiSAM: input.uei_sam as string | undefined,
      cageCode: input.cage_code as string | undefined,
      naicsCode: input.naics_code as string | undefined,
      registrationStatus: input.registration_status as string | undefined,
      registrationLimit: (input.limit as number | undefined) ?? 10,
      registrationOffset: (input.offset as number | undefined) ?? 0,
    });

    const headers = ["Business Name", "UEI", "CAGE", "Status", "State"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((entity) => {
      // SAM.gov API can return data at top level or nested under entityRegistration
      const reg = (entity.entityRegistration as Record<string, unknown> | undefined) ?? entity;
      const addr = (reg.physicalAddress as Record<string, unknown> | undefined) ?? {};
      return [
        (String(reg.legalBusinessName ?? "—")).slice(0, 60),
        String(reg.ueiSAM ?? "—"),
        String(reg.cageCode ?? "—"),
        String(reg.registrationStatus ?? "—"),
        String(addr.stateOrProvinceCode ?? "—"),
      ];
    });

    const total = response.data.total ?? response.data.count;
    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, total ?? undefined);
    const queryDesc =
      (input.legal_business_name as string) ??
      (input.uei_sam as string) ??
      (input.cage_code as string) ??
      "all entities";

    const citation = {
      id: `[SAM-ENT-${Date.now()}]`,
      source: "SAM.gov Entity Registry",
      query: queryDesc,
      resultCount: total ?? response.data.count,
    };

    return {
      content: `## SAM.gov Entities: ${queryDesc}\n\n**${formatNumber(total ?? response.data.count)} entities found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.count > 0 ? "HIGH" : "MEDIUM",
      truncated: response.data.hasMore,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const samGovTools: DataSourceTool[] = [
  searchSamOpportunities,
  searchSamEntities,
];

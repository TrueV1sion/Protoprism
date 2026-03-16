// src/lib/data-sources/clients/uspto-patents.ts
/**
 * USPTO PatentsView API Client (Layer 1)
 *
 * Internal HTTP client for the USPTO PatentsView REST API.
 * Uses POST requests with JSON query bodies.
 *
 * Ported from mcp-servers/uspto-patents-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.patentsview.org";

const ENDPOINTS = {
  PATENTS: "/patents/query",
  INVENTORS: "/inventors/query",
  ASSIGNEES: "/assignees/query",
  CPC_SUBSECTIONS: "/cpc_subsections/query",
} as const;

// 3 req/s — below the 45/min limit with some headroom
const clientLimiter = new TokenBucketLimiter(3);

const PATENT_SEARCH_FIELDS = [
  "patent_number",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_num_cited_by_us_patents",
  "assignee_organization",
  "inventor_first_name",
  "inventor_last_name",
  "cpc_group_id",
] as const;

const ASSIGNEE_SEARCH_FIELDS = [
  "assignee_organization",
  "assignee_type",
  "assignee_total_num_patents",
  "assignee_first_seen_date",
  "assignee_last_seen_date",
  "patent_number",
  "patent_title",
  "patent_date",
] as const;

const CPC_SEARCH_FIELDS = [
  "cpc_subsection_id",
  "cpc_subsection_title",
  "cpc_total_num_patents",
  "cpc_total_num_assignees",
  "cpc_total_num_inventors",
] as const;

// ─── Types ───────────────────────────────────────────────────

export interface PatentResult {
  patent_number: string;
  patent_title: string;
  patent_abstract?: string;
  patent_date?: string;
  patent_type?: string;
  patent_kind?: string;
  patent_num_claims?: number;
  patent_num_cited_by_us_patents?: number;
  patent_num_combined_citations?: number;
  assignees?: Array<{ assignee_organization: string | null; assignee_type?: string }>;
  inventors?: Array<{
    inventor_first_name: string;
    inventor_last_name: string;
    inventor_city?: string;
    inventor_state?: string;
    inventor_country?: string;
  }>;
  cpcs?: Array<{
    cpc_group_id?: string;
    cpc_group_title?: string;
    cpc_subgroup_id?: string;
    cpc_subgroup_title?: string;
  }>;
}

export interface AssigneeResult {
  assignee_organization: string;
  assignee_type?: string;
  assignee_total_num_patents?: number;
  assignee_first_seen_date?: string;
  assignee_last_seen_date?: string;
  patents?: Array<{ patent_number: string; patent_title: string; patent_date?: string }>;
}

export interface CPCResult {
  cpc_subsection_id: string;
  cpc_subsection_title: string;
  cpc_total_num_patents?: number;
  cpc_total_num_assignees?: number;
  cpc_total_num_inventors?: number;
}

export interface PatentsViewResult {
  patents?: PatentResult[];
  inventors?: Array<{
    inventor_first_name: string;
    inventor_last_name: string;
    inventor_total_num_patents?: number;
  }>;
  assignees?: AssigneeResult[];
  cpc_subsections?: CPCResult[];
  count: number;
  total: number;
  hasMore: boolean;
}

// ─── Response Types ───────────────────────────────────────────

interface PatentsViewApiResponse {
  patents?: PatentResult[];
  inventors?: unknown[];
  assignees?: AssigneeResult[];
  cpc_subsections?: CPCResult[];
  count: number;
  total_patent_count?: number;
  total_inventor_count?: number;
  total_assignee_count?: number;
  total_cpc_subsection_count?: number;
}

// ─── Core Request ────────────────────────────────────────────

async function makePostRequest(
  endpoint: string,
  body: {
    q: Record<string, unknown>;
    f: readonly string[] | string[];
    o: { per_page: number; page: number };
    s?: Array<Record<string, "asc" | "desc">>;
  },
): Promise<ApiResponse<PatentsViewResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      throw new Error("PatentsView API rate limit exceeded. Try again shortly.");
    }

    if (response.status === 400) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(`PatentsView API bad request: ${text}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`PatentsView API error (HTTP ${response.status}): ${text}`);
    }

    const data = (await response.json()) as PatentsViewApiResponse;

    const total =
      data.total_patent_count ??
      data.total_inventor_count ??
      data.total_assignee_count ??
      data.total_cpc_subsection_count ??
      data.count;

    const count = data.count;
    const skip = (body.o.page - 1) * body.o.per_page;

    return {
      data: {
        patents: data.patents,
        assignees: data.assignees,
        cpc_subsections: data.cpc_subsections,
        count,
        total,
        hasMore: skip + count < total,
      },
      status: response.status,
      vintage: makeVintage(),
    };
  } finally {
    globalRateLimiter.release();
  }
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "USPTO PatentsView",
  };
}

// ─── Query Builders ──────────────────────────────────────────

function buildPatentSearchQuery(params: {
  query?: string;
  assignee?: string;
  inventor?: string;
  cpc_section?: string;
  date_from?: string;
  date_to?: string;
}): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (params.query) {
    conditions.push({ _text_any: { patent_abstract: params.query } });
  }
  if (params.assignee) {
    conditions.push({ _text_any: { assignee_organization: params.assignee } });
  }
  if (params.inventor) {
    conditions.push({
      _or: [
        { _text_any: { inventor_first_name: params.inventor } },
        { _text_any: { inventor_last_name: params.inventor } },
      ],
    });
  }
  if (params.cpc_section) {
    conditions.push({ _begins: { cpc_subgroup_id: params.cpc_section } });
  }
  if (params.date_from && params.date_to) {
    conditions.push({
      _and: [
        { _gte: { patent_date: params.date_from } },
        { _lte: { patent_date: params.date_to } },
      ],
    });
  } else if (params.date_from) {
    conditions.push({ _gte: { patent_date: params.date_from } });
  } else if (params.date_to) {
    conditions.push({ _lte: { patent_date: params.date_to } });
  }

  if (conditions.length === 0) {
    conditions.push({ _gte: { patent_date: "2020-01-01" } });
  }

  return conditions.length === 1 ? conditions[0] : { _and: conditions };
}

// ─── Public API ──────────────────────────────────────────────

export const usptoPatentsClient = {
  /**
   * Search patents with flexible criteria.
   */
  async searchPatents(params: {
    query?: string;
    assignee?: string;
    inventor?: string;
    cpc_section?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<PatentsViewResult>> {
    const limit = params.limit ?? 25;
    const offset = params.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    return makePostRequest(ENDPOINTS.PATENTS, {
      q: buildPatentSearchQuery(params),
      f: [...PATENT_SEARCH_FIELDS],
      o: { per_page: limit, page },
      s: [{ patent_date: "desc" }],
    });
  },

  /**
   * Get a specific patent by number.
   */
  async getPatent(patentNumber: string): Promise<ApiResponse<PatentsViewResult>> {
    const normalized = patentNumber.replace(/[-\s]/g, "").replace(/^0+/, "");

    return makePostRequest(ENDPOINTS.PATENTS, {
      q: { patent_number: normalized },
      f: [
        "patent_number",
        "patent_title",
        "patent_abstract",
        "patent_date",
        "patent_type",
        "patent_kind",
        "patent_num_claims",
        "patent_num_cited_by_us_patents",
        "assignee_organization",
        "assignee_type",
        "inventor_first_name",
        "inventor_last_name",
        "cpc_group_id",
        "cpc_group_title",
      ],
      o: { per_page: 1, page: 1 },
    });
  },

  /**
   * Search assignees (companies/organizations) by name.
   */
  async searchAssignees(params: {
    orgName: string;
    limit?: number;
  }): Promise<ApiResponse<PatentsViewResult>> {
    const limit = params.limit ?? 25;

    return makePostRequest(ENDPOINTS.ASSIGNEES, {
      q: { _text_any: { assignee_organization: params.orgName } },
      f: [...ASSIGNEE_SEARCH_FIELDS],
      o: { per_page: limit, page: 1 },
      s: [{ assignee_total_num_patents: "desc" }],
    });
  },

  /**
   * Search CPC classification subsections.
   */
  async searchCPC(params: {
    query?: string;
    section_id?: string;
    limit?: number;
  }): Promise<ApiResponse<PatentsViewResult>> {
    const limit = params.limit ?? 25;
    const conditions: Record<string, unknown>[] = [];

    if (params.query) {
      conditions.push({ _text_any: { cpc_subsection_title: params.query } });
    }
    if (params.section_id) {
      conditions.push({ _begins: { cpc_subsection_id: params.section_id } });
    }
    if (conditions.length === 0) {
      conditions.push({ _begins: { cpc_subsection_id: "A61" } });
    }

    const q = conditions.length === 1 ? conditions[0] : { _and: conditions };

    return makePostRequest(ENDPOINTS.CPC_SUBSECTIONS, {
      q,
      f: [...CPC_SEARCH_FIELDS],
      o: { per_page: limit, page: 1 },
      s: [{ cpc_total_num_patents: "desc" }],
    });
  },
};

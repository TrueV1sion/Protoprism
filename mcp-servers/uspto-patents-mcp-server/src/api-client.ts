/**
 * PatentsView API Client
 *
 * Handles HTTP communication with the USPTO PatentsView API.
 * Includes rate limiting, error handling, and query building.
 *
 * API documentation: https://patentsview.org/apis/api-query-language
 */

import axios, { AxiosError } from "axios";
import {
  PATENTSVIEW_BASE_URL,
  ENDPOINTS,
  RATE_LIMIT_PER_MINUTE,
} from "./constants.js";

// ─── Types ──────────────────────────────────────────────────

export interface PatentsViewQuery {
  q: Record<string, unknown>;
  f: readonly string[] | string[];
  o: {
    per_page: number;
    page: number;
  };
  s?: Array<Record<string, "asc" | "desc">>;
}

export interface PatentsViewResponse {
  patents?: PatentResult[];
  inventors?: InventorResult[];
  assignees?: AssigneeResult[];
  cpc_subsections?: CPCResult[];
  count: number;
  total_patent_count?: number;
  total_inventor_count?: number;
  total_assignee_count?: number;
  total_cpc_subsection_count?: number;
}

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
  patent_firstnamed_assignee_city?: string;
  patent_firstnamed_assignee_country?: string;
  patent_firstnamed_inventor_city?: string;
  patent_firstnamed_inventor_country?: string;
  assignees?: Array<{
    assignee_organization: string | null;
    assignee_type?: string;
  }>;
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
    cpc_section_id?: string;
    cpc_subsection_id?: string;
    cpc_subsection_title?: string;
  }>;
  cited_patents?: Array<{
    cited_patent_number: string;
    cited_patent_title?: string;
    cited_patent_date?: string;
    cited_patent_category?: string;
  }>;
  citedby_patents?: Array<{
    citedby_patent_number: string;
    citedby_patent_title?: string;
    citedby_patent_date?: string;
  }>;
}

export interface InventorResult {
  inventor_first_name: string;
  inventor_last_name: string;
  inventor_total_num_patents?: number;
  patents?: Array<{
    patent_number: string;
    patent_title: string;
    patent_date?: string;
  }>;
}

export interface AssigneeResult {
  assignee_organization: string;
  assignee_type?: string;
  assignee_total_num_patents?: number;
  assignee_first_seen_date?: string;
  assignee_last_seen_date?: string;
  patents?: Array<{
    patent_number: string;
    patent_title: string;
    patent_date?: string;
  }>;
}

export interface CPCResult {
  cpc_subsection_id: string;
  cpc_subsection_title: string;
  cpc_total_num_patents?: number;
  cpc_total_num_assignees?: number;
  cpc_total_num_inventors?: number;
}

// ─── Rate Limiter ───────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.timestamps.push(Date.now());
  }
}

// ─── API Client ─────────────────────────────────────────────

export class PatentsViewClient {
  private readonly baseUrl: string;
  private readonly rateLimiter: RateLimiter;

  constructor(baseUrl: string = PATENTSVIEW_BASE_URL) {
    this.baseUrl = baseUrl;
    this.rateLimiter = new RateLimiter(RATE_LIMIT_PER_MINUTE, 60_000);
  }

  /**
   * Execute a query against a PatentsView endpoint.
   */
  async query(
    endpoint: string,
    query: PatentsViewQuery,
  ): Promise<PatentsViewResponse> {
    await this.rateLimiter.waitForSlot();

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await axios.post<PatentsViewResponse>(url, query, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response) {
          const status = error.response.status;
          const detail =
            typeof error.response.data === "string"
              ? error.response.data
              : JSON.stringify(error.response.data);

          if (status === 429) {
            throw new Error(
              "PatentsView API rate limit exceeded. Please wait a moment before retrying.",
            );
          }
          if (status === 400) {
            throw new Error(`PatentsView API bad request: ${detail}`);
          }
          throw new Error(
            `PatentsView API error (HTTP ${status}): ${detail}`,
          );
        }
        if (error.code === "ECONNABORTED") {
          throw new Error(
            "PatentsView API request timed out. Try a more specific query.",
          );
        }
        throw new Error(
          `PatentsView API connection error: ${error.message}`,
        );
      }
      throw error;
    }
  }

  // ─── Query Builders ─────────────────────────────────────────

  /**
   * Build a patent search query from user-friendly parameters.
   * Combines conditions with _and logic.
   */
  buildPatentSearchQuery(params: {
    query?: string;
    assignee?: string;
    inventor?: string;
    cpc_section?: string;
    date_from?: string;
    date_to?: string;
  }): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    if (params.query) {
      conditions.push({
        _text_any: { patent_abstract: params.query },
      });
    }

    if (params.assignee) {
      conditions.push({
        _text_any: { assignee_organization: params.assignee },
      });
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
      conditions.push({
        _begins: { cpc_subgroup_id: params.cpc_section },
      });
    }

    if (params.date_from && params.date_to) {
      conditions.push({
        _and: [
          { _gte: { patent_date: params.date_from } },
          { _lte: { patent_date: params.date_to } },
        ],
      });
    } else if (params.date_from) {
      conditions.push({
        _gte: { patent_date: params.date_from },
      });
    } else if (params.date_to) {
      conditions.push({
        _lte: { patent_date: params.date_to },
      });
    }

    if (conditions.length === 0) {
      // Default: return recent patents
      conditions.push({
        _gte: { patent_date: "2020-01-01" },
      });
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return { _and: conditions };
  }

  /**
   * Build a query to find a specific patent by number.
   */
  buildPatentByNumberQuery(patentNumber: string): Record<string, unknown> {
    // Normalize patent number: strip leading zeros, remove hyphens/spaces
    const normalized = patentNumber.replace(/[-\s]/g, "").replace(/^0+/, "");
    return { patent_number: normalized };
  }

  /**
   * Build an assignee search query.
   */
  buildAssigneeQuery(orgName: string): Record<string, unknown> {
    return {
      _text_any: { assignee_organization: orgName },
    };
  }

  /**
   * Build a CPC subsection search query.
   */
  buildCPCQuery(params: {
    query?: string;
    section_id?: string;
  }): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    if (params.query) {
      conditions.push({
        _text_any: { cpc_subsection_title: params.query },
      });
    }

    if (params.section_id) {
      conditions.push({
        _begins: { cpc_subsection_id: params.section_id },
      });
    }

    if (conditions.length === 0) {
      // Default: healthcare-related
      return {
        _begins: { cpc_subsection_id: "A61" },
      };
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return { _and: conditions };
  }

  /**
   * Build a citation analysis query for a specific patent.
   */
  buildCitationQuery(patentNumber: string): Record<string, unknown> {
    const normalized = patentNumber.replace(/[-\s]/g, "").replace(/^0+/, "");
    return { patent_number: normalized };
  }

  // ─── High-Level API Methods ─────────────────────────────────

  async searchPatents(
    params: {
      query?: string;
      assignee?: string;
      inventor?: string;
      cpc_section?: string;
      date_from?: string;
      date_to?: string;
    },
    limit: number,
    offset: number,
    fields: readonly string[] | string[],
  ): Promise<PatentsViewResponse> {
    const page = Math.floor(offset / limit) + 1;

    return this.query(ENDPOINTS.PATENTS, {
      q: this.buildPatentSearchQuery(params),
      f: fields,
      o: { per_page: limit, page },
      s: [{ patent_date: "desc" }],
    });
  }

  async getPatent(
    patentNumber: string,
    fields: readonly string[] | string[],
  ): Promise<PatentsViewResponse> {
    return this.query(ENDPOINTS.PATENTS, {
      q: this.buildPatentByNumberQuery(patentNumber),
      f: fields,
      o: { per_page: 1, page: 1 },
    });
  }

  async searchAssignees(
    orgName: string,
    limit: number,
    fields: readonly string[] | string[],
  ): Promise<PatentsViewResponse> {
    return this.query(ENDPOINTS.ASSIGNEES, {
      q: this.buildAssigneeQuery(orgName),
      f: fields,
      o: { per_page: limit, page: 1 },
      s: [{ assignee_total_num_patents: "desc" }],
    });
  }

  async searchCPC(
    params: { query?: string; section_id?: string },
    limit: number,
    fields: readonly string[] | string[],
  ): Promise<PatentsViewResponse> {
    return this.query(ENDPOINTS.CPC_SUBSECTIONS, {
      q: this.buildCPCQuery(params),
      f: fields,
      o: { per_page: limit, page: 1 },
      s: [{ cpc_total_num_patents: "desc" }],
    });
  }

  async getCitations(
    patentNumber: string,
    fields: readonly string[] | string[],
  ): Promise<PatentsViewResponse> {
    return this.query(ENDPOINTS.PATENTS, {
      q: this.buildCitationQuery(patentNumber),
      f: fields,
      o: { per_page: 1, page: 1 },
    });
  }
}

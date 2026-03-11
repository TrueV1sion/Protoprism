/**
 * Federal Register API Client
 *
 * Thin wrapper around the Federal Register REST API (v1).
 * All methods return raw JSON responses — formatting for MCP
 * tool output is handled in index.ts.
 *
 * API docs: https://www.federalregister.gov/developers/documentation/api/v1
 */

import axios, { type AxiosInstance, AxiosError } from "axios";
import {
  BASE_URL,
  SEARCH_FIELDS,
  DETAIL_FIELDS,
  type DocumentType,
} from "./constants.js";

// ─── Types ──────────────────────────────────────────────────

export interface SearchDocumentsParams {
  query?: string;
  document_type?: DocumentType[];
  agencies?: string[];
  date_from?: string;
  date_to?: string;
  topics?: string[];
  significant?: boolean;
  limit?: number;
  page?: number;
}

export interface PublicInspectionParams {
  agencies?: string[];
  document_type?: DocumentType[];
}

export interface CountByAgencyParams {
  agency_slug: string;
  date_from?: string;
  date_to?: string;
  document_type?: DocumentType[];
}

export interface AgencyResult {
  id: number;
  name: string;
  short_name: string | null;
  slug: string;
  url: string;
  description: string | null;
  parent_id: number | null;
  child_ids: number[];
  child_slugs: string[];
  recent_articles_url: string;
}

export interface DocumentResult {
  title: string;
  type: string;
  subtype?: string;
  abstract: string | null;
  action?: string | null;
  dates?: string | null;
  document_number: string;
  citation?: string;
  html_url: string;
  pdf_url: string;
  body_html_url?: string;
  raw_text_url?: string;
  publication_date: string;
  effective_on?: string | null;
  signing_date?: string | null;
  comment_url?: string | null;
  comments_close_on?: string | null;
  agencies: Array<{
    raw_name: string;
    name: string;
    id: number;
    url: string;
    json_url: string;
    parent_id: number | null;
    slug: string;
  }>;
  topics?: string[];
  cfr_references?: Array<{
    title: number;
    part: number;
    chapter?: string;
  }>;
  docket_ids?: string[];
  regulation_id_numbers?: string[];
  significant?: boolean;
  start_page?: number;
  end_page?: number;
  page_length?: number;
  page_views?: { count: number; last_updated: string };
  executive_order_number?: string | null;
  presidential_document_number?: string | null;
  corrections?: unknown[];
  correction_of?: string | null;
  excerpts?: string;
}

export interface SearchResponse {
  description: string;
  count: number;
  total_pages: number;
  next_page_url: string | null;
  results: DocumentResult[];
}

export interface PublicInspectionDocument {
  document_number: string;
  title: string;
  type: string;
  filing_type: string;
  agencies: Array<{
    raw_name: string;
    name: string;
    id: number;
    slug: string;
  }>;
  html_url: string;
  pdf_url: string | null;
  publication_date: string | null;
  filed_at: string;
  subject_1?: string;
  subject_2?: string;
  subject_3?: string;
  num_pages?: number;
  docket_numbers?: string[];
  editorial_note?: string | null;
}

export interface PublicInspectionResponse {
  count: number;
  total_pages: number;
  next_page_url: string | null;
  results: PublicInspectionDocument[];
}

// ─── Client ─────────────────────────────────────────────────

export class FederalRegisterClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism-FedReg-MCP/1.0",
      },
    });
  }

  /**
   * Search Federal Register documents.
   *
   * Uses the `conditions[]` query parameter format expected by the FR API.
   */
  async searchDocuments(
    params: SearchDocumentsParams,
  ): Promise<SearchResponse> {
    const queryParams: Record<string, unknown> = {
      per_page: Math.min(params.limit ?? 20, 100),
      page: params.page ?? 1,
      order: "newest",
      "fields[]": [...SEARCH_FIELDS],
    };

    if (params.query) {
      queryParams["conditions[term]"] = params.query;
    }

    if (params.document_type?.length) {
      queryParams["conditions[type][]"] = params.document_type;
    }

    if (params.agencies?.length) {
      queryParams["conditions[agencies][]"] = params.agencies;
    }

    if (params.date_from) {
      queryParams["conditions[publication_date][gte]"] = params.date_from;
    }

    if (params.date_to) {
      queryParams["conditions[publication_date][lte]"] = params.date_to;
    }

    if (params.topics?.length) {
      queryParams["conditions[topics][]"] = params.topics;
    }

    if (params.significant !== undefined) {
      queryParams["conditions[significant]"] = params.significant ? "1" : "0";
    }

    const response = await this.request<SearchResponse>(
      "/documents.json",
      queryParams,
    );
    return response;
  }

  /**
   * Get full details for a specific document by its document number.
   */
  async getDocument(documentNumber: string): Promise<DocumentResult> {
    const queryParams: Record<string, unknown> = {
      "fields[]": [...DETAIL_FIELDS],
    };

    const response = await this.request<DocumentResult>(
      `/documents/${encodeURIComponent(documentNumber)}.json`,
      queryParams,
    );
    return response;
  }

  /**
   * Get documents currently on public inspection (pre-publication).
   */
  async searchPublicInspection(
    params: PublicInspectionParams,
  ): Promise<PublicInspectionResponse> {
    const queryParams: Record<string, unknown> = {};

    if (params.agencies?.length) {
      queryParams["conditions[agencies][]"] = params.agencies;
    }

    if (params.document_type?.length) {
      queryParams["conditions[type][]"] = params.document_type;
    }

    const response = await this.request<PublicInspectionResponse>(
      "/public-inspection-documents.json",
      queryParams,
    );
    return response;
  }

  /**
   * List all agencies registered with the Federal Register.
   */
  async listAgencies(): Promise<AgencyResult[]> {
    const response = await this.request<AgencyResult[]>("/agencies.json");
    return response;
  }

  /**
   * Count documents for a given agency over a time period.
   *
   * Uses a search with per_page=1 to get only the `count` field
   * without downloading full document bodies.
   */
  async countByAgency(params: CountByAgencyParams): Promise<{
    count: number;
    agency_slug: string;
    date_from?: string;
    date_to?: string;
    document_types?: DocumentType[];
  }> {
    const queryParams: Record<string, unknown> = {
      per_page: 1,
      page: 1,
      "fields[]": ["document_number"],
      "conditions[agencies][]": [params.agency_slug],
    };

    if (params.date_from) {
      queryParams["conditions[publication_date][gte]"] = params.date_from;
    }

    if (params.date_to) {
      queryParams["conditions[publication_date][lte]"] = params.date_to;
    }

    if (params.document_type?.length) {
      queryParams["conditions[type][]"] = params.document_type;
    }

    const response = await this.request<SearchResponse>(
      "/documents.json",
      queryParams,
    );

    return {
      count: response.count,
      agency_slug: params.agency_slug,
      date_from: params.date_from,
      date_to: params.date_to,
      document_types: params.document_type,
    };
  }

  // ─── Internal ───────────────────────────────────────────────

  private async request<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const response = await this.http.get<T>(path, { params });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const data = error.response?.data;
        const message =
          typeof data === "object" && data !== null && "errors" in data
            ? JSON.stringify((data as { errors: unknown }).errors)
            : error.message;

        throw new Error(
          `Federal Register API error (HTTP ${status ?? "unknown"}): ${message}`,
        );
      }
      throw error;
    }
  }
}

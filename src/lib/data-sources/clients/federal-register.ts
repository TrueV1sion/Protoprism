// src/lib/data-sources/clients/federal-register.ts
/**
 * Federal Register API Client (Layer 1)
 *
 * Internal HTTP client for the Federal Register v1 REST API.
 * Handles rate limiting and query parameter construction.
 *
 * Ported from mcp-servers/federal-register-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://www.federalregister.gov/api/v1";

// 3 req/s — conservative for a government API without published rate limits
const clientLimiter = new TokenBucketLimiter(3);

const SEARCH_FIELDS = [
  "title",
  "type",
  "abstract",
  "document_number",
  "html_url",
  "pdf_url",
  "publication_date",
  "agencies",
  "topics",
  "significant",
  "action",
  "dates",
  "docket_ids",
  "comment_url",
  "comments_close_on",
] as const;

const DETAIL_FIELDS = [
  "title",
  "type",
  "subtype",
  "abstract",
  "action",
  "dates",
  "document_number",
  "citation",
  "html_url",
  "pdf_url",
  "body_html_url",
  "raw_text_url",
  "publication_date",
  "effective_on",
  "signing_date",
  "comment_url",
  "comments_close_on",
  "agencies",
  "topics",
  "cfr_references",
  "docket_ids",
  "regulation_id_numbers",
  "significant",
  "start_page",
  "end_page",
  "page_length",
  "page_views",
] as const;

// ─── Types ───────────────────────────────────────────────────

export type DocumentType = "RULE" | "PRORULE" | "NOTICE" | "PRESDOCU";

export interface FederalRegisterDocument {
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
  cfr_references?: Array<{ title: number; part: number; chapter?: string }>;
  docket_ids?: string[];
  regulation_id_numbers?: string[];
  significant?: boolean;
  start_page?: number;
  end_page?: number;
  page_length?: number;
  page_views?: { count: number; last_updated: string };
  executive_order_number?: string | null;
  presidential_document_number?: string | null;
  excerpts?: string;
}

export interface FederalRegisterSearchResult {
  results: FederalRegisterDocument[];
  total: number;
  hasMore: boolean;
  totalPages: number;
}

export interface FederalRegisterAgency {
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

export interface PublicInspectionDocument {
  document_number: string;
  title: string;
  type: string;
  filing_type: string;
  agencies: Array<{ raw_name: string; name: string; id: number; slug: string }>;
  html_url: string;
  pdf_url: string | null;
  publication_date: string | null;
  filed_at: string;
}

export interface FederalRegisterPublicInspectionResult {
  results: PublicInspectionDocument[];
  total: number;
  hasMore: boolean;
}

// ─── API Response Envelopes ───────────────────────────────────

interface SearchEnvelope {
  description: string;
  count: number;
  total_pages: number;
  next_page_url: string | null;
  results: FederalRegisterDocument[];
}

interface PublicInspectionEnvelope {
  count: number;
  total_pages: number;
  next_page_url: string | null;
  results: PublicInspectionDocument[];
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest<T>(url: string): Promise<ApiResponse<T>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: null as unknown as T,
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("Federal Register API rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { errors?: unknown };
      const msg = body.errors ? JSON.stringify(body.errors) : response.statusText;
      throw new Error(
        `Federal Register API error (HTTP ${response.status}): ${msg}`,
      );
    }

    const data = (await response.json()) as T;
    return {
      data,
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
    source: "Federal Register",
  };
}

// ─── URL Builder ─────────────────────────────────────────────

function buildSearchUrl(
  path: string,
  params: Record<string, string | string[] | number | boolean | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0
    ? `${BASE_URL}${path}?${parts.join("&")}`
    : `${BASE_URL}${path}`;
}

// ─── Public API ──────────────────────────────────────────────

export const federalRegisterClient = {
  /**
   * Search Federal Register documents.
   */
  async searchDocuments(params: {
    query?: string;
    document_type?: DocumentType[];
    agencies?: string[];
    date_from?: string;
    date_to?: string;
    topics?: string[];
    significant?: boolean;
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<FederalRegisterSearchResult>> {
    const qp: Record<string, string | string[] | number | boolean | undefined> = {
      per_page: Math.min(params.limit ?? 20, 100),
      page: params.page ?? 1,
      order: "newest",
    };

    // fields[] must be encoded individually
    const fieldParts = [...SEARCH_FIELDS].map(
      (f) => `fields%5B%5D=${encodeURIComponent(f)}`,
    );

    if (params.query) qp["conditions[term]"] = params.query;
    if (params.document_type?.length) {
      qp["conditions[type][]"] = params.document_type;
    }
    if (params.agencies?.length) {
      qp["conditions[agencies][]"] = params.agencies;
    }
    if (params.date_from) {
      qp["conditions[publication_date][gte]"] = params.date_from;
    }
    if (params.date_to) {
      qp["conditions[publication_date][lte]"] = params.date_to;
    }
    if (params.topics?.length) {
      qp["conditions[topics][]"] = params.topics;
    }
    if (params.significant !== undefined) {
      qp["conditions[significant]"] = params.significant ? "1" : "0";
    }

    const baseUrl = buildSearchUrl("/documents.json", qp);
    const url = `${baseUrl}&${fieldParts.join("&")}`;

    const raw = await makeRequest<SearchEnvelope>(url);
    const envelope = raw.data;

    if (!envelope) {
      return {
        data: { results: [], total: 0, hasMore: false, totalPages: 0 },
        status: raw.status,
        vintage: raw.vintage,
      };
    }

    const page = params.page ?? 1;
    return {
      data: {
        results: envelope.results ?? [],
        total: envelope.count ?? 0,
        totalPages: envelope.total_pages ?? 0,
        hasMore: page < (envelope.total_pages ?? 0),
      },
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * Get full detail for a specific document by document number.
   */
  async getDocument(
    documentNumber: string,
  ): Promise<ApiResponse<FederalRegisterDocument | null>> {
    const fieldParts = [...DETAIL_FIELDS].map(
      (f) => `fields%5B%5D=${encodeURIComponent(f)}`,
    );
    const url = `${BASE_URL}/documents/${encodeURIComponent(documentNumber)}.json?${fieldParts.join("&")}`;
    return makeRequest<FederalRegisterDocument>(url);
  },

  /**
   * Get documents currently on public inspection.
   */
  async searchPublicInspection(params: {
    agencies?: string[];
    document_type?: DocumentType[];
  }): Promise<ApiResponse<FederalRegisterPublicInspectionResult>> {
    const qp: Record<string, string | string[] | number | boolean | undefined> = {};
    if (params.agencies?.length) {
      qp["conditions[agencies][]"] = params.agencies;
    }
    if (params.document_type?.length) {
      qp["conditions[type][]"] = params.document_type;
    }

    const url = buildSearchUrl("/public-inspection-documents.json", qp);
    const raw = await makeRequest<PublicInspectionEnvelope>(url);

    if (!raw.data) {
      return {
        data: { results: [], total: 0, hasMore: false },
        status: raw.status,
        vintage: raw.vintage,
      };
    }

    return {
      data: {
        results: raw.data.results ?? [],
        total: raw.data.count ?? 0,
        hasMore: !!raw.data.next_page_url,
      },
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * List all agencies registered with the Federal Register.
   */
  async listAgencies(): Promise<ApiResponse<FederalRegisterAgency[]>> {
    const url = `${BASE_URL}/agencies.json`;
    const raw = await makeRequest<FederalRegisterAgency[]>(url);
    return {
      data: raw.data ?? [],
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * Count documents published by a given agency over a time period.
   */
  async countByAgency(params: {
    agency_slug: string;
    date_from?: string;
    date_to?: string;
    document_type?: DocumentType[];
  }): Promise<ApiResponse<{ count: number; agency_slug: string; date_from?: string; date_to?: string }>> {
    const qp: Record<string, string | string[] | number | boolean | undefined> = {
      per_page: 1,
      page: 1,
      "conditions[agencies][]": [params.agency_slug],
      "fields[]": ["document_number"],
    };
    if (params.date_from) qp["conditions[publication_date][gte]"] = params.date_from;
    if (params.date_to) qp["conditions[publication_date][lte]"] = params.date_to;
    if (params.document_type?.length) {
      qp["conditions[type][]"] = params.document_type;
    }

    const url = buildSearchUrl("/documents.json", qp);
    const raw = await makeRequest<SearchEnvelope>(url);

    return {
      data: {
        count: raw.data?.count ?? 0,
        agency_slug: params.agency_slug,
        date_from: params.date_from,
        date_to: params.date_to,
      },
      status: raw.status,
      vintage: raw.vintage,
    };
  },
};

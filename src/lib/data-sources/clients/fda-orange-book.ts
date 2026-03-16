// src/lib/data-sources/clients/fda-orange-book.ts
/**
 * FDA Orange Book API Client (Layer 1)
 *
 * Internal HTTP client for the openFDA drugsfda endpoint (Orange Book data).
 * Handles query construction, rate limiting, and error handling.
 * Not exposed to agents.
 *
 * Ported from mcp-servers/fda-orange-book-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 *
 * NOTE: Export name `fdaOrangeBookClient` with `searchProducts` method is required
 * by src/lib/data-sources/research/drug-safety.ts (lazy import).
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.fda.gov/drug/drugsfda.json";

// 3 req/s
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

interface OpenFDAFields {
  application_number?: string[];
  brand_name?: string[];
  generic_name?: string[];
  manufacturer_name?: string[];
  product_ndc?: string[];
  substance_name?: string[];
}

interface DrugProduct {
  product_number?: string;
  reference_drug?: string;
  brand_name?: string;
  active_ingredients?: Array<{ name?: string; strength?: string }>;
  reference_standard?: string;
  dosage_form?: string;
  route?: string;
  marketing_status?: string;
  te_code?: string;
}

interface Submission {
  submission_type?: string;
  submission_number?: string;
  submission_status?: string;
  submission_status_date?: string;
  submission_class_code?: string;
  submission_class_code_description?: string;
}

export interface DrugsFDAResult {
  application_number?: string;
  sponsor_name?: string;
  openfda?: OpenFDAFields;
  products?: DrugProduct[];
  submissions?: Submission[];
}

interface OpenFDAResponse {
  meta?: {
    last_updated?: string;
    results?: { skip: number; limit: number; total: number };
  };
  results?: DrugsFDAResult[];
  error?: { code: string; message: string };
}

export interface OrangeBookResult {
  results: DrugsFDAResult[];
  total: number;
  hasMore: boolean;
}

// ─── Query Helpers ───────────────────────────────────────────

function quoteValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildSearchQuery(clauses: string[]): string | undefined {
  const nonEmpty = clauses.filter((c) => c.length > 0);
  return nonEmpty.length === 0 ? undefined : nonEmpty.join("+AND+");
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(params: {
  search?: string;
  limit?: number;
  count?: string;
}): Promise<ApiResponse<OrangeBookResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const queryParts: string[] = [];
    if (params.search) queryParts.push(`search=${params.search}`);
    if (params.count) queryParts.push(`count=${encodeURIComponent(params.count)}`);
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);

    const url = queryParts.length > 0
      ? `${BASE_URL}?${queryParts.join("&")}`
      : BASE_URL;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: { results: [], total: 0, hasMore: false },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("openFDA Orange Book rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as OpenFDAResponse;
      throw new Error(
        `openFDA Orange Book API error (HTTP ${response.status}): ${body.error?.message ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as OpenFDAResponse;
    if (data.error) {
      throw new Error(`openFDA Orange Book API error: ${data.error.message}`);
    }

    const results = (data.results ?? []) as DrugsFDAResult[];
    const meta = data.meta?.results;
    const total = meta?.total ?? results.length;
    const limit = params.limit ?? results.length;

    return {
      data: {
        results,
        total,
        hasMore: results.length < total && results.length >= limit,
      },
      status: response.status,
      vintage: makeVintage(data.meta?.last_updated),
    };
  } finally {
    globalRateLimiter.release();
  }
}

function makeVintage(lastUpdated?: string): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    dataThrough: lastUpdated,
    source: "FDA Orange Book (openFDA drugsfda)",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const fdaOrangeBookClient = {
  async searchProducts(params: {
    brandName?: string;
    genericName?: string;
    applicationNumber?: string;
    sponsorName?: string;
    query?: string;
    limit?: number;
  }): Promise<ApiResponse<OrangeBookResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.brandName) clauses.push(`openfda.brand_name:${quoteValue(params.brandName)}`);
    if (params.genericName) clauses.push(`openfda.generic_name:${quoteValue(params.genericName)}`);
    if (params.applicationNumber) clauses.push(`application_number:${quoteValue(params.applicationNumber)}`);
    if (params.sponsorName) clauses.push(`sponsor_name:${quoteValue(params.sponsorName)}`);

    return makeRequest({
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
    });
  },

  async getByApplicationNumber(
    applicationNumber: string,
  ): Promise<ApiResponse<OrangeBookResult>> {
    return makeRequest({
      search: `application_number:${quoteValue(applicationNumber)}`,
      limit: 1,
    });
  },

  async searchByActiveIngredient(params: {
    ingredient: string;
    limit?: number;
  }): Promise<ApiResponse<OrangeBookResult>> {
    const search = `openfda.substance_name:${quoteValue(params.ingredient)}`;
    return makeRequest({ search, limit: params.limit ?? 10 });
  },

  async countByField(params: {
    field: string;
    search?: string;
    limit?: number;
  }): Promise<ApiResponse<OrangeBookResult>> {
    const clauses: string[] = [];
    if (params.search) clauses.push(params.search);

    return makeRequest({
      search: buildSearchQuery(clauses),
      count: params.field,
      limit: params.limit ?? 10,
    });
  },
};

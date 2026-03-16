// src/lib/data-sources/clients/openfda.ts
/**
 * openFDA API Client (Layer 1)
 *
 * Internal HTTP client for the openFDA public API. Handles query construction,
 * rate limiting, pagination, and error handling. Not exposed to agents.
 *
 * Ported from mcp-servers/openfda-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage instead of raw FormattedResult
 * - No JSON.stringify — downstream tools handle formatting
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.fda.gov";

const ENDPOINTS = {
  DRUG_LABEL: "/drug/label.json",
  DRUG_EVENT: "/drug/event.json",
  DRUG_ENFORCEMENT: "/drug/enforcement.json",
  DEVICE_510K: "/device/510k.json",
  DEVICE_EVENT: "/device/event.json",
} as const;

// 4 req/s without API key (240/min with key)
const clientLimiter = new TokenBucketLimiter(4);

// ─── Types ───────────────────────────────────────────────────

interface OpenFDAResponse {
  meta?: {
    last_updated?: string;
    results?: { skip: number; limit: number; total: number };
  };
  results?: unknown[];
  error?: { code: string; message: string };
}

export interface OpenFDAResult {
  results: Record<string, unknown>[];
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

function buildDateRange(field: string, from?: string, to?: string): string {
  if (!from && !to) return "";
  return `${field}:[${from ?? "*"}+TO+${to ?? "*"}]`;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  endpoint: string,
  params: {
    search?: string;
    limit?: number;
    skip?: number;
    count?: string;
  } = {},
): Promise<ApiResponse<OpenFDAResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    // Build URL manually — openFDA uses literal '+' in search syntax
    const queryParts: string[] = [];
    const apiKey = process.env.OPENFDA_API_KEY;
    if (apiKey) queryParts.push(`api_key=${encodeURIComponent(apiKey)}`);
    if (params.search) queryParts.push(`search=${params.search}`);
    if (params.count) {
      queryParts.push(`count=${encodeURIComponent(params.count)}`);
    }
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
    if (params.skip !== undefined && params.skip > 0) queryParts.push(`skip=${params.skip}`);

    const url = queryParts.length > 0
      ? `${BASE_URL}${endpoint}?${queryParts.join("&")}`
      : `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Protoprism/1.0" },
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
      throw new Error("openFDA rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as OpenFDAResponse;
      throw new Error(
        `openFDA API error (HTTP ${response.status}): ${body.error?.message ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as OpenFDAResponse;
    if (data.error) {
      throw new Error(`openFDA API error: ${data.error.message}`);
    }

    const results = (data.results ?? []) as Record<string, unknown>[];
    const meta = data.meta?.results;
    const total = meta?.total ?? results.length;
    const skip = meta?.skip ?? params.skip ?? 0;

    return {
      data: {
        results,
        total,
        hasMore: skip + results.length < total,
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
    source: "openFDA FAERS",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const openfdaClient = {
  async searchAdverseEvents(params: {
    drugName?: string;
    reaction?: string;
    serious?: boolean;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
    limit?: number;
    skip?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.drugName) {
      const q = quoteValue(params.drugName);
      clauses.push(`(patient.drug.openfda.brand_name:${q}+OR+patient.drug.openfda.generic_name:${q})`);
    }
    if (params.reaction) clauses.push(`patient.reaction.reactionmeddrapt:${quoteValue(params.reaction)}`);
    if (params.serious !== undefined) clauses.push(`serious:${params.serious ? "1" : "2"}`);
    const dateClause = buildDateRange("receivedate", params.dateFrom, params.dateTo);
    if (dateClause) clauses.push(dateClause);

    return makeRequest(ENDPOINTS.DRUG_EVENT, {
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
      skip: params.skip,
    });
  },

  async countAdverseEvents(params: {
    field: string;
    drugName?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.drugName) {
      const q = quoteValue(params.drugName);
      clauses.push(`(patient.drug.openfda.brand_name:${q}+OR+patient.drug.openfda.generic_name:${q})`);
    }
    const dateClause = buildDateRange("receivedate", params.dateFrom, params.dateTo);
    if (dateClause) clauses.push(dateClause);

    return makeRequest(ENDPOINTS.DRUG_EVENT, {
      search: buildSearchQuery(clauses),
      count: params.field,
      limit: params.limit ?? 10,
    });
  },

  async searchDrugLabels(params: {
    query?: string;
    brandName?: string;
    genericName?: string;
    manufacturer?: string;
    limit?: number;
    skip?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.brandName) clauses.push(`openfda.brand_name:${quoteValue(params.brandName)}`);
    if (params.genericName) clauses.push(`openfda.generic_name:${quoteValue(params.genericName)}`);
    if (params.manufacturer) clauses.push(`openfda.manufacturer_name:${quoteValue(params.manufacturer)}`);

    return makeRequest(ENDPOINTS.DRUG_LABEL, {
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
      skip: params.skip,
    });
  },

  async searchRecalls(params: {
    query?: string;
    classification?: string;
    status?: string;
    reason?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    skip?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.classification) clauses.push(`classification:${quoteValue(params.classification)}`);
    if (params.status) clauses.push(`status:${quoteValue(params.status)}`);
    if (params.reason) clauses.push(`reason_for_recall:${quoteValue(params.reason)}`);
    const dateClause = buildDateRange("report_date", params.dateFrom, params.dateTo);
    if (dateClause) clauses.push(dateClause);

    return makeRequest(ENDPOINTS.DRUG_ENFORCEMENT, {
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
      skip: params.skip,
    });
  },

  async search510k(params: {
    query?: string;
    applicant?: string;
    deviceName?: string;
    decision?: string;
    productCode?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    skip?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.applicant) clauses.push(`applicant:${quoteValue(params.applicant)}`);
    if (params.deviceName) clauses.push(`device_name:${quoteValue(params.deviceName)}`);
    if (params.decision) clauses.push(`decision_code:${quoteValue(params.decision)}`);
    if (params.productCode) clauses.push(`product_code:${quoteValue(params.productCode)}`);
    const dateClause = buildDateRange("decision_date", params.dateFrom, params.dateTo);
    if (dateClause) clauses.push(dateClause);

    return makeRequest(ENDPOINTS.DEVICE_510K, {
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
      skip: params.skip,
    });
  },

  async searchDeviceEvents(params: {
    query?: string;
    deviceName?: string;
    manufacturer?: string;
    eventType?: string;
    productCode?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    skip?: number;
  }): Promise<ApiResponse<OpenFDAResult>> {
    const clauses: string[] = [];
    if (params.query) clauses.push(params.query);
    if (params.deviceName) clauses.push(`device.generic_name:${quoteValue(params.deviceName)}`);
    if (params.manufacturer) clauses.push(`device.manufacturer_d_name:${quoteValue(params.manufacturer)}`);
    if (params.eventType) clauses.push(`event_type:${quoteValue(params.eventType)}`);
    if (params.productCode) clauses.push(`device.device_report_product_code:${quoteValue(params.productCode)}`);
    const dateClause = buildDateRange("date_received", params.dateFrom, params.dateTo);
    if (dateClause) clauses.push(dateClause);

    return makeRequest(ENDPOINTS.DEVICE_EVENT, {
      search: buildSearchQuery(clauses),
      limit: params.limit ?? 10,
      skip: params.skip,
    });
  },
};

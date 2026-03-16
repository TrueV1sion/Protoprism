// src/lib/data-sources/clients/congress-gov.ts
/**
 * Congress.gov API Client (Layer 1)
 *
 * Internal HTTP client for the Congress.gov v3 API.
 * Requires API key: process.env.CONGRESS_GOV_API_KEY
 *
 * Ported from mcp-servers/congress-gov-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.congress.gov/v3";

// 3 req/s — Congress.gov allows up to ~1000/hour with key
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface CongressResult {
  data: unknown;
  pagination?: {
    count: number;
    next?: string;
  };
  hasMore: boolean;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ApiResponse<CongressResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const apiKey = process.env.CONGRESS_GOV_API_KEY;
    const urlParams = new URLSearchParams({ format: "json" });
    if (apiKey) urlParams.set("api_key", apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        urlParams.set(key, String(value));
      }
    }

    const url = `${BASE_URL}${path}?${urlParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: { data: null, hasMore: false },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("Congress.gov API rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const msg =
        (body.error as Record<string, string> | undefined)?.message ??
        (body.message as string | undefined) ??
        response.statusText;
      throw new Error(`Congress.gov API error (HTTP ${response.status}): ${msg}`);
    }

    const body = (await response.json()) as Record<string, unknown>;

    // Congress.gov wraps data in various top-level keys
    const pagination = body.pagination as { count: number; next?: string } | undefined;
    const hasMore = !!(pagination?.next);

    return {
      data: { data: body, pagination, hasMore },
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
    source: "Congress.gov",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const congressGovClient = {
  /**
   * Search or list bills, optionally filtered by congress and bill type.
   */
  async searchBills(params: {
    query?: string;
    congress?: number;
    billType?: string;
    fromDateTime?: string;
    toDateTime?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<CongressResult>> {
    let path = "/bill";
    if (params.congress && params.billType) {
      path = `/bill/${params.congress}/${params.billType}`;
    } else if (params.congress) {
      path = `/bill/${params.congress}`;
    }

    return makeRequest(path, {
      query: params.query,
      fromDateTime: params.fromDateTime,
      toDateTime: params.toDateTime,
      sort: params.sort ? `${params.sort}+desc` : undefined,
      limit: params.limit,
      offset: params.offset,
    });
  },

  /**
   * Get a specific bill by congress, type, and number.
   */
  async getBill(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}`);
  },

  /**
   * Get actions for a specific bill.
   */
  async getBillActions(
    congress: number,
    billType: string,
    billNumber: number,
    limit?: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}/actions`, {
      limit,
    });
  },

  /**
   * Get committees for a specific bill.
   */
  async getBillCommittees(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}/committees`);
  },

  /**
   * Get subjects for a specific bill.
   */
  async getBillSubjects(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}/subjects`);
  },

  /**
   * Get cosponsors for a specific bill.
   */
  async getBillCosponsors(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}/cosponsors`);
  },

  /**
   * Get related bills for a specific bill.
   */
  async getBillRelatedBills(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<ApiResponse<CongressResult>> {
    return makeRequest(`/bill/${congress}/${billType}/${billNumber}/relatedbills`);
  },

  /**
   * Search or list members of Congress.
   */
  async searchMembers(params: {
    query?: string;
    state?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<CongressResult>> {
    let path = "/member";
    if (params.state) {
      path = `/member/${params.state.toUpperCase()}`;
    }
    return makeRequest(path, {
      query: params.query,
      limit: params.limit,
      offset: params.offset,
    });
  },

  /**
   * Search or list congressional committees.
   */
  async searchCommittees(params: {
    query?: string;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<CongressResult>> {
    let path = "/committee";
    if (params.chamber) {
      path = `/committee/${params.chamber}`;
    }
    return makeRequest(path, {
      query: params.query,
      limit: params.limit,
      offset: params.offset,
    });
  },

  /**
   * Search or list congressional hearings.
   */
  async searchHearings(params: {
    congress?: number;
    chamber?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<CongressResult>> {
    let path = "/hearing";
    if (params.congress) {
      path = `/hearing/${params.congress}`;
      if (params.chamber) {
        path = `/hearing/${params.congress}/${params.chamber}`;
      }
    }
    return makeRequest(path, {
      limit: params.limit,
      offset: params.offset,
    });
  },
};

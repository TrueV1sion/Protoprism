// src/lib/data-sources/clients/grants-gov.ts
/**
 * Grants.gov API Client (Layer 1)
 *
 * Internal HTTP client for the Grants.gov public API. Handles query construction,
 * rate limiting, v1/legacy fallback, and error handling. Not exposed to agents.
 *
 * Ported from mcp-servers/grants-gov-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.grants.gov/v1/api";
const LEGACY_SEARCH_URL = "https://www.grants.gov/grantsws/rest/opportunities/search";

// 3 req/s
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface GrantOpportunitySummary {
  opportunity_id: string;
  title: string;
  agency: string;
  funding_category: string;
  open_date: string | null;
  close_date: string | null;
  estimated_funding: string | null;
  award_ceiling: string | null;
  award_floor: string | null;
  status: string;
  opportunity_number: string | null;
  url: string;
}

export interface GrantsSearchResult {
  total: number;
  count: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | null;
  results: GrantOpportunitySummary[];
  source: "v1" | "legacy";
}

// ─── Core Request ────────────────────────────────────────────

async function makeGetRequest(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<{ data: Record<string, unknown>; status: number }> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const url = new URL(`${BASE_URL}${path}`);
    const apiKey = process.env.GRANTS_GOV_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 404 || response.status === 405) {
      return { data: { _notFound: true }, status: response.status };
    }

    if (response.status === 429) {
      throw new Error(
        "Grants.gov API rate limit exceeded (429). Try again shortly.",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        `Grants.gov API error (HTTP ${response.status}): ${JSON.stringify(body)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { data, status: response.status };
  } finally {
    globalRateLimiter.release();
  }
}

async function makePostRequest(
  url: string,
  body: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; status: number }> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 429) {
      throw new Error("Grants.gov API rate limit exceeded (429). Try again shortly.");
    }

    if (!response.ok) {
      const respBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        `Grants.gov legacy API error (HTTP ${response.status}): ${JSON.stringify(respBody)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { data, status: response.status };
  } finally {
    globalRateLimiter.release();
  }
}

// ─── Normalization ───────────────────────────────────────────

function normalizeOpportunity(item: Record<string, unknown>): GrantOpportunitySummary {
  const id = String(item.opportunityId ?? item.id ?? item.opportunity_id ?? "");
  return {
    opportunity_id: id,
    title: String(item.opportunityTitle ?? item.title ?? ""),
    agency: String(item.agencyCode ?? item.agency ?? ""),
    funding_category: String(item.fundingCategoryDescription ?? item.fundingCategory ?? ""),
    open_date: item.openDate ? String(item.openDate) : null,
    close_date: item.closeDate ? String(item.closeDate) : null,
    estimated_funding: item.estimatedFunding != null ? String(item.estimatedFunding) : null,
    award_ceiling: item.awardCeiling != null ? String(item.awardCeiling) : null,
    award_floor: item.awardFloor != null ? String(item.awardFloor) : null,
    status: String(item.oppStatus ?? item.status ?? ""),
    opportunity_number: item.opportunityNumber
      ? String(item.opportunityNumber)
      : item.number
        ? String(item.number)
        : null,
    url: id ? `https://www.grants.gov/search-results-detail/${id}` : "",
  };
}

function buildSearchResult(
  results: GrantOpportunitySummary[],
  total: number | null,
  page: number,
  limit: number,
  source: "v1" | "legacy",
): GrantsSearchResult {
  const effectiveTotal = total ?? results.length;
  const hasMore = page * limit < effectiveTotal;
  return {
    total: effectiveTotal,
    count: results.length,
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    results,
    source,
  };
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "Grants.gov",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const grantsGovClient = {
  async searchOpportunities(params: {
    keyword?: string;
    agency?: string;
    fundingCategory?: string;
    status?: string;
    sortBy?: string;
    rows?: number;
    page?: number;
  }): Promise<ApiResponse<GrantsSearchResult>> {
    const rows = params.rows ?? 25;
    const page = params.page ?? 1;

    // Try v1 API first
    try {
      const v1Params: Record<string, string | number | undefined> = { rows, page };
      if (params.keyword) v1Params.keyword = params.keyword;
      if (params.agency) v1Params.agency = params.agency;
      if (params.fundingCategory) v1Params.fundingCategory = params.fundingCategory;
      if (params.status) v1Params.status = params.status;
      if (params.sortBy) v1Params.sortBy = params.sortBy;

      const { data, status } = await makeGetRequest("/search", v1Params);

      if (!data._notFound) {
        const items =
          (data.opportunities as Record<string, unknown>[]) ??
          (data.oppHits as Record<string, unknown>[]) ??
          (data.data as Record<string, unknown>[]) ??
          [];

        const totalRecords =
          (data.totalCount as number | undefined) ??
          (data.totalRecords as number | undefined) ??
          (data.hitCount as number | undefined) ??
          null;

        const normalized = items.map(normalizeOpportunity);
        return {
          data: buildSearchResult(normalized, totalRecords, page, rows, "v1"),
          status,
          vintage: makeVintage(),
        };
      }
    } catch (err) {
      // Only fall back on network/404/405 errors, not 400/429
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("400") || msg.includes("429") || msg.includes("403")) {
        throw err;
      }
    }

    // Fall back to legacy POST endpoint
    const legacyBody: Record<string, unknown> = {
      rows,
      startRecordNum: (page - 1) * rows,
    };
    if (params.keyword) legacyBody.keyword = params.keyword;
    if (params.agency) legacyBody.agencies = params.agency;
    if (params.fundingCategory) legacyBody.fundingCategories = params.fundingCategory;
    if (params.status) legacyBody.oppStatuses = params.status;
    if (params.sortBy) legacyBody.sortBy = `${params.sortBy}|desc`;

    const { data: legacyData, status: legacyStatus } = await makePostRequest(
      LEGACY_SEARCH_URL,
      legacyBody,
    );

    const legacyItems =
      (legacyData.oppHits as Record<string, unknown>[]) ??
      (legacyData.opportunities as Record<string, unknown>[]) ??
      [];

    const legacyTotal =
      (legacyData.hitCount as number | undefined) ??
      (legacyData.totalCount as number | undefined) ??
      null;

    const normalized = legacyItems.map(normalizeOpportunity);
    return {
      data: buildSearchResult(normalized, legacyTotal, page, rows, "legacy"),
      status: legacyStatus,
      vintage: makeVintage(),
    };
  },

  async getOpportunity(opportunityId: string): Promise<ApiResponse<GrantOpportunitySummary | null>> {
    try {
      const { data, status } = await makeGetRequest(`/listing/${opportunityId}`, {});

      if (!data._notFound) {
        const oppData =
          (data.opportunity as Record<string, unknown>) ??
          (data as Record<string, unknown>);

        if (oppData.opportunityId || oppData.id || oppData.title) {
          if (!oppData.opportunityId) oppData.opportunityId = opportunityId;
          return {
            data: normalizeOpportunity(oppData),
            status,
            vintage: makeVintage(),
          };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("403")) throw err;
    }

    return {
      data: null,
      status: 404,
      vintage: makeVintage(),
    };
  },
};

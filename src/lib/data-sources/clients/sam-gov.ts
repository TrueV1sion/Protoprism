// src/lib/data-sources/clients/sam-gov.ts
/**
 * SAM.gov API Client (Layer 1)
 *
 * Internal HTTP client for the SAM.gov public API. Handles query construction,
 * rate limiting, and error handling. Not exposed to agents.
 *
 * Ported from mcp-servers/sam-gov-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 * - Requires SAM_GOV_API_KEY environment variable
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.sam.gov";

const ENDPOINTS = {
  OPPORTUNITIES: "/opportunities/v2/search",
  ENTITIES: "/entity-information/v3/entities",
} as const;

// 3 req/s (API allows 10/s with key)
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface SAMResult {
  total: number | null;
  count: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  results: Record<string, unknown>[];
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  endpoint: string,
  queryParams: Record<string, string | number | boolean | undefined> = {},
): Promise<ApiResponse<SAMResult>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const apiKey = process.env.SAM_GOV_API_KEY;
    const url = new URL(`${BASE_URL}${endpoint}`);

    if (apiKey) url.searchParams.set("api_key", apiKey);

    for (const [key, value] of Object.entries(queryParams)) {
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

    if (response.status === 404) {
      return {
        data: { total: 0, count: 0, offset: 0, limit: 10, hasMore: false, nextOffset: null, results: [] },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error(
        "SAM.gov API rate limit exceeded. The API allows 10 requests/second. Try again shortly.",
      );
    }

    if (response.status === 403) {
      throw new Error(
        "SAM.gov API returned 403 Forbidden. Verify your SAM_GOV_API_KEY environment variable.",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        `SAM.gov API error (HTTP ${response.status}): ${JSON.stringify(body)}`,
      );
    }

    const body = (await response.json()) as Record<string, unknown>;
    return {
      data: body as unknown as SAMResult,
      status: response.status,
      vintage: makeVintage(),
    };
  } finally {
    globalRateLimiter.release();
  }
}

function normalizeOpportunitiesResponse(
  body: Record<string, unknown>,
  offset: number,
  limit: number,
): SAMResult {
  const totalRecords = body.totalRecords as number | undefined;
  const opportunities = (body.opportunitiesData as Record<string, unknown>[]) ?? [];
  const total = totalRecords ?? opportunities.length;
  const hasMore = offset + opportunities.length < total;

  return {
    total,
    count: opportunities.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + opportunities.length : null,
    results: opportunities,
  };
}

function normalizeEntitiesResponse(
  body: Record<string, unknown>,
  offset: number,
  limit: number,
): SAMResult {
  const totalRecords = body.totalRecords as number | undefined;
  const entities = (body.entityData as Record<string, unknown>[]) ?? [];
  const total = totalRecords ?? entities.length;
  const hasMore = offset + entities.length < total;

  return {
    total,
    count: entities.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + entities.length : null,
    results: entities,
  };
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "SAM.gov",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const samGovClient = {
  async searchOpportunities(params: {
    q?: string;
    limit?: number;
    offset?: number;
    postedFrom?: string;
    postedTo?: string;
    dueFrom?: string;
    dueTo?: string;
    ntype?: string;
    set_aside?: string;
    naics?: string;
    typeOfSetAside?: string;
    active?: boolean;
  }): Promise<ApiResponse<SAMResult>> {
    const limit = params.limit ?? 10;
    const offset = params.offset ?? 0;

    const queryParams: Record<string, string | number | boolean | undefined> = {
      limit,
      offset,
    };

    if (params.q) queryParams.q = params.q;
    if (params.postedFrom) queryParams.postedFrom = params.postedFrom;
    if (params.postedTo) queryParams.postedTo = params.postedTo;
    if (params.dueFrom) queryParams.dueFrom = params.dueFrom;
    if (params.dueTo) queryParams.dueTo = params.dueTo;
    if (params.ntype) queryParams.ntype = params.ntype;
    if (params.naics) queryParams.naics = params.naics;
    if (params.typeOfSetAside) queryParams.typeOfSetAside = params.typeOfSetAside;
    if (params.active !== undefined) queryParams.active = params.active;

    const raw = await makeRequest(ENDPOINTS.OPPORTUNITIES, queryParams);

    if (raw.status === 404) return raw;

    return {
      ...raw,
      data: normalizeOpportunitiesResponse(
        raw.data as unknown as Record<string, unknown>,
        offset,
        limit,
      ),
    };
  },

  async searchEntities(params: {
    legalBusinessName?: string;
    ueiSAM?: string;
    cageCode?: string;
    registrationStatus?: string;
    purposeOfRegistration?: string;
    naicsCode?: string;
    registrationLimit?: number;
    registrationOffset?: number;
  }): Promise<ApiResponse<SAMResult>> {
    const limit = params.registrationLimit ?? 10;
    const offset = params.registrationOffset ?? 0;

    const queryParams: Record<string, string | number | boolean | undefined> = {
      registrationLimit: limit,
      registrationOffset: offset,
    };

    if (params.legalBusinessName) queryParams.legalBusinessName = params.legalBusinessName;
    if (params.ueiSAM) queryParams.ueiSAM = params.ueiSAM;
    if (params.cageCode) queryParams.cageCode = params.cageCode;
    if (params.registrationStatus) queryParams.registrationStatus = params.registrationStatus;
    if (params.purposeOfRegistration) queryParams.purposeOfRegistration = params.purposeOfRegistration;
    if (params.naicsCode) queryParams.naicsCode = params.naicsCode;

    const raw = await makeRequest(ENDPOINTS.ENTITIES, queryParams);

    if (raw.status === 404) return raw;

    return {
      ...raw,
      data: normalizeEntitiesResponse(
        raw.data as unknown as Record<string, unknown>,
        offset,
        limit,
      ),
    };
  },

  hasApiKey(): boolean {
    return !!process.env.SAM_GOV_API_KEY;
  },
};

// src/lib/data-sources/clients/gpo-govinfo.ts
/**
 * GPO GovInfo API Client (Layer 1)
 *
 * Internal HTTP client for the GovInfo public API. Handles query construction,
 * rate limiting, pagination, and error handling. Not exposed to agents.
 *
 * Ported from mcp-servers/gpo-govinfo-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage instead of raw response
 * - Requires GOVINFO_API_KEY environment variable
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.govinfo.gov";

const ENDPOINTS = {
  SEARCH: "/search",
  COLLECTIONS: "/collections",
  PACKAGES: "/packages",
} as const;

// 3 req/s (1,000/hour as documented)
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface GovInfoSearchResult {
  count: number;
  totalCount: number;
  nextPage?: string;
  previousPage?: string;
  packages: Record<string, unknown>[];
}

export interface GovInfoPackageResult {
  packageId: string;
  title?: string;
  collectionCode?: string;
  dateIssued?: string;
  lastModified?: string;
  details: Record<string, unknown>;
}

export interface GovInfoCollectionResult {
  collections: Record<string, unknown>[];
  count: number;
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ApiResponse<T>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const apiKey = process.env.GOVINFO_API_KEY;
    const url = new URL(`${BASE_URL}${path}`);

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

    if (response.status === 404) {
      return {
        data: { count: 0, totalCount: 0, packages: [] } as T,
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error(
        "GovInfo API rate limit exceeded. The API allows 1,000 requests/hour. Try again shortly.",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        `GovInfo API error (HTTP ${response.status}): ${body.message ?? "Unknown error"}`,
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
    source: "GPO GovInfo",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const gpoGovinfoClient = {
  async search(params: {
    query: string;
    collections?: string;
    pageSize?: number;
    offsetMark?: string;
    dateIssuedStartDate?: string;
    dateIssuedEndDate?: string;
  }): Promise<ApiResponse<GovInfoSearchResult>> {
    const queryParams: Record<string, string | number | undefined> = {
      query: params.query,
      pageSize: params.pageSize ?? 10,
    };
    if (params.collections) queryParams.collections = params.collections;
    if (params.offsetMark) queryParams.offsetMark = params.offsetMark;
    if (params.dateIssuedStartDate) queryParams.dateIssuedStartDate = params.dateIssuedStartDate;
    if (params.dateIssuedEndDate) queryParams.dateIssuedEndDate = params.dateIssuedEndDate;

    return makeRequest<GovInfoSearchResult>(ENDPOINTS.SEARCH, queryParams);
  },

  async getPackage(packageId: string): Promise<ApiResponse<GovInfoPackageResult>> {
    const response = await makeRequest<Record<string, unknown>>(
      `${ENDPOINTS.PACKAGES}/${encodeURIComponent(packageId)}`,
    );
    return {
      ...response,
      data: {
        packageId,
        title: response.data.title as string | undefined,
        collectionCode: response.data.collectionCode as string | undefined,
        dateIssued: response.data.dateIssued as string | undefined,
        lastModified: response.data.lastModified as string | undefined,
        details: response.data,
      },
    };
  },

  async getPackageSummary(packageId: string): Promise<ApiResponse<GovInfoPackageResult>> {
    const response = await makeRequest<Record<string, unknown>>(
      `${ENDPOINTS.PACKAGES}/${encodeURIComponent(packageId)}/summary`,
    );
    return {
      ...response,
      data: {
        packageId,
        title: response.data.title as string | undefined,
        collectionCode: response.data.collectionCode as string | undefined,
        dateIssued: response.data.dateIssued as string | undefined,
        lastModified: response.data.lastModified as string | undefined,
        details: response.data,
      },
    };
  },

  async getCollections(params: {
    pageSize?: number;
    offsetMark?: string;
  } = {}): Promise<ApiResponse<GovInfoCollectionResult>> {
    const response = await makeRequest<Record<string, unknown>>(
      ENDPOINTS.COLLECTIONS,
      {
        pageSize: params.pageSize ?? 100,
        offsetMark: params.offsetMark,
      },
    );
    const collections = (response.data.collections as Record<string, unknown>[]) ?? [];
    return {
      ...response,
      data: {
        collections,
        count: collections.length,
      },
    };
  },

  async getCollectionPackages(params: {
    collection: string;
    pageSize?: number;
    offsetMark?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<GovInfoSearchResult>> {
    const queryParams: Record<string, string | number | undefined> = {
      pageSize: params.pageSize ?? 10,
    };
    if (params.offsetMark) queryParams.offsetMark = params.offsetMark;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;

    return makeRequest<GovInfoSearchResult>(
      `${ENDPOINTS.COLLECTIONS}/${encodeURIComponent(params.collection)}`,
      queryParams,
    );
  },

  hasApiKey(): boolean {
    return !!process.env.GOVINFO_API_KEY;
  },
};

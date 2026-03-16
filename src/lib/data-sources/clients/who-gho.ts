// src/lib/data-sources/clients/who-gho.ts
/**
 * WHO Global Health Observatory (GHO) API Client (Layer 1)
 *
 * Internal HTTP client for the WHO GHO OData v4 REST API.
 * Supports filtering by indicator, country, year range, and sex dimension.
 *
 * Ported from mcp-servers/who-gho-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 * - No retry/backoff loop — callers handle retries at a higher layer
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://ghoapi.azureedge.net/api";

// 3 req/s — conservative for a WHO public API
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface GHOIndicator {
  IndicatorCode: string;
  IndicatorName: string;
  Language?: string;
}

export interface GHODataPoint {
  Id?: number;
  IndicatorCode: string;
  SpatialDimType?: string;
  SpatialDim?: string;
  TimeDimType?: string;
  TimeDim?: number;
  Dim1Type?: string;
  Dim1?: string;
  Dim2Type?: string;
  Dim2?: string;
  Dim3Type?: string;
  Dim3?: string;
  DataSourceDimType?: string;
  DataSourceDim?: string;
  Value?: string;
  NumericValue?: number | null;
  Low?: number | null;
  High?: number | null;
  Comments?: string | null;
  Date?: string;
  TimeDimensionValue?: string;
  TimeDimensionBegin?: string;
  TimeDimensionEnd?: string;
}

export interface GHOCountry {
  Code: string;
  Title: string;
  WHO_REGION_CODE?: string;
  WORLD_BANK_INCOME_GROUP_CODE?: string;
}

export interface GHOODataResult<T> {
  results: T[];
  count: number;
  hasMore: boolean;
}

// ─── OData Filter Helpers ─────────────────────────────────────

/**
 * Escape single quotes in OData string values.
 */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build a $filter expression matching an indicator name keyword.
 */
export function buildIndicatorNameFilter(keyword: string): string {
  return `contains(IndicatorName,'${escapeOData(keyword)}')`;
}

/**
 * Build a $filter for country, year range, and sex dimension.
 */
export function buildDataFilter(options: {
  country?: string;
  yearFrom?: number;
  yearTo?: number;
  sex?: string;
}): string | undefined {
  const clauses: string[] = [];

  if (options.country) {
    clauses.push(`SpatialDim eq '${escapeOData(options.country.toUpperCase())}'`);
  }
  if (options.yearFrom !== undefined) {
    clauses.push(`TimeDim ge ${options.yearFrom}`);
  }
  if (options.yearTo !== undefined) {
    clauses.push(`TimeDim le ${options.yearTo}`);
  }
  if (options.sex) {
    const sexCode = normalizeSexCode(options.sex);
    if (sexCode) {
      clauses.push(`Dim1 eq '${sexCode}'`);
    }
  }

  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

/**
 * Build a $filter matching any of a list of country codes.
 */
export function buildMultiCountryFilter(countryCodes: string[]): string {
  return countryCodes
    .map((code) => `SpatialDim eq '${escapeOData(code.toUpperCase())}'`)
    .join(" or ");
}

function normalizeSexCode(sex: string): string | null {
  switch (sex.toUpperCase().trim()) {
    case "MALE":
    case "MLE":
    case "M":
      return "MLE";
    case "FEMALE":
    case "FMLE":
    case "F":
      return "FMLE";
    case "BOTH":
    case "BTSX":
    case "B":
      return "BTSX";
    default:
      return null;
  }
}

// ─── URL Builder ─────────────────────────────────────────────

function buildUrl(
  path: string,
  query: {
    $filter?: string;
    $select?: string;
    $orderby?: string;
    $top?: number;
    $skip?: number;
  } = {},
): string {
  const parts: string[] = [];

  if (query.$filter) parts.push(`$filter=${encodeURIComponent(query.$filter)}`);
  if (query.$select) parts.push(`$select=${encodeURIComponent(query.$select)}`);
  if (query.$orderby) parts.push(`$orderby=${encodeURIComponent(query.$orderby)}`);
  if (query.$top !== undefined) parts.push(`$top=${query.$top}`);
  if (query.$skip !== undefined && query.$skip > 0) parts.push(`$skip=${query.$skip}`);

  const base = `${BASE_URL}/${path}`;
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}

// ─── Core Request ────────────────────────────────────────────

interface GHOEnvelope {
  "@odata.context"?: string;
  "@odata.count"?: number;
  value?: unknown[];
}

async function makeRequest<T>(
  path: string,
  query: {
    $filter?: string;
    $select?: string;
    $orderby?: string;
    $top?: number;
    $skip?: number;
  } = {},
): Promise<ApiResponse<GHOODataResult<T>>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const url = buildUrl(path, query);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: { results: [], count: 0, hasMore: false },
        status: 404,
        vintage: makeVintage(),
      };
    }

    if (response.status === 429) {
      throw new Error("WHO GHO API rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`WHO GHO API error (HTTP ${response.status}): ${text}`);
    }

    const envelope = (await response.json()) as GHOEnvelope;
    const results = (envelope.value ?? []) as T[];
    const top = query.$top ?? results.length;
    const skip = query.$skip ?? 0;

    return {
      data: {
        results,
        count: results.length,
        hasMore: results.length >= top && top > 0,
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
    source: "WHO Global Health Observatory",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const whoGhoClient = {
  /**
   * List available GHO indicators, optionally filtered by keyword.
   */
  async listIndicators(params: {
    keyword?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<GHOODataResult<GHOIndicator>>> {
    const query: Parameters<typeof makeRequest>[1] = {
      $top: params.limit ?? 50,
      $orderby: "IndicatorCode",
    };
    if (params.offset) query.$skip = params.offset;
    if (params.keyword) query.$filter = buildIndicatorNameFilter(params.keyword);

    return makeRequest<GHOIndicator>("Indicator", query);
  },

  /**
   * Fetch data for a specific indicator, with optional filters.
   */
  async getIndicatorData(params: {
    indicatorCode: string;
    country?: string;
    yearFrom?: number;
    yearTo?: number;
    sex?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<GHOODataResult<GHODataPoint>>> {
    const filter = buildDataFilter({
      country: params.country,
      yearFrom: params.yearFrom,
      yearTo: params.yearTo,
      sex: params.sex,
    });

    const query: Parameters<typeof makeRequest>[1] = {
      $top: params.limit ?? 100,
      $orderby: "TimeDim desc",
    };
    if (params.offset) query.$skip = params.offset;
    if (filter) query.$filter = filter;

    return makeRequest<GHODataPoint>(params.indicatorCode, query);
  },

  /**
   * Fetch data for a single indicator across multiple countries.
   */
  async getMultiCountryData(params: {
    indicatorCode: string;
    countryCodes: string[];
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
  }): Promise<ApiResponse<GHOODataResult<GHODataPoint>>> {
    const filters: string[] = [];

    if (params.countryCodes.length > 0) {
      filters.push(`(${buildMultiCountryFilter(params.countryCodes)})`);
    }
    if (params.yearFrom !== undefined) {
      filters.push(`TimeDim ge ${params.yearFrom}`);
    }
    if (params.yearTo !== undefined) {
      filters.push(`TimeDim le ${params.yearTo}`);
    }

    const query: Parameters<typeof makeRequest>[1] = {
      $top: params.limit ?? 100,
      $orderby: "TimeDim desc",
    };
    if (filters.length > 0) query.$filter = filters.join(" and ");

    return makeRequest<GHODataPoint>(params.indicatorCode, query);
  },

  /**
   * List all countries/territories in the GHO dimension catalogue.
   */
  async listCountries(params: {
    region?: string;
    limit?: number;
  }): Promise<ApiResponse<GHOODataResult<GHOCountry>>> {
    const query: Parameters<typeof makeRequest>[1] = {
      $top: params.limit ?? 250,
      $orderby: "Title",
    };
    if (params.region) {
      query.$filter = `WHO_REGION_CODE eq '${escapeOData(params.region.toUpperCase())}'`;
    }

    return makeRequest<GHOCountry>("DIMENSION/COUNTRY/DimensionValues", query);
  },

  /**
   * Raw OData query — supply path and OData params directly.
   */
  async rawQuery<T = unknown>(params: {
    path: string;
    $filter?: string;
    $select?: string;
    $orderby?: string;
    $top?: number;
    $skip?: number;
  }): Promise<ApiResponse<GHOODataResult<T>>> {
    const { path, ...query } = params;
    return makeRequest<T>(path, query);
  },
};

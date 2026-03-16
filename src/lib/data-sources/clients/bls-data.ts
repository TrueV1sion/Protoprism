// src/lib/data-sources/clients/bls-data.ts
/**
 * BLS Public Data API Client (Layer 1)
 *
 * Internal HTTP client for the Bureau of Labor Statistics Public Data API v2.
 * Uses POST requests with JSON body for batch series requests.
 *
 * Ported from mcp-servers/bls-data-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://api.bls.gov/publicAPI/v2";
const TIMESERIES_ENDPOINT = "/timeseries/data/";

const MAX_SERIES_PER_REQUEST = 50;
const MAX_YEAR_SPAN = 20;

// 2 req/s — BLS is daily-limited; be conservative with concurrency
const clientLimiter = new TokenBucketLimiter(2);

// ─── Types ───────────────────────────────────────────────────

export interface BLSFootnote {
  code: string;
  text: string;
}

export interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes: BLSFootnote[];
  latest?: string;
  calculations?: {
    net_changes?: Record<string, string>;
    pct_changes?: Record<string, string>;
  };
}

export interface BLSSeriesResult {
  seriesID: string;
  data: BLSDataPoint[];
}

export interface BLSTimeSeriesResult {
  series: BLSSeriesResult[];
  hasMore: boolean;
}

// ─── Internal Response Types ─────────────────────────────────

interface BLSAPIResponse {
  status: string;
  responseTime: number;
  message: string[];
  Results?: {
    series: BLSSeriesResult[];
  };
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(
  seriesIds: string[],
  startYear: number,
  endYear: number,
  options: { calculations?: boolean; annualAverage?: boolean } = {},
): Promise<ApiResponse<BLSTimeSeriesResult>> {
  // Validate inputs
  if (seriesIds.length === 0) {
    throw new Error("At least one series ID is required");
  }
  if (seriesIds.length > MAX_SERIES_PER_REQUEST) {
    throw new Error(
      `Too many series IDs: ${seriesIds.length} exceeds maximum of ${MAX_SERIES_PER_REQUEST}`,
    );
  }
  const yearSpan = endYear - startYear;
  if (yearSpan < 0) {
    throw new Error("endYear must be >= startYear");
  }
  if (yearSpan > MAX_YEAR_SPAN) {
    throw new Error(
      `Year span ${yearSpan} exceeds maximum of ${MAX_YEAR_SPAN} years. Narrow your date range.`,
    );
  }

  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const body: Record<string, unknown> = {
      seriesid: seriesIds,
      startyear: String(startYear),
      endyear: String(endYear),
    };

    const apiKey = process.env.BLS_API_KEY;
    if (apiKey) body.registrationkey = apiKey;
    if (options.calculations) body.calculations = true;
    if (options.annualAverage) body.annualaverage = true;

    const url = `${BASE_URL}${TIMESERIES_ENDPOINT}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Protoprism/1.0 (research@protoprism.ai)",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      throw new Error("BLS API rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      throw new Error(
        `BLS API HTTP error ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as BLSAPIResponse;

    if (data.status !== "REQUEST_SUCCEEDED") {
      const messages = data.message?.join("; ") ?? "Unknown API error";
      throw new Error(`BLS API error (status: ${data.status}): ${messages}`);
    }

    if (!data.Results?.series) {
      throw new Error("BLS API returned no series data");
    }

    return {
      data: {
        series: data.Results.series,
        hasMore: false, // BLS returns full date range requested
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
    source: "Bureau of Labor Statistics",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const blsDataClient = {
  /**
   * Fetch time series data for one or more BLS series IDs.
   */
  async getTimeSeries(params: {
    seriesIds: string[];
    startYear: number;
    endYear: number;
    calculations?: boolean;
    annualAverage?: boolean;
  }): Promise<ApiResponse<BLSTimeSeriesResult>> {
    return makeRequest(params.seriesIds, params.startYear, params.endYear, {
      calculations: params.calculations,
      annualAverage: params.annualAverage,
    });
  },

  /**
   * Convenience: get a single series.
   */
  async getSeries(params: {
    seriesId: string;
    startYear: number;
    endYear: number;
    calculations?: boolean;
    annualAverage?: boolean;
  }): Promise<ApiResponse<BLSTimeSeriesResult>> {
    return makeRequest([params.seriesId], params.startYear, params.endYear, {
      calculations: params.calculations,
      annualAverage: params.annualAverage,
    });
  },

  /** Returns true if a BLS API key is configured (increases daily rate limits). */
  hasApiKey(): boolean {
    return !!process.env.BLS_API_KEY;
  },
};

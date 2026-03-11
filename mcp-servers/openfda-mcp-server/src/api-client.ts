/**
 * openFDA API Client
 *
 * Shared HTTP client with rate limiting for all openFDA API requests.
 * Handles query string construction, pagination metadata, response
 * truncation, and error formatting.
 */

import axios, { AxiosError } from "axios";
import {
  OPENFDA_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface OpenFDARequestParams {
  /** The endpoint path (e.g. "/drug/label.json") */
  endpoint: string;
  /** The search query string (openFDA syntax) */
  search?: string;
  /** Number of results to return */
  limit?: number;
  /** Number of results to skip (for pagination) */
  skip?: number;
  /** Field to count/aggregate by (mutually exclusive with search results) */
  count?: string;
}

export interface OpenFDAResponse {
  meta?: {
    disclaimer?: string;
    terms?: string;
    license?: string;
    last_updated?: string;
    results?: {
      skip: number;
      limit: number;
      total: number;
    };
  };
  results?: unknown[];
  error?: {
    code: string;
    message: string;
  };
}

export interface FormattedResult {
  /** Total number of matching records */
  total: number;
  /** Number of results returned in this response */
  count: number;
  /** Current skip offset */
  skip: number;
  /** Limit used for this request */
  limit: number;
  /** Whether there are more results beyond this page */
  has_more: boolean;
  /** The skip value to use for the next page (null if no more) */
  next_skip: number | null;
  /** The actual result records */
  results: unknown[];
  /** Whether the response was truncated to fit CHARACTER_LIMIT */
  truncated: boolean;
}

// ─── Rate Limiter ────────────────────────────────────────────

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();
}

// ─── Query Builder ───────────────────────────────────────────

/**
 * Build an openFDA search query string from individual search clauses.
 * Joins multiple clauses with +AND+.
 *
 * @param clauses - Array of search clause strings (e.g. "brand_name:aspirin")
 * @returns Combined search string or undefined if no clauses
 */
export function buildSearchQuery(clauses: string[]): string | undefined {
  const nonEmpty = clauses.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return undefined;
  return nonEmpty.join("+AND+");
}

/**
 * Wrap a value in quotes for exact matching in openFDA queries.
 * Escapes internal quotes.
 */
export function quoteValue(value: string): string {
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Build a date range clause for openFDA date fields.
 *
 * @param field - The date field name (e.g. "receivedate")
 * @param from - Start date in YYYYMMDD format (optional)
 * @param to - End date in YYYYMMDD format (optional)
 * @returns Date range search clause or empty string
 */
export function buildDateRange(
  field: string,
  from?: string,
  to?: string,
): string {
  if (!from && !to) return "";
  const start = from ?? "*";
  const end = to ?? "*";
  return `${field}:[${start}+TO+${end}]`;
}

// ─── Main Request Function ───────────────────────────────────

/**
 * Make a request to the openFDA API with rate limiting.
 *
 * @param params - Request parameters including endpoint, search, limit, skip, count
 * @returns Formatted result with pagination metadata
 * @throws Error with actionable message on failure
 */
export async function makeOpenFDARequest(
  params: OpenFDARequestParams,
): Promise<FormattedResult> {
  await enforceRateLimit();

  // Build URL manually to avoid URLSearchParams encoding '+' as '%2B'.
  // The openFDA API uses '+' as space/AND separators in its search syntax
  // and expects them as literal '+' characters in the query string.
  const baseUrl = `${OPENFDA_BASE_URL}${params.endpoint}`;
  const queryParts: string[] = [];

  // Add API key if available
  const apiKey = process.env.OPENFDA_API_KEY;
  if (apiKey) {
    queryParts.push(`api_key=${encodeURIComponent(apiKey)}`);
  }

  // Build query parameters
  if (params.search) {
    // Do NOT encode the search value — it contains openFDA query syntax
    // with literal '+' for AND/OR/spaces and ':' for field:value pairs.
    queryParts.push(`search=${params.search}`);
  }

  if (params.count) {
    queryParts.push(`count=${encodeURIComponent(params.count)}`);
    // When counting, limit controls how many count buckets to return
    if (params.limit) {
      queryParts.push(`limit=${params.limit}`);
    }
  } else {
    if (params.limit !== undefined) {
      queryParts.push(`limit=${params.limit}`);
    }
    if (params.skip !== undefined && params.skip > 0) {
      queryParts.push(`skip=${params.skip}`);
    }
  }

  const fullUrl =
    queryParts.length > 0
      ? `${baseUrl}?${queryParts.join("&")}`
      : baseUrl;

  try {
    const response = await axios.get<OpenFDAResponse>(fullUrl, {
      timeout: 30000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Protoprism-OpenFDA-MCP/1.0",
      },
    });

    const data = response.data;

    // Handle API-level errors embedded in the response
    if (data.error) {
      throw new Error(
        `openFDA API error (${data.error.code}): ${data.error.message}`,
      );
    }

    const results = data.results ?? [];
    const meta = data.meta?.results;

    // For count requests, there's no pagination meta
    if (params.count) {
      return formatResponse(results, {
        total: results.length,
        skip: 0,
        limit: params.limit ?? results.length,
      });
    }

    const total = meta?.total ?? results.length;
    const skip = meta?.skip ?? params.skip ?? 0;
    const limit = meta?.limit ?? params.limit ?? results.length;

    return formatResponse(results, { total, skip, limit });
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const errorData = error.response?.data as OpenFDAResponse | undefined;

      if (status === 404) {
        // openFDA returns 404 when no results match the query
        return formatResponse([], { total: 0, skip: 0, limit: params.limit ?? 10 });
      }

      if (status === 429) {
        throw new Error(
          "openFDA API rate limit exceeded. The server enforces rate limiting automatically, " +
            "but the openFDA API may impose additional limits. Try again in a few seconds. " +
            "Set the OPENFDA_API_KEY environment variable to increase the rate limit from 40 to 240 requests/minute.",
        );
      }

      if (status === 400 && errorData?.error) {
        throw new Error(
          `openFDA query error: ${errorData.error.message}. ` +
            "Check that field names and search syntax are valid. " +
            "Refer to https://open.fda.gov/apis/ for field documentation.",
        );
      }

      throw new Error(
        `openFDA API request failed (HTTP ${status ?? "unknown"}): ${error.message}. ` +
          "Check your query parameters and try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`Unexpected error during openFDA API request: ${String(error)}`);
  }
}

// ─── Response Formatting ─────────────────────────────────────

function formatResponse(
  results: unknown[],
  pagination: { total: number; skip: number; limit: number },
): FormattedResult {
  const { total, skip, limit } = pagination;
  const hasMore = skip + results.length < total;
  const nextSkip = hasMore ? skip + results.length : null;

  let truncated = false;
  let finalResults = results;

  // Check if the serialized response exceeds the character limit
  const serialized = JSON.stringify(results);
  if (serialized.length > CHARACTER_LIMIT) {
    // Progressively reduce results until under the limit
    truncated = true;
    let truncatedResults = [...results];
    while (
      truncatedResults.length > 1 &&
      JSON.stringify(truncatedResults).length > CHARACTER_LIMIT
    ) {
      truncatedResults = truncatedResults.slice(
        0,
        Math.max(1, Math.floor(truncatedResults.length * 0.75)),
      );
    }
    finalResults = truncatedResults;
  }

  return {
    total,
    count: finalResults.length,
    skip,
    limit,
    has_more: hasMore,
    next_skip: nextSkip,
    results: finalResults,
    truncated,
  };
}

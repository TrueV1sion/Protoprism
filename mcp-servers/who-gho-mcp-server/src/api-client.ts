/**
 * WHO GHO API Client
 *
 * Shared HTTP client with rate limiting, exponential backoff,
 * and OData v4 query building for all GHO API requests.
 * Handles pagination, response truncation, and error formatting.
 */

import axios, { AxiosError } from "axios";
import {
  GHO_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
  MAX_RETRIES,
  BACKOFF_BASE_MS,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface ODataQueryParams {
  /** OData $filter expression */
  $filter?: string;
  /** OData $select - comma-separated field names */
  $select?: string;
  /** OData $orderby expression */
  $orderby?: string;
  /** OData $top - max records to return */
  $top?: number;
  /** OData $skip - records to skip for pagination */
  $skip?: number;
}

export interface GHORequestParams {
  /** The API path after the base URL (e.g., "Indicator", "WHOSIS_000001") */
  path: string;
  /** OData query parameters */
  query?: ODataQueryParams;
}

export interface GHOApiResponse {
  "@odata.context"?: string;
  "@odata.count"?: number;
  value?: unknown[];
}

export interface FormattedResult {
  /** Total number of records returned */
  count: number;
  /** Whether there may be more results */
  has_more: boolean;
  /** The skip value used */
  skip: number;
  /** The limit/top used */
  limit: number;
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

// ─── OData Query Builder ────────────────────────────────────

/**
 * Build a $filter clause that matches a keyword against the
 * IndicatorName field using OData contains().
 */
export function buildIndicatorNameFilter(keyword: string): string {
  // OData contains is case-insensitive on most implementations
  return `contains(IndicatorName,'${escapeODataString(keyword)}')`;
}

/**
 * Build a $filter for country (SpatialDim), year range, and sex dimension.
 */
export function buildDataFilter(options: {
  country?: string;
  yearFrom?: number;
  yearTo?: number;
  sex?: string;
}): string | undefined {
  const clauses: string[] = [];

  if (options.country) {
    clauses.push(`SpatialDim eq '${escapeODataString(options.country.toUpperCase())}'`);
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
 * Build a $filter to match multiple countries.
 */
export function buildMultiCountryFilter(countryCodes: string[]): string {
  const conditions = countryCodes.map(
    (code) => `SpatialDim eq '${escapeODataString(code.toUpperCase())}'`
  );
  return conditions.join(" or ");
}

/**
 * Normalize sex parameter to GHO dimension codes.
 */
function normalizeSexCode(sex: string): string | null {
  const normalized = sex.toUpperCase().trim();
  switch (normalized) {
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

/**
 * Escape single quotes in OData string values.
 */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// ─── Main Request Function ───────────────────────────────────

/**
 * Make a request to the GHO API with rate limiting and exponential backoff.
 *
 * @param params - Request parameters including path and OData query
 * @returns Formatted result with pagination metadata
 * @throws Error with actionable message on failure
 */
export async function makeGHORequest(
  params: GHORequestParams,
): Promise<FormattedResult> {
  const url = buildUrl(params);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await enforceRateLimit();

    try {
      const response = await axios.get<GHOApiResponse>(url, {
        timeout: 30_000,
        headers: {
          Accept: "application/json",
          "User-Agent": "Protoprism-WHO-GHO-MCP/1.0",
        },
      });

      const data = response.data;
      const results = data.value ?? [];
      const top = params.query?.$top ?? results.length;
      const skip = params.query?.$skip ?? 0;

      return formatResponse(results, { skip, limit: top });
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;

        // Retry on 429 (rate limited) or 5xx (server error)
        if (status !== undefined && (status === 429 || status >= 500)) {
          lastError = new Error(
            `GHO API returned HTTP ${status}: ${error.message}`
          );
          if (attempt < MAX_RETRIES) {
            const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
        }

        if (status === 404) {
          return formatResponse([], { skip: 0, limit: params.query?.$top ?? 50 });
        }

        throw new Error(
          `GHO API request failed (HTTP ${status ?? "unknown"}): ${error.message}. ` +
            `URL: ${url}`
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Unexpected error during GHO API request: ${String(error)}`
      );
    }
  }

  throw lastError ?? new Error("GHO API request failed after max retries");
}

// ─── URL Builder ─────────────────────────────────────────────

function buildUrl(params: GHORequestParams): string {
  const base = `${GHO_BASE_URL}${params.path}`;
  const queryParts: string[] = [];

  if (params.query) {
    const q = params.query;
    if (q.$filter) {
      queryParts.push(`$filter=${encodeURIComponent(q.$filter)}`);
    }
    if (q.$select) {
      queryParts.push(`$select=${encodeURIComponent(q.$select)}`);
    }
    if (q.$orderby) {
      queryParts.push(`$orderby=${encodeURIComponent(q.$orderby)}`);
    }
    if (q.$top !== undefined) {
      queryParts.push(`$top=${q.$top}`);
    }
    if (q.$skip !== undefined && q.$skip > 0) {
      queryParts.push(`$skip=${q.$skip}`);
    }
  }

  return queryParts.length > 0 ? `${base}?${queryParts.join("&")}` : base;
}

// ─── Response Formatting ─────────────────────────────────────

function formatResponse(
  results: unknown[],
  pagination: { skip: number; limit: number },
): FormattedResult {
  const { skip, limit } = pagination;
  // GHO API doesn't always return total count; infer has_more from result size
  const hasMore = results.length >= limit;

  let truncated = false;
  let finalResults = results;

  const serialized = JSON.stringify(results);
  if (serialized.length > CHARACTER_LIMIT) {
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
    count: finalResults.length,
    has_more: hasMore,
    skip,
    limit,
    results: finalResults,
    truncated,
  };
}

/**
 * Truncate a JSON-serializable result to CHARACTER_LIMIT.
 * Used by tools that build their own response objects.
 */
export function truncateResponse(data: unknown): { text: string; truncated: boolean } {
  const serialized = JSON.stringify(data, null, 2);
  if (serialized.length <= CHARACTER_LIMIT) {
    return { text: serialized, truncated: false };
  }
  const truncated = serialized.slice(0, CHARACTER_LIMIT);
  return {
    text: truncated + "\n\n[Truncated - response exceeded 25,000 character limit]",
    truncated: true,
  };
}

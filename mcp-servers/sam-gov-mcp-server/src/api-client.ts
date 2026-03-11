/**
 * SAM.gov API Client
 *
 * Shared HTTP client with API key injection, rate limiting, exponential
 * backoff retry, and response truncation for all SAM.gov API requests.
 */

import axios, { AxiosError } from "axios";
import {
  SAM_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
  MAX_RETRIES,
  BASE_RETRY_DELAY_MS,
  USER_AGENT,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface SAMRequestParams {
  /** The endpoint path (e.g. "/opportunities/v2/search") */
  endpoint: string;
  /** Query parameters as key-value pairs */
  queryParams?: Record<string, string | number | boolean | undefined>;
}

export interface FormattedResult {
  /** Total number of matching records (if available from API) */
  total: number | null;
  /** Number of results returned in this response */
  count: number;
  /** Current offset */
  offset: number;
  /** Limit used for this request */
  limit: number;
  /** Whether there are more results beyond this page */
  has_more: boolean;
  /** The offset value to use for the next page (null if no more) */
  next_offset: number | null;
  /** The actual result records */
  results: unknown[];
  /** Whether the response was truncated to fit CHARACTER_LIMIT */
  truncated: boolean;
}

// ─── API Key ─────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) {
    throw new Error(
      "SAM_GOV_API_KEY environment variable is not set. " +
        "Register for a free API key at https://sam.gov/content/entity-information and " +
        "set it as SAM_GOV_API_KEY in your environment.",
    );
  }
  return key;
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

// ─── Retry with Exponential Backoff ──────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: AxiosError): boolean {
  const status = error.response?.status;
  if (!status) return true; // Network errors are retryable
  return status === 429 || status >= 500;
}

// ─── Main Request Function ───────────────────────────────────

/**
 * Make a request to the SAM.gov API with rate limiting and retry.
 *
 * @param params - Request parameters including endpoint and query params
 * @returns Raw response data from the API
 * @throws Error with actionable message on failure
 */
export async function makeSAMRequest(
  params: SAMRequestParams,
): Promise<unknown> {
  const apiKey = getApiKey();
  await enforceRateLimit();

  // Build URL with query parameters
  const url = new URL(`${SAM_BASE_URL}${params.endpoint}`);
  url.searchParams.set("api_key", apiKey);

  if (params.queryParams) {
    for (const [key, value] of Object.entries(params.queryParams)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url.toString(), {
        timeout: 30000,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.error(
            `[sam-gov-mcp] Request failed (HTTP ${error.response?.status ?? "network error"}), ` +
              `retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          );
          await sleep(delay);
          lastError = error;
          continue;
        }

        const status = error.response?.status;

        if (status === 403) {
          throw new Error(
            "SAM.gov API returned 403 Forbidden. Your API key may be invalid or expired. " +
              "Verify your SAM_GOV_API_KEY environment variable.",
          );
        }

        if (status === 429) {
          throw new Error(
            "SAM.gov API rate limit exceeded after retries. " +
              "The API allows 10 requests/second with an API key. Try again shortly.",
          );
        }

        if (status === 400) {
          const errorBody = error.response?.data;
          const errorMsg =
            typeof errorBody === "object" && errorBody !== null
              ? JSON.stringify(errorBody)
              : String(errorBody ?? "Bad Request");
          throw new Error(
            `SAM.gov API query error (400): ${errorMsg}. ` +
              "Check your query parameters.",
          );
        }

        throw new Error(
          `SAM.gov API request failed (HTTP ${status ?? "unknown"}): ${error.message}. ` +
            "Check your query parameters and try again.",
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Unexpected error during SAM.gov API request: ${String(error)}`,
      );
    }
  }

  throw lastError ?? new Error("SAM.gov API request failed after all retries.");
}

// ─── Opportunities Request ───────────────────────────────────

/**
 * Search federal contract opportunities on SAM.gov.
 */
export async function searchOpportunities(
  queryParams: Record<string, string | number | boolean | undefined>,
): Promise<FormattedResult> {
  const data = await makeSAMRequest({
    endpoint: "/opportunities/v2/search",
    queryParams,
  });

  const response = data as Record<string, unknown>;
  const totalRecords = response.totalRecords as number | undefined;
  const opportunities = (response.opportunitiesData as unknown[]) ?? [];
  const limit = (queryParams.limit as number) ?? 10;
  const offset = (queryParams.offset as number) ?? 0;
  const total = totalRecords ?? opportunities.length;

  return formatResponse(opportunities, { total, offset, limit });
}

// ─── Entity Request ──────────────────────────────────────────

/**
 * Search registered entities (companies/orgs) on SAM.gov.
 */
export async function searchEntities(
  queryParams: Record<string, string | number | boolean | undefined>,
): Promise<FormattedResult> {
  const data = await makeSAMRequest({
    endpoint: "/entity-information/v3/entities",
    queryParams,
  });

  const response = data as Record<string, unknown>;
  const totalRecords = response.totalRecords as number | undefined;
  const entities = (response.entityData as unknown[]) ?? [];
  const limit = (queryParams.registrationLimit as number) ?? 10;
  const offset = (queryParams.registrationOffset as number) ?? 0;
  const total = totalRecords ?? entities.length;

  return formatResponse(entities, { total, offset, limit });
}

// ─── Response Formatting ─────────────────────────────────────

function formatResponse(
  results: unknown[],
  pagination: { total: number; offset: number; limit: number },
): FormattedResult {
  const { total, offset, limit } = pagination;
  const hasMore = offset + results.length < total;
  const nextOffset = hasMore ? offset + results.length : null;

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
    offset,
    limit,
    has_more: hasMore,
    next_offset: nextOffset,
    results: finalResults,
    truncated,
  };
}

/**
 * Truncate a JSON string representation to CHARACTER_LIMIT.
 * Appends [Truncated] notice if truncation occurs.
 */
export function truncateResponse(jsonStr: string): string {
  if (jsonStr.length <= CHARACTER_LIMIT) {
    return jsonStr;
  }
  return (
    jsonStr.slice(0, CHARACTER_LIMIT - 50) +
    '\n\n... [Truncated - response exceeded 25,000 character limit]'
  );
}

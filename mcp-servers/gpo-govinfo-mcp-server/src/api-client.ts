/**
 * GPO GovInfo API Client
 *
 * Shared HTTP client with API key injection, rate limiting, exponential
 * backoff on 429/5xx errors, and response truncation. All GovInfo API
 * requests flow through this module.
 */

import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import {
  GOVINFO_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
  MAX_RETRIES,
  BASE_BACKOFF_MS,
} from "./constants.js";

// ── Types ───────────────────────────────────────────────────

export interface GovInfoRequestParams {
  /** The API path (e.g. "/search", "/collections/BILLS") */
  path: string;
  /** Query parameters to include */
  params?: Record<string, string | number | undefined>;
}

// ── API Key ─────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GOVINFO_API_KEY;
  if (!key) {
    throw new Error(
      "GOVINFO_API_KEY environment variable is required. " +
        "Get a free API key at https://api.govinfo.gov/docs/ and set it as GOVINFO_API_KEY.",
    );
  }
  return key;
}

// ── Rate Limiter ────────────────────────────────────────────

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

// ── Retry with Exponential Backoff ──────────────────────────

function isRetryableStatus(status: number | undefined): boolean {
  if (!status) return true; // Network error, retry
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Response Truncation ─────────────────────────────────────

/**
 * Truncate a string to the character limit, appending a notice if truncated.
 */
export function truncateResponse(text: string): { text: string; truncated: boolean } {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, truncated: false };
  }
  const truncated = text.slice(0, CHARACTER_LIMIT - 50) +
    "\n\n[Truncated - response exceeded 25,000 character limit]";
  return { text: truncated, truncated: true };
}

// ── Main Request Function ───────────────────────────────────

/**
 * Make a request to the GovInfo API with rate limiting and retry logic.
 *
 * @param params - Request parameters including path and query params
 * @returns Parsed JSON response from the API
 * @throws Error with actionable message on failure
 */
export async function makeGovInfoRequest<T = unknown>(
  params: GovInfoRequestParams,
): Promise<T> {
  const apiKey = getApiKey();

  // Build query parameters, injecting API key
  const queryParams: Record<string, string | number> = {
    api_key: apiKey,
  };

  if (params.params) {
    for (const [key, value] of Object.entries(params.params)) {
      if (value !== undefined && value !== "") {
        queryParams[key] = value;
      }
    }
  }

  const url = `${GOVINFO_BASE_URL}${params.path}`;
  const config: AxiosRequestConfig = {
    timeout: 30000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Protoprism-GovInfo-MCP/1.0",
    },
    params: queryParams,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await enforceRateLimit();

    try {
      const response = await axios.get<T>(url, config);
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;

        // Non-retryable client errors
        if (status === 404) {
          throw new Error(
            `GovInfo resource not found: ${params.path}. ` +
              "Verify the packageId, collection code, or path is correct.",
          );
        }

        if (status === 400) {
          const msg = typeof error.response?.data === "string"
            ? error.response.data
            : JSON.stringify(error.response?.data);
          throw new Error(
            `GovInfo API bad request: ${msg}. Check query parameters and try again.`,
          );
        }

        if (status === 403) {
          throw new Error(
            "GovInfo API access denied. Verify your GOVINFO_API_KEY is valid. " +
              "Get a free key at https://api.govinfo.gov/docs/",
          );
        }

        // Retryable errors
        if (isRetryableStatus(status) && attempt < MAX_RETRIES) {
          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.error(
            `[govinfo-mcp] Request failed (HTTP ${status ?? "network error"}), ` +
              `retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          lastError = new Error(
            `GovInfo API error (HTTP ${status ?? "network error"}): ${error.message}`,
          );
          await sleep(backoffMs);
          continue;
        }

        throw new Error(
          `GovInfo API request failed (HTTP ${status ?? "unknown"}): ${error.message}. ` +
            (status === 429
              ? "Rate limit exceeded. The API allows 1,000 requests/hour. Please wait and retry."
              : "Check your query parameters and try again."),
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Unexpected error during GovInfo API request: ${String(error)}`,
      );
    }
  }

  throw lastError ?? new Error("GovInfo API request failed after retries");
}

// ── Convenience: Fetch text content for a package ───────────

/**
 * Fetch the HTML/text content for a GovInfo package.
 * Falls back gracefully if HTML is not available.
 */
export async function fetchPackageContent(
  packageId: string,
  granuleId?: string,
): Promise<string | null> {
  try {
    const basePath = granuleId
      ? `/packages/${packageId}/granules/${granuleId}`
      : `/packages/${packageId}`;

    // Try HTM first (most common format)
    const response = await makeGovInfoRequest<string>({
      path: `${basePath}/htm`,
    });

    if (typeof response === "string") {
      return response;
    }

    // If the response is an object with a body or content field, extract it
    if (typeof response === "object" && response !== null) {
      const obj = response as Record<string, unknown>;
      if (typeof obj.body === "string") return obj.body;
      if (typeof obj.content === "string") return obj.content;
    }

    return JSON.stringify(response);
  } catch {
    // HTML not available for this package
    return null;
  }
}

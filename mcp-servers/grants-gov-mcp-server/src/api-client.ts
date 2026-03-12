/**
 * Grants.gov API Client
 *
 * Shared HTTP client with optional API key injection, rate limiting,
 * exponential backoff retry, v1-to-legacy fallback, and response
 * normalization for all Grants.gov API requests.
 */

import axios, { AxiosError } from "axios";
import {
  API_BASE_URL,
  LEGACY_SEARCH_URL,
  RATE_LIMIT_MS,
  CHARACTER_LIMIT,
  MAX_RETRIES,
  BASE_RETRY_DELAY_MS,
  USER_AGENT,
  REQUEST_TIMEOUT_MS,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface SearchParams {
  keyword?: string;
  agency?: string;
  fundingCategory?: string;
  status?: string;
  sortBy?: string;
  rows?: number;
  page?: number;
}

export interface OpportunitySummary {
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

export interface OpportunityDetail extends OpportunitySummary {
  description: string | null;
  eligibility: string | null;
  additional_info: string | null;
  cost_sharing: string | null;
  cfda_numbers: string[];
  contact_info: Record<string, unknown> | null;
  posted_date: string | null;
  archive_date: string | null;
  estimated_synopsis_close_date: string | null;
  award_type: string | null;
  number_of_awards: string | null;
  grantor_contact_name: string | null;
  grantor_contact_email: string | null;
  grantor_contact_phone: string | null;
}

export interface FormattedSearchResult {
  total: number | null;
  count: number;
  page: number;
  limit: number;
  has_more: boolean;
  next_page: number | null;
  results: OpportunitySummary[];
  truncated: boolean;
  source: "v1" | "legacy";
}

export interface FormattedDetailResult {
  opportunity: OpportunityDetail | null;
  source: "v1" | "legacy";
  error?: string;
}

// ─── API Key ─────────────────────────────────────────────────

function getApiKey(): string | null {
  return process.env.GRANTS_GOV_API_KEY || null;
}

// ─── Rate Limiter ────────────────────────────────────────────

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    const waitMs = RATE_LIMIT_MS - elapsed;
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

// ─── V1 API Request ──────────────────────────────────────────

/**
 * Make a GET request to the Grants.gov v1 REST API.
 */
async function makeV1Request(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  await enforceRateLimit();

  const url = new URL(`${API_BASE_URL}${endpoint}`);

  // Inject API key if available
  const apiKey = getApiKey();
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  // Add query parameters
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url.toString(), {
        timeout: REQUEST_TIMEOUT_MS,
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
            `[grants-gov-mcp] V1 request failed (HTTP ${error.response?.status ?? "network error"}), ` +
              `retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          );
          await sleep(delay);
          lastError = error;
          continue;
        }

        // Non-retryable or exhausted retries
        lastError = error;
        throw error;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Unexpected error during Grants.gov V1 API request: ${String(error)}`,
      );
    }
  }

  throw lastError ?? new Error("Grants.gov V1 API request failed after all retries.");
}

// ─── Legacy API Request ──────────────────────────────────────

/**
 * Make a POST request to the legacy Grants.gov REST search endpoint.
 */
async function makeLegacySearchRequest(
  body: Record<string, unknown>,
): Promise<unknown> {
  await enforceRateLimit();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(LEGACY_SEARCH_URL, body, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
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
            `[grants-gov-mcp] Legacy request failed (HTTP ${error.response?.status ?? "network error"}), ` +
              `retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          );
          await sleep(delay);
          lastError = error;
          continue;
        }

        lastError = error;
        throw error;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Unexpected error during Grants.gov legacy request: ${String(error)}`,
      );
    }
  }

  throw lastError ?? new Error("Grants.gov legacy request failed after all retries.");
}

// ─── Response Normalization ──────────────────────────────────

/**
 * Normalize a V1 API search result item into our standard format.
 */
function normalizeV1Opportunity(item: Record<string, unknown>): OpportunitySummary {
  const id = String(
    item.opportunityId ?? item.id ?? item.opportunity_id ?? "",
  );
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
    opportunity_number: item.opportunityNumber ? String(item.opportunityNumber) : null,
    url: id
      ? `https://www.grants.gov/search-results-detail/${id}`
      : "",
  };
}

/**
 * Normalize a legacy API search result item into our standard format.
 */
function normalizeLegacyOpportunity(item: Record<string, unknown>): OpportunitySummary {
  const id = String(item.id ?? item.opportunityId ?? "");
  return {
    opportunity_id: id,
    title: String(item.title ?? item.opportunityTitle ?? ""),
    agency: String(item.agency ?? item.agencyCode ?? ""),
    funding_category: String(item.fundingCategory ?? ""),
    open_date: item.openDate ? String(item.openDate) : null,
    close_date: item.closeDate ? String(item.closeDate) : null,
    estimated_funding: item.estimatedFunding != null ? String(item.estimatedFunding) : null,
    award_ceiling: item.awardCeiling != null ? String(item.awardCeiling) : null,
    award_floor: item.awardFloor != null ? String(item.awardFloor) : null,
    status: String(item.oppStatus ?? item.status ?? ""),
    opportunity_number: item.number ? String(item.number) : null,
    url: id
      ? `https://www.grants.gov/search-results-detail/${id}`
      : "",
  };
}

/**
 * Normalize a V1 opportunity detail response.
 */
function normalizeV1Detail(data: Record<string, unknown>): OpportunityDetail {
  const base = normalizeV1Opportunity(data);
  return {
    ...base,
    description: data.description ? String(data.description) : null,
    eligibility: data.eligibility ? String(data.eligibility) : null,
    additional_info: data.additionalInformation
      ? String(data.additionalInformation)
      : null,
    cost_sharing: data.costSharing ? String(data.costSharing) : null,
    cfda_numbers: Array.isArray(data.cfdaNumbers)
      ? (data.cfdaNumbers as unknown[]).map(String)
      : data.cfdaNumber
        ? [String(data.cfdaNumber)]
        : [],
    contact_info:
      typeof data.contactInfo === "object" && data.contactInfo !== null
        ? (data.contactInfo as Record<string, unknown>)
        : null,
    posted_date: data.postedDate ? String(data.postedDate) : null,
    archive_date: data.archiveDate ? String(data.archiveDate) : null,
    estimated_synopsis_close_date: data.estimatedSynopsisCloseDate
      ? String(data.estimatedSynopsisCloseDate)
      : null,
    award_type: data.awardType ? String(data.awardType) : null,
    number_of_awards: data.numberOfAwards != null
      ? String(data.numberOfAwards)
      : null,
    grantor_contact_name: data.grantorContactName
      ? String(data.grantorContactName)
      : data.contactName
        ? String(data.contactName)
        : null,
    grantor_contact_email: data.grantorContactEmail
      ? String(data.grantorContactEmail)
      : data.contactEmail
        ? String(data.contactEmail)
        : null,
    grantor_contact_phone: data.grantorContactPhone
      ? String(data.grantorContactPhone)
      : data.contactPhone
        ? String(data.contactPhone)
        : null,
  };
}

// ─── Public Search Function ──────────────────────────────────

/**
 * Search grant opportunities. Tries the v1 API first, falls back to
 * the legacy POST endpoint if v1 is unavailable (404 or connection error).
 */
export async function searchOpportunities(
  params: SearchParams,
): Promise<FormattedSearchResult> {
  const rows = params.rows ?? 25;
  const page = params.page ?? 1;

  // --- Try v1 API first ---
  try {
    const v1Params: Record<string, string | number | undefined> = {
      rows,
      page,
    };

    if (params.keyword) v1Params.keyword = params.keyword;
    if (params.agency) v1Params.agency = params.agency;
    if (params.fundingCategory) v1Params.fundingCategory = params.fundingCategory;
    if (params.status) v1Params.status = params.status;
    if (params.sortBy) v1Params.sortBy = params.sortBy;

    const data = await makeV1Request("/search", v1Params);
    const response = data as Record<string, unknown>;

    // Extract results array from the v1 response
    const items =
      (response.opportunities as Record<string, unknown>[]) ??
      (response.oppHits as Record<string, unknown>[]) ??
      (response.data as Record<string, unknown>[]) ??
      [];

    const totalRecords =
      (response.totalCount as number | undefined) ??
      (response.totalRecords as number | undefined) ??
      (response.hitCount as number | undefined) ??
      null;

    const normalized = items.map(normalizeV1Opportunity);
    return buildSearchResult(normalized, totalRecords, page, rows, "v1");
  } catch (v1Error) {
    // Fall back to legacy API only on 404, network errors, or certain 4xx
    const shouldFallback =
      v1Error instanceof AxiosError &&
      (v1Error.response?.status === 404 ||
        v1Error.response?.status === 405 ||
        !v1Error.response);

    if (!shouldFallback) {
      // Re-throw if it's a real error (400 bad params, 429, etc.)
      throw v1Error instanceof AxiosError
        ? buildApiError(v1Error)
        : v1Error;
    }

    console.error(
      "[grants-gov-mcp] V1 API unavailable, falling back to legacy endpoint...",
    );
  }

  // --- Legacy POST fallback ---
  try {
    const legacyBody: Record<string, unknown> = {
      rows,
      startRecordNum: (page - 1) * rows,
    };

    if (params.keyword) legacyBody.keyword = params.keyword;
    if (params.agency) legacyBody.agencies = params.agency;
    if (params.fundingCategory) legacyBody.fundingCategories = params.fundingCategory;
    if (params.status) legacyBody.oppStatuses = params.status;
    if (params.sortBy) legacyBody.sortBy = `${params.sortBy}|desc`;

    const data = await makeLegacySearchRequest(legacyBody);
    const response = data as Record<string, unknown>;

    const items =
      (response.oppHits as Record<string, unknown>[]) ??
      (response.opportunities as Record<string, unknown>[]) ??
      [];

    const totalRecords =
      (response.hitCount as number | undefined) ??
      (response.totalCount as number | undefined) ??
      null;

    const normalized = items.map(normalizeLegacyOpportunity);
    return buildSearchResult(normalized, totalRecords, page, rows, "legacy");
  } catch (legacyError) {
    throw legacyError instanceof AxiosError
      ? buildApiError(legacyError)
      : legacyError;
  }
}

// ─── Public Detail Function ──────────────────────────────────

/**
 * Get full details for a specific opportunity by ID. Tries v1 first,
 * falls back to legacy search by ID.
 */
export async function getOpportunityDetail(
  opportunityId: string,
): Promise<FormattedDetailResult> {
  // --- Try v1 detail endpoint ---
  try {
    const data = await makeV1Request(`/listing/${opportunityId}`, {});
    const response = data as Record<string, unknown>;

    // The detail endpoint may return the opportunity directly or nested
    const oppData =
      (response.opportunity as Record<string, unknown>) ??
      (response as Record<string, unknown>);

    if (!oppData.opportunityId && !oppData.id && !oppData.title) {
      return {
        opportunity: null,
        source: "v1",
        error: `No opportunity found with ID: ${opportunityId}`,
      };
    }

    // Ensure the id is set
    if (!oppData.opportunityId) {
      oppData.opportunityId = opportunityId;
    }

    return {
      opportunity: normalizeV1Detail(oppData),
      source: "v1",
    };
  } catch (v1Error) {
    const shouldFallback =
      v1Error instanceof AxiosError &&
      (v1Error.response?.status === 404 ||
        v1Error.response?.status === 405 ||
        !v1Error.response);

    if (!shouldFallback) {
      throw v1Error instanceof AxiosError
        ? buildApiError(v1Error)
        : v1Error;
    }

    console.error(
      "[grants-gov-mcp] V1 detail endpoint unavailable, falling back to legacy search...",
    );
  }

  // --- Fallback: search by opportunity ID via legacy ---
  try {
    const legacyBody: Record<string, unknown> = {
      keyword: opportunityId,
      rows: 5,
      startRecordNum: 0,
    };

    const data = await makeLegacySearchRequest(legacyBody);
    const response = data as Record<string, unknown>;

    const items =
      (response.oppHits as Record<string, unknown>[]) ??
      (response.opportunities as Record<string, unknown>[]) ??
      [];

    // Find the matching opportunity
    const match = items.find(
      (item) =>
        String(item.id) === opportunityId ||
        String(item.opportunityId) === opportunityId ||
        String(item.number) === opportunityId,
    );

    if (!match) {
      return {
        opportunity: null,
        source: "legacy",
        error: `No opportunity found with ID: ${opportunityId}`,
      };
    }

    // Ensure the id is set
    if (!match.opportunityId) {
      match.opportunityId = opportunityId;
    }

    return {
      opportunity: normalizeV1Detail(match),
      source: "legacy",
    };
  } catch (legacyError) {
    throw legacyError instanceof AxiosError
      ? buildApiError(legacyError)
      : legacyError;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildSearchResult(
  results: OpportunitySummary[],
  total: number | null,
  page: number,
  limit: number,
  source: "v1" | "legacy",
): FormattedSearchResult {
  const effectiveTotal = total ?? results.length;
  const hasMore = page * limit < effectiveTotal;
  const nextPage = hasMore ? page + 1 : null;

  let truncated = false;
  let finalResults = results;

  // Check if the serialized response exceeds the character limit
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
    total: effectiveTotal,
    count: finalResults.length,
    page,
    limit,
    has_more: hasMore,
    next_page: nextPage,
    results: finalResults,
    truncated,
    source,
  };
}

function buildApiError(error: AxiosError): Error {
  const status = error.response?.status;

  if (status === 403) {
    return new Error(
      "Grants.gov API returned 403 Forbidden. Your API key may be invalid. " +
        "Verify your GRANTS_GOV_API_KEY environment variable, or remove it " +
        "to use the public (lower rate limit) access.",
    );
  }

  if (status === 429) {
    return new Error(
      "Grants.gov API rate limit exceeded after retries. " +
        "Try again shortly or set GRANTS_GOV_API_KEY for higher rate limits.",
    );
  }

  if (status === 400) {
    const errorBody = error.response?.data;
    const errorMsg =
      typeof errorBody === "object" && errorBody !== null
        ? JSON.stringify(errorBody)
        : String(errorBody ?? "Bad Request");
    return new Error(
      `Grants.gov API query error (400): ${errorMsg}. Check your query parameters.`,
    );
  }

  return new Error(
    `Grants.gov API request failed (HTTP ${status ?? "unknown"}): ${error.message}. ` +
      "Check your query parameters and try again.",
  );
}

/**
 * Truncate a JSON string representation to CHARACTER_LIMIT.
 * Appends a truncation notice if truncation occurs.
 */
export function truncateResponse(jsonStr: string): string {
  if (jsonStr.length <= CHARACTER_LIMIT) {
    return jsonStr;
  }
  return (
    jsonStr.slice(0, CHARACTER_LIMIT - 60) +
    "\n\n... [Truncated - response exceeded 25,000 character limit]"
  );
}

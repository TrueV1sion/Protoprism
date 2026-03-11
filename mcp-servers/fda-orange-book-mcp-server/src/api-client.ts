/**
 * FDA Orange Book API Client
 *
 * Shared HTTP client with rate limiting for all openFDA drugsfda requests.
 * Handles query construction, response parsing, and error formatting.
 */

import axios, { AxiosError } from "axios";
import {
  BASE_URL,
  USER_AGENT,
  RATE_LIMIT_MS,
  REQUEST_TIMEOUT_MS,
  CHARACTER_LIMIT,
  TE_CODE_DESCRIPTIONS,
  EXCLUSIVITY_CODE_DESCRIPTIONS,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface DrugProduct {
  product_number?: string;
  reference_drug?: string;
  brand_name?: string;
  active_ingredients?: Array<{
    name?: string;
    strength?: string;
  }>;
  reference_standard?: string;
  dosage_form?: string;
  route?: string;
  marketing_status?: string;
  te_code?: string;
}

export interface Submission {
  submission_type?: string;
  submission_number?: string;
  submission_status?: string;
  submission_status_date?: string;
  submission_class_code?: string;
  submission_class_code_description?: string;
}

export interface OpenFDAFields {
  application_number?: string[];
  brand_name?: string[];
  generic_name?: string[];
  manufacturer_name?: string[];
  product_ndc?: string[];
  substance_name?: string[];
  spl_id?: string[];
  spl_set_id?: string[];
  pharm_class_epc?: string[];
  route?: string[];
  nui?: string[];
  rxcui?: string[];
  unii?: string[];
}

export interface DrugsFDAResult {
  application_number?: string;
  sponsor_name?: string;
  openfda?: OpenFDAFields;
  products?: DrugProduct[];
  submissions?: Submission[];
}

interface OpenFDAResponse {
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
  results?: DrugsFDAResult[];
  error?: {
    code: string;
    message: string;
  };
}

export interface FormattedResult {
  total: number;
  count: number;
  limit: number;
  has_more: boolean;
  results: unknown[];
  truncated: boolean;
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

// ─── Query Helpers ───────────────────────────────────────────

/**
 * Wrap a value in double quotes for exact match in openFDA search syntax.
 */
export function quoteValue(value: string): string {
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Join multiple search clauses with +AND+.
 */
export function buildSearchQuery(clauses: string[]): string | undefined {
  const nonEmpty = clauses.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return undefined;
  return nonEmpty.join("+AND+");
}

// ─── Enrichment Helpers ─────────────────────────────────────

/**
 * Look up a human-readable description for a TE code.
 */
export function describeTECode(code: string): string {
  return TE_CODE_DESCRIPTIONS[code.toUpperCase()] ?? "Unknown TE code";
}

/**
 * Look up a human-readable description for an exclusivity code.
 */
export function describeExclusivityCode(code: string): string {
  return (
    EXCLUSIVITY_CODE_DESCRIPTIONS[code.toUpperCase()] ??
    "Unknown exclusivity code"
  );
}

// ─── Main Request Function ───────────────────────────────────

export interface SearchParams {
  search?: string;
  limit?: number;
  count?: string;
}

/**
 * Make a request to the openFDA drugsfda endpoint with rate limiting.
 */
export async function makeRequest(
  params: SearchParams,
): Promise<FormattedResult> {
  await enforceRateLimit();

  // Build URL manually to preserve openFDA query syntax (literal '+' chars)
  const queryParts: string[] = [];

  if (params.search) {
    queryParts.push(`search=${params.search}`);
  }

  if (params.count) {
    queryParts.push(`count=${encodeURIComponent(params.count)}`);
    if (params.limit) {
      queryParts.push(`limit=${params.limit}`);
    }
  } else {
    if (params.limit !== undefined) {
      queryParts.push(`limit=${params.limit}`);
    }
  }

  const fullUrl =
    queryParts.length > 0
      ? `${BASE_URL}?${queryParts.join("&")}`
      : BASE_URL;

  try {
    const response = await axios.get<OpenFDAResponse>(fullUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = response.data;

    if (data.error) {
      throw new Error(
        `openFDA API error (${data.error.code}): ${data.error.message}`,
      );
    }

    const results = data.results ?? [];
    const meta = data.meta?.results;

    const total = meta?.total ?? results.length;
    const limit = meta?.limit ?? params.limit ?? results.length;

    return formatResponse(results, { total, limit });
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const errorData = error.response?.data as OpenFDAResponse | undefined;

      if (status === 404) {
        return formatResponse([], {
          total: 0,
          limit: params.limit ?? 10,
        });
      }

      if (status === 429) {
        throw new Error(
          "openFDA API rate limit exceeded. The server enforces 200ms between " +
            "requests, but the FDA API may impose additional limits. Try again shortly.",
        );
      }

      if (status === 400 && errorData?.error) {
        throw new Error(
          `openFDA query error: ${errorData.error.message}. ` +
            "Verify field names and search syntax. " +
            "See https://open.fda.gov/apis/drug/drugsfda/ for field docs.",
        );
      }

      throw new Error(
        `openFDA API request failed (HTTP ${status ?? "unknown"}): ${error.message}`,
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Unexpected error during openFDA API request: ${String(error)}`,
    );
  }
}

// ─── Response Formatting ─────────────────────────────────────

function formatResponse(
  results: unknown[],
  pagination: { total: number; limit: number },
): FormattedResult {
  const { total, limit } = pagination;
  const hasMore = results.length < total;

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
    total,
    count: finalResults.length,
    limit,
    has_more: hasMore,
    results: finalResults,
    truncated,
  };
}

// ─── Result Extractors ───────────────────────────────────────

/**
 * Extract a summary of a drug application from the raw API result.
 */
export function extractDrugSummary(result: DrugsFDAResult): Record<string, unknown> {
  const openfda = result.openfda ?? {};
  const products = result.products ?? [];

  // Find the most recent approval date from submissions
  const approvalDate = findApprovalDate(result.submissions);

  return {
    application_number: result.application_number ?? "N/A",
    brand_name: openfda.brand_name?.join(", ") ?? "N/A",
    generic_name: openfda.generic_name?.join(", ") ?? "N/A",
    sponsor_name: result.sponsor_name ?? "N/A",
    active_ingredients: extractActiveIngredients(products),
    dosage_forms: [...new Set(products.map((p) => p.dosage_form).filter(Boolean))],
    routes: [...new Set(products.map((p) => p.route).filter(Boolean))],
    marketing_statuses: [
      ...new Set(products.map((p) => p.marketing_status).filter(Boolean)),
    ],
    approval_date: approvalDate ?? "N/A",
    product_count: products.length,
  };
}

/**
 * Extract patent information from drug products.
 */
export function extractPatentInfo(result: DrugsFDAResult): Record<string, unknown> {
  const openfda = result.openfda ?? {};
  const products = result.products ?? [];

  const patents: Array<Record<string, unknown>> = [];
  for (const product of products) {
    // The openFDA drugsfda endpoint may have patent data in products
    // but the structure varies. We extract what is available.
    const patentRecord: Record<string, unknown> = {
      product_number: product.product_number ?? "N/A",
      dosage_form: product.dosage_form ?? "N/A",
      route: product.route ?? "N/A",
      te_code: product.te_code ?? "N/A",
      te_code_description: product.te_code
        ? describeTECode(product.te_code)
        : "N/A",
      marketing_status: product.marketing_status ?? "N/A",
    };
    patents.push(patentRecord);
  }

  return {
    application_number: result.application_number ?? "N/A",
    brand_name: openfda.brand_name?.join(", ") ?? "N/A",
    generic_name: openfda.generic_name?.join(", ") ?? "N/A",
    sponsor_name: result.sponsor_name ?? "N/A",
    products: patents,
  };
}

/**
 * Extract therapeutic equivalence data from drug products.
 */
export function extractTEData(result: DrugsFDAResult): Record<string, unknown> {
  const openfda = result.openfda ?? {};
  const products = result.products ?? [];

  const teProducts = products.map((p) => ({
    product_number: p.product_number ?? "N/A",
    dosage_form: p.dosage_form ?? "N/A",
    route: p.route ?? "N/A",
    strength: extractActiveIngredients([p]),
    te_code: p.te_code ?? "N/A",
    te_code_description: p.te_code ? describeTECode(p.te_code) : "N/A",
    reference_drug: p.reference_drug ?? "N/A",
    marketing_status: p.marketing_status ?? "N/A",
  }));

  return {
    application_number: result.application_number ?? "N/A",
    brand_name: openfda.brand_name?.join(", ") ?? "N/A",
    generic_name: openfda.generic_name?.join(", ") ?? "N/A",
    sponsor_name: result.sponsor_name ?? "N/A",
    products: teProducts,
  };
}

/**
 * Extract exclusivity data from submissions.
 */
export function extractExclusivityData(
  result: DrugsFDAResult,
): Record<string, unknown> {
  const openfda = result.openfda ?? {};
  const submissions = result.submissions ?? [];

  const exclusivityEntries: Array<Record<string, unknown>> = [];
  for (const sub of submissions) {
    exclusivityEntries.push({
      submission_type: sub.submission_type ?? "N/A",
      submission_number: sub.submission_number ?? "N/A",
      submission_status: sub.submission_status ?? "N/A",
      submission_status_date: sub.submission_status_date ?? "N/A",
      submission_class_code: sub.submission_class_code ?? "N/A",
      submission_class_description:
        sub.submission_class_code_description ?? "N/A",
    });
  }

  return {
    application_number: result.application_number ?? "N/A",
    brand_name: openfda.brand_name?.join(", ") ?? "N/A",
    generic_name: openfda.generic_name?.join(", ") ?? "N/A",
    sponsor_name: result.sponsor_name ?? "N/A",
    marketing_statuses: [
      ...new Set(
        (result.products ?? []).map((p) => p.marketing_status).filter(Boolean),
      ),
    ],
    submissions: exclusivityEntries,
  };
}

// ─── Internal Helpers ────────────────────────────────────────

function extractActiveIngredients(
  products: DrugProduct[],
): string[] {
  const ingredients = new Set<string>();
  for (const product of products) {
    for (const ai of product.active_ingredients ?? []) {
      const name = ai.name ?? "";
      const strength = ai.strength ?? "";
      if (name) {
        ingredients.add(strength ? `${name} (${strength})` : name);
      }
    }
  }
  return [...ingredients];
}

function findApprovalDate(
  submissions?: Submission[],
): string | null {
  if (!submissions || submissions.length === 0) return null;

  // Look for the "AP" (approval) submission with the earliest date
  const approvals = submissions.filter(
    (s) => s.submission_status === "AP" && s.submission_status_date,
  );

  if (approvals.length === 0) return null;

  // Sort by date ascending and return the first (original approval)
  approvals.sort((a, b) =>
    (a.submission_status_date ?? "").localeCompare(
      b.submission_status_date ?? "",
    ),
  );

  return approvals[0].submission_status_date ?? null;
}

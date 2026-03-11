/**
 * AHRQ HCUP API Client
 *
 * Provides fuzzy search over embedded HCUP reference data, rate-limited
 * HTTP client for potential future HCUPnet queries, and data lookup
 * utilities for the MCP server tools.
 */

import axios, { type AxiosError } from "axios";
import {
  USER_AGENT,
  RATE_LIMIT_MS,
  CHARACTER_LIMIT,
  INPATIENT_DIAGNOSES,
  ED_DIAGNOSES,
  PROCEDURES,
  COST_TRENDS,
  DATA_SOURCE_INFO,
  type DiagnosisStats,
  type ProcedureStats,
  type CostTrendSeries,
  type TrendCategory,
  type TrendMetric,
} from "./constants.js";

// ─── Rate Limiter ───────────────────────────────────────────

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ─── HTTP Client ────────────────────────────────────────────

const httpClient = axios.create({
  timeout: 15_000,
  headers: {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
});

/**
 * Make a rate-limited HTTP GET request. Reserved for future use
 * if HCUPnet scraping is implemented.
 */
export async function fetchUrl(url: string): Promise<string> {
  await enforceRateLimit();
  try {
    const response = await httpClient.get<string>(url);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      throw new Error(
        `HTTP ${axiosError.response.status} fetching ${url}: ${axiosError.response.statusText}`,
      );
    }
    throw new Error(
      `Network error fetching ${url}: ${axiosError.message ?? "Unknown error"}`,
    );
  }
}

// ─── Fuzzy Search ───────────────────────────────────────────

/**
 * Compute a simple fuzzy match score between a query and a target string.
 * Returns a score from 0 (no match) to 1 (exact match).
 * Handles substring matching, word boundary matching, and token matching.
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  // Exact match
  if (q === t) return 1.0;

  // Target contains full query as substring
  if (t.includes(q)) return 0.9;

  // Query contains full target as substring
  if (q.includes(t)) return 0.8;

  // Token-based matching
  const queryTokens = q.split(/\s+/);
  const targetTokens = t.split(/[\s/,()-]+/);

  let matchedTokens = 0;
  for (const qt of queryTokens) {
    if (qt.length < 2) continue;
    const found = targetTokens.some(
      (tt) => tt.includes(qt) || qt.includes(tt),
    );
    if (found) matchedTokens++;
  }

  if (queryTokens.length > 0) {
    const tokenScore = matchedTokens / queryTokens.length;
    if (tokenScore > 0) return 0.3 + tokenScore * 0.5;
  }

  return 0;
}

/**
 * Score a diagnosis or procedure record against a query string.
 * Checks the name, aliases, ICD-10 code, and description.
 */
function scoreRecord(
  query: string,
  record: { name: string; aliases: string[]; description: string } & (
    | { icd10_category: string }
    | { icd10_pcs_category: string }
  ),
): number {
  const scores: number[] = [];

  // Name match (highest weight)
  scores.push(fuzzyScore(query, record.name) * 1.0);

  // Alias matches
  for (const alias of record.aliases) {
    scores.push(fuzzyScore(query, alias) * 0.95);
  }

  // ICD code match
  const icdCode =
    "icd10_category" in record
      ? record.icd10_category
      : record.icd10_pcs_category;
  scores.push(fuzzyScore(query, icdCode) * 0.85);

  // Description match (lower weight)
  scores.push(fuzzyScore(query, record.description) * 0.5);

  return Math.max(...scores);
}

// ─── Data Lookup Functions ──────────────────────────────────

export interface SearchResult<T> {
  score: number;
  data: T;
}

/**
 * Search inpatient diagnoses by query string.
 */
export function searchInpatientDiagnoses(
  query: string,
  limit: number = 10,
): SearchResult<DiagnosisStats>[] {
  return INPATIENT_DIAGNOSES.map((d) => ({
    score: scoreRecord(query, d),
    data: d,
  }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Search ED diagnoses by query string.
 */
export function searchEDDiagnoses(
  query: string,
  limit: number = 10,
): SearchResult<DiagnosisStats>[] {
  return ED_DIAGNOSES.map((d) => ({
    score: scoreRecord(query, d),
    data: d,
  }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Search procedures by query string.
 */
export function searchProcedures(
  query: string,
  limit: number = 10,
): SearchResult<ProcedureStats>[] {
  return PROCEDURES.map((p) => ({
    score: scoreRecord(query, p),
    data: p,
  }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Search all data types (inpatient diagnoses, ED diagnoses, procedures)
 * and return combined results.
 */
export function searchAll(
  query: string,
  dataType: "inpatient" | "emergency" | "pediatric" | "all" = "all",
  limit: number = 10,
): Array<
  SearchResult<DiagnosisStats | ProcedureStats> & {
    result_type: "inpatient_diagnosis" | "ed_diagnosis" | "procedure";
  }
> {
  const results: Array<
    SearchResult<DiagnosisStats | ProcedureStats> & {
      result_type: "inpatient_diagnosis" | "ed_diagnosis" | "procedure";
    }
  > = [];

  if (dataType === "inpatient" || dataType === "all" || dataType === "pediatric") {
    const inpatient = searchInpatientDiagnoses(query, limit);
    results.push(
      ...inpatient.map((r) => ({
        ...r,
        result_type: "inpatient_diagnosis" as const,
      })),
    );
  }

  if (dataType === "emergency" || dataType === "all") {
    const ed = searchEDDiagnoses(query, limit);
    results.push(
      ...ed.map((r) => ({ ...r, result_type: "ed_diagnosis" as const })),
    );
  }

  if (dataType === "inpatient" || dataType === "all") {
    const procedures = searchProcedures(query, limit);
    results.push(
      ...procedures.map((r) => ({ ...r, result_type: "procedure" as const })),
    );
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get a specific diagnosis by exact name match (case-insensitive).
 * Searches both inpatient and ED diagnoses.
 */
export function getDiagnosisByName(
  name: string,
): { data: DiagnosisStats; setting: "inpatient" | "emergency" } | null {
  const lower = name.toLowerCase().trim();

  // Check inpatient first
  for (const d of INPATIENT_DIAGNOSES) {
    if (
      d.name.toLowerCase() === lower ||
      d.aliases.some((a) => a.toLowerCase() === lower) ||
      d.icd10_category.toLowerCase() === lower
    ) {
      return { data: d, setting: "inpatient" };
    }
  }

  // Then check ED
  for (const d of ED_DIAGNOSES) {
    if (
      d.name.toLowerCase() === lower ||
      d.aliases.some((a) => a.toLowerCase() === lower) ||
      d.icd10_category.toLowerCase() === lower
    ) {
      return { data: d, setting: "emergency" };
    }
  }

  // Fuzzy fallback - find best match
  const allDiagnoses = [
    ...INPATIENT_DIAGNOSES.map((d) => ({ data: d, setting: "inpatient" as const })),
    ...ED_DIAGNOSES.map((d) => ({ data: d, setting: "emergency" as const })),
  ];

  let bestMatch: { data: DiagnosisStats; setting: "inpatient" | "emergency" } | null =
    null;
  let bestScore = 0;

  for (const entry of allDiagnoses) {
    const score = scoreRecord(name, entry.data);
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

/**
 * Get a specific procedure by exact name match (case-insensitive).
 */
export function getProcedureByName(name: string): ProcedureStats | null {
  const lower = name.toLowerCase().trim();

  for (const p of PROCEDURES) {
    if (
      p.name.toLowerCase() === lower ||
      p.aliases.some((a) => a.toLowerCase() === lower) ||
      p.icd10_pcs_category.toLowerCase() === lower
    ) {
      return p;
    }
  }

  // Fuzzy fallback
  let bestMatch: ProcedureStats | null = null;
  let bestScore = 0;

  for (const p of PROCEDURES) {
    const score = scoreRecord(name, p);
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = p;
    }
  }

  return bestMatch;
}

/**
 * Get cost trend data for a given category and metric.
 */
export function getCostTrends(
  category: TrendCategory,
  metric: TrendMetric,
): CostTrendSeries | null {
  const categoryData = COST_TRENDS[category];
  if (!categoryData) return null;
  return categoryData[metric] ?? null;
}

/**
 * Get top conditions ranked by a specific metric.
 */
export function getTopConditions(
  rankedBy: "hospitalizations" | "aggregate_cost" | "mean_cost" | "mortality" | "los",
  setting: "inpatient" | "emergency",
  limit: number = 20,
): DiagnosisStats[] {
  const data = setting === "inpatient" ? INPATIENT_DIAGNOSES : ED_DIAGNOSES;

  const sorted = [...data].sort((a, b) => {
    switch (rankedBy) {
      case "hospitalizations":
        return b.annual_discharges - a.annual_discharges;
      case "aggregate_cost":
        return b.aggregate_cost - a.aggregate_cost;
      case "mean_cost":
        return b.mean_cost - a.mean_cost;
      case "mortality":
        return (b.mortality_rate ?? 0) - (a.mortality_rate ?? 0);
      case "los":
        return (b.mean_los ?? 0) - (a.mean_los ?? 0);
      default:
        return b.annual_discharges - a.annual_discharges;
    }
  });

  return sorted.slice(0, limit);
}

// ─── Response Utilities ─────────────────────────────────────

/**
 * Truncate response text to fit within character limit.
 */
export function truncateResponse(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, truncated: false };
  }
  const truncatedText =
    text.slice(0, CHARACTER_LIMIT) +
    "\n\n[Response truncated. Use more specific queries or lower limits to get complete results.]";
  return { text: truncatedText, truncated: true };
}

/**
 * Get the data source information for citation purposes.
 */
export function getDataSourceInfo() {
  return DATA_SOURCE_INFO;
}

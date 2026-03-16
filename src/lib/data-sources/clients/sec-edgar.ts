// src/lib/data-sources/clients/sec-edgar.ts
/**
 * SEC EDGAR API Client (Layer 1)
 *
 * Internal HTTP client for the SEC EDGAR APIs. Handles rate limiting,
 * User-Agent header (required by SEC), and response parsing.
 *
 * Ported from mcp-servers/sec-edgar-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 * - No class — module-level function + exported client object
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";
const EDGAR_SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const EDGAR_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const EDGAR_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";

// 10 req/s per SEC guidance
const clientLimiter = new TokenBucketLimiter(10);

const USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ?? "Protoprism/1.0 (research@protoprism.ai)";

// ─── Response Types (internal) ────────────────────────────────

interface EdgarSearchResponse {
  hits?: {
    total?: { value?: number };
    hits?: Array<{
      _id?: string;
      _source: {
        entity_name?: string;
        entity_id?: string | number;
        display_names?: string[];
        ciks?: (string | number)[];
        form_type?: string;
        file_type?: string;
        file_date?: string;
        period_of_report?: string;
        file_num?: string;
        adsh?: string;
        file_name?: string;
        file_description?: string;
      };
    }>;
  };
}

interface EdgarSubmissionsResponse {
  name?: string;
  cik?: string;
  filings?: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

interface EdgarCompanyFactsResponse {
  entityName?: string;
  facts?: Record<string, Record<string, EdgarFactEntry>>;
}

interface EdgarFactEntry {
  label?: string;
  description?: string;
  units?: Record<string, EdgarFactDataPoint[]>;
}

interface EdgarFactDataPoint {
  val: number | string;
  end?: string;
  filed?: string;
  form?: string;
  fy?: number;
  fp?: string;
  accn?: string;
}

interface EdgarCompanyTickerEntry {
  cik_str?: string | number;
  ticker?: string;
  title?: string;
}

// ─── Result Types ────────────────────────────────────────────

export interface SearchFilingResult {
  company: string;
  cik: string;
  form_type: string;
  filed_date: string;
  accession_number: string;
  file_url: string;
  description: string;
}

export interface CompanyFiling {
  form_type: string;
  filing_date: string;
  accession_number: string;
  primary_document: string;
  description: string;
  file_url: string;
}

export interface FactDataPoint {
  value: number | string;
  end_date: string;
  filed_date: string;
  form: string;
  fiscal_year: number;
  fiscal_period: string;
  accession_number: string;
}

export interface CompanyFact {
  namespace: string;
  fact_name: string;
  label: string;
  description: string;
  units: Record<string, FactDataPoint[]>;
}

export interface CompanySearchResult {
  company_name: string;
  cik: string;
  ticker: string;
}

export interface SecEdgarFilingsResult {
  results: SearchFilingResult[];
  total: number;
  hasMore: boolean;
}

export interface SecEdgarCompanyFilingsResult {
  company_name: string;
  cik: string;
  filings: CompanyFiling[];
  total: number;
  hasMore: boolean;
}

export interface SecEdgarFactsResult {
  company_name: string;
  cik: string;
  facts: CompanyFact[];
  total_facts: number;
  hasMore: boolean;
}

export interface SecEdgarCompanySearchResult {
  results: CompanySearchResult[];
  total: number;
  hasMore: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function buildFilingUrl(cik: string, accessionClean: string, fileName?: string): string {
  const cikTrimmed = cik.replace(/^0+/, "");
  if (fileName) {
    return `${EDGAR_ARCHIVES_URL}/${cikTrimmed}/${accessionClean}/${fileName}`;
  }
  return `${EDGAR_ARCHIVES_URL}/${cikTrimmed}/${accessionClean}/`;
}

function makeVintage(source: string = "SEC EDGAR"): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source,
  };
}

function defaultHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest<T>(
  url: string,
  opts: { notFoundValue: T; sourceName?: string },
): Promise<ApiResponse<T>> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const response = await fetch(url, {
      headers: defaultHeaders(),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return {
        data: opts.notFoundValue,
        status: 404,
        vintage: makeVintage(opts.sourceName),
      };
    }

    if (response.status === 429) {
      throw new Error("SEC EDGAR rate limit exceeded. Try again shortly.");
    }

    if (!response.ok) {
      throw new Error(
        `SEC EDGAR API error (HTTP ${response.status}): ${response.statusText} — ${url}`,
      );
    }

    const data = (await response.json()) as T;
    return {
      data,
      status: response.status,
      vintage: makeVintage(opts.sourceName),
    };
  } finally {
    globalRateLimiter.release();
  }
}

// ─── Public API ──────────────────────────────────────────────

export const secEdgarClient = {
  /**
   * Full-text search across SEC filings (EFTS).
   */
  async searchFilings(params: {
    query: string;
    forms?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<ApiResponse<SecEdgarFilingsResult>> {
    const queryParams = new URLSearchParams({ q: params.query });
    if (params.forms?.length) queryParams.set("forms", params.forms.join(","));
    if (params.dateFrom || params.dateTo) {
      queryParams.set("dateRange", "custom");
      if (params.dateFrom) queryParams.set("startdt", params.dateFrom);
      if (params.dateTo) queryParams.set("enddt", params.dateTo);
    }

    const url = `${EDGAR_SEARCH_URL}?${queryParams.toString()}`;
    const limit = params.limit ?? 10;

    const raw = await makeRequest<EdgarSearchResponse>(url, {
      notFoundValue: { hits: { total: { value: 0 }, hits: [] } },
      sourceName: "SEC EDGAR EFTS",
    });

    const hits = raw.data.hits?.hits ?? [];
    const total = raw.data.hits?.total?.value ?? 0;

    const results: SearchFilingResult[] = hits.slice(0, limit).map((hit) => {
      const src = hit._source;
      const cik = padCik(src.entity_id?.toString() ?? src.ciks?.[0]?.toString() ?? "");
      const accessionRaw = src.adsh ?? hit._id ?? "";
      const accessionClean = accessionRaw.replace(/-/g, "");
      return {
        company: src.entity_name ?? src.display_names?.[0] ?? "Unknown",
        cik,
        form_type: src.form_type ?? src.file_type ?? "",
        filed_date: src.file_date ?? src.period_of_report ?? "",
        accession_number: accessionRaw,
        file_url: buildFilingUrl(cik, accessionClean, src.file_name),
        description: src.file_description ?? "",
      };
    });

    return {
      data: { results, total, hasMore: results.length < total },
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * Get filings for a company by CIK from the submissions endpoint.
   */
  async getCompanyFilings(params: {
    cik: string;
    forms?: string[];
    limit?: number;
  }): Promise<ApiResponse<SecEdgarCompanyFilingsResult>> {
    const cik = padCik(params.cik);
    const url = `${EDGAR_SUBMISSIONS_URL}/CIK${cik}.json`;
    const limit = params.limit ?? 20;

    const raw = await makeRequest<EdgarSubmissionsResponse>(url, {
      notFoundValue: { name: "Unknown", filings: undefined },
      sourceName: "SEC EDGAR Submissions",
    });

    const data = raw.data;
    const companyName = data.name ?? "Unknown";
    const recent = data.filings?.recent;

    if (!recent) {
      return {
        data: { company_name: companyName, cik, filings: [], total: 0, hasMore: false },
        status: raw.status,
        vintage: raw.vintage,
      };
    }

    const indices = Array.from({ length: recent.form?.length ?? 0 }, (_, i) => i);
    const filtered = params.forms
      ? indices.filter((i) => params.forms!.includes(recent.form[i]))
      : indices;

    const filings: CompanyFiling[] = filtered.slice(0, limit).map((i) => {
      const accessionNumber = recent.accessionNumber[i] ?? "";
      const accessionClean = accessionNumber.replace(/-/g, "");
      const primaryDoc = recent.primaryDocument?.[i] ?? "";
      return {
        form_type: recent.form[i] ?? "",
        filing_date: recent.filingDate[i] ?? "",
        accession_number: accessionNumber,
        primary_document: primaryDoc,
        description: recent.primaryDocDescription?.[i] ?? "",
        file_url: primaryDoc
          ? `${EDGAR_ARCHIVES_URL}/${cik.replace(/^0+/, "")}/${accessionClean}/${primaryDoc}`
          : "",
      };
    });

    return {
      data: {
        company_name: companyName,
        cik,
        filings,
        total: filtered.length,
        hasMore: filtered.length > limit,
      },
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * Get XBRL financial facts for a company by CIK.
   */
  async getCompanyFacts(params: {
    cik: string;
    factNamespace?: string;
    factName?: string;
  }): Promise<ApiResponse<SecEdgarFactsResult>> {
    const cik = padCik(params.cik);
    const url = `${EDGAR_COMPANY_FACTS_URL}/CIK${cik}.json`;

    const raw = await makeRequest<EdgarCompanyFactsResponse>(url, {
      notFoundValue: { entityName: "Unknown", facts: {} },
      sourceName: "SEC EDGAR XBRL",
    });

    const data = raw.data;
    const companyName = data.entityName ?? "Unknown";
    const factsMap = data.facts ?? {};
    const results: CompanyFact[] = [];

    for (const [namespace, facts] of Object.entries(factsMap)) {
      if (params.factNamespace && namespace !== params.factNamespace) continue;
      for (const [factName, factData] of Object.entries(facts as Record<string, EdgarFactEntry>)) {
        if (params.factName && !factName.toLowerCase().includes(params.factName.toLowerCase())) {
          continue;
        }
        const units: Record<string, FactDataPoint[]> = {};
        for (const [unit, dataPoints] of Object.entries(factData.units ?? {})) {
          units[unit] = (dataPoints as EdgarFactDataPoint[]).map((dp) => ({
            value: dp.val,
            end_date: dp.end ?? "",
            filed_date: dp.filed ?? "",
            form: dp.form ?? "",
            fiscal_year: dp.fy ?? 0,
            fiscal_period: dp.fp ?? "",
            accession_number: dp.accn ?? "",
          }));
        }
        results.push({
          namespace,
          fact_name: factName,
          label: factData.label ?? factName,
          description: factData.description ?? "",
          units,
        });
      }
    }

    return {
      data: {
        company_name: companyName,
        cik,
        facts: results,
        total_facts: results.length,
        hasMore: false,
      },
      status: raw.status,
      vintage: raw.vintage,
    };
  },

  /**
   * Search for companies by name or ticker from the company tickers file.
   */
  async searchCompany(params: {
    query: string;
  }): Promise<ApiResponse<SecEdgarCompanySearchResult>> {
    const url = EDGAR_COMPANY_TICKERS_URL;

    const raw = await makeRequest<Record<string, EdgarCompanyTickerEntry>>(url, {
      notFoundValue: {},
      sourceName: "SEC EDGAR Tickers",
    });

    const queryLower = params.query.toLowerCase();
    const results: CompanySearchResult[] = [];

    for (const entry of Object.values(raw.data)) {
      const nameMatch = (entry.title ?? "").toLowerCase().includes(queryLower);
      const tickerMatch = (entry.ticker ?? "").toLowerCase() === queryLower;
      if (nameMatch || tickerMatch) {
        results.push({
          company_name: entry.title ?? "",
          cik: padCik((entry.cik_str ?? "").toString()),
          ticker: entry.ticker ?? "",
        });
      }
      if (results.length >= 25) break;
    }

    results.sort((a, b) => {
      const aExact = a.ticker.toLowerCase() === queryLower ? 0 : 1;
      const bExact = b.ticker.toLowerCase() === queryLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.company_name.localeCompare(b.company_name);
    });

    return {
      data: { results, total: results.length, hasMore: false },
      status: raw.status,
      vintage: raw.vintage,
    };
  },
};

/**
 * SEC EDGAR API Client
 *
 * Handles all HTTP communication with the SEC EDGAR APIs including
 * rate limiting, User-Agent headers, and response parsing.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import {
  EDGAR_SEARCH_URL,
  EDGAR_COMPANY_FACTS_URL,
  EDGAR_SUBMISSIONS_URL,
  EDGAR_COMPANY_TICKERS_URL,
  EDGAR_ARCHIVES_URL,
  DEFAULT_USER_AGENT,
  REQUEST_DELAY_MS,
  CHARACTER_LIMIT,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface SearchFilingsParams {
  query: string;
  forms?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}

export interface SearchFilingResult {
  company: string;
  cik: string;
  form_type: string;
  filed_date: string;
  accession_number: string;
  file_url: string;
  description: string;
}

export interface CompanyFilingsParams {
  cik: string;
  forms?: string[];
  limit: number;
}

export interface CompanyFiling {
  form_type: string;
  filing_date: string;
  accession_number: string;
  primary_document: string;
  description: string;
  file_url: string;
}

export interface CompanyFactsParams {
  cik: string;
  factNamespace?: string;
  factName?: string;
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

// ─── API Client ──────────────────────────────────────────────

export class EdgarApiClient {
  private httpClient: AxiosInstance;
  private lastRequestTime = 0;

  constructor() {
    const userAgent =
      process.env.SEC_EDGAR_USER_AGENT || DEFAULT_USER_AGENT;

    this.httpClient = axios.create({
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Enforce rate limiting by delaying between requests.
   * SEC allows 10 requests/second; we space at ~110ms.
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, REQUEST_DELAY_MS - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make an HTTP GET request with rate limiting and retry on 429.
   */
  private async get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
    await this.rateLimit();

    try {
      const response = await this.httpClient.get<T>(url, { params });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          // Rate limited — wait 2 seconds and retry once
          console.error("[EdgarApiClient] Rate limited (429), retrying in 2s...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await this.rateLimit();
          const retryResponse = await this.httpClient.get<T>(url, { params });
          return retryResponse.data;
        }
        throw new Error(
          `SEC EDGAR API error: ${error.response?.status} ${error.response?.statusText} - ${url}`,
        );
      }
      throw error;
    }
  }

  /**
   * Make an HTTP GET request that returns plain text (for filing content).
   */
  private async getText(url: string): Promise<string> {
    await this.rateLimit();

    try {
      const response = await this.httpClient.get<string>(url, {
        headers: { Accept: "text/html, text/plain, application/xhtml+xml" },
        responseType: "text",
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          console.error("[EdgarApiClient] Rate limited (429), retrying in 2s...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await this.rateLimit();
          const retryResponse = await this.httpClient.get<string>(url, {
            headers: { Accept: "text/html, text/plain, application/xhtml+xml" },
            responseType: "text",
          });
          return retryResponse.data;
        }
        throw new Error(
          `SEC EDGAR API error: ${error.response?.status} ${error.response?.statusText} - ${url}`,
        );
      }
      throw error;
    }
  }

  // ─── Search Filings ──────────────────────────────────────

  async searchFilings(params: SearchFilingsParams): Promise<{
    results: SearchFilingResult[];
    total: number;
    query: string;
  }> {
    const queryParams: Record<string, string | number | undefined> = {
      q: params.query,
    };

    if (params.forms && params.forms.length > 0) {
      queryParams.forms = params.forms.join(",");
    }

    if (params.dateFrom || params.dateTo) {
      queryParams.dateRange = "custom";
      if (params.dateFrom) queryParams.startdt = params.dateFrom;
      if (params.dateTo) queryParams.enddt = params.dateTo;
    }

    const data = await this.get<EdgarSearchResponse>(EDGAR_SEARCH_URL, queryParams);

    const hits = data.hits?.hits ?? [];
    const total = data.hits?.total?.value ?? 0;

    const results: SearchFilingResult[] = hits
      .slice(0, params.limit)
      .map((hit) => {
        const src = hit._source;
        const cik = padCik(src.entity_id?.toString() ?? src.ciks?.[0]?.toString() ?? "");
        const accessionRaw = src.file_num ?? src.adsh ?? hit._id ?? "";
        const accession = accessionRaw.replace(/-/g, "");

        return {
          company: src.entity_name ?? src.display_names?.[0] ?? "Unknown",
          cik,
          form_type: src.form_type ?? src.file_type ?? "",
          filed_date: src.file_date ?? src.period_of_report ?? "",
          accession_number: src.adsh ?? hit._id ?? "",
          file_url: buildFilingUrl(cik, accession, src.file_name),
          description: src.file_description ?? "",
        };
      });

    return { results, total, query: params.query };
  }

  // ─── Company Filings ─────────────────────────────────────

  async getCompanyFilings(params: CompanyFilingsParams): Promise<{
    company_name: string;
    cik: string;
    filings: CompanyFiling[];
    total: number;
  }> {
    const cik = padCik(params.cik);
    const data = await this.get<EdgarSubmissionsResponse>(
      `${EDGAR_SUBMISSIONS_URL}/CIK${cik}.json`,
    );

    const companyName = data.name ?? "Unknown";
    const recent = data.filings?.recent;

    if (!recent) {
      return { company_name: companyName, cik, filings: [], total: 0 };
    }

    const indices = Array.from({ length: recent.form?.length ?? 0 }, (_, i) => i);

    // Filter by form type if specified
    const filtered = params.forms
      ? indices.filter((i) => params.forms!.includes(recent.form[i]))
      : indices;

    const filings: CompanyFiling[] = filtered.slice(0, params.limit).map((i) => {
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
      company_name: companyName,
      cik,
      filings,
      total: filtered.length,
    };
  }

  // ─── Company Facts (XBRL) ────────────────────────────────

  async getCompanyFacts(params: CompanyFactsParams): Promise<{
    company_name: string;
    cik: string;
    facts: CompanyFact[];
    total_facts: number;
  }> {
    const cik = padCik(params.cik);
    const data = await this.get<EdgarCompanyFactsResponse>(
      `${EDGAR_COMPANY_FACTS_URL}/CIK${cik}.json`,
    );

    const companyName = data.entityName ?? "Unknown";
    const factsMap = data.facts ?? {};

    const results: CompanyFact[] = [];

    for (const [namespace, facts] of Object.entries(factsMap)) {
      // Filter by namespace if specified
      if (params.factNamespace && namespace !== params.factNamespace) {
        continue;
      }

      for (const [factName, factData] of Object.entries(facts as Record<string, EdgarFactEntry>)) {
        // Filter by fact name if specified (case-insensitive partial match)
        if (
          params.factName &&
          !factName.toLowerCase().includes(params.factName.toLowerCase())
        ) {
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
      company_name: companyName,
      cik,
      facts: results,
      total_facts: results.length,
    };
  }

  // ─── Company Search ──────────────────────────────────────

  async searchCompany(query: string): Promise<{
    results: CompanySearchResult[];
    total: number;
  }> {
    const data = await this.get<Record<string, EdgarCompanyTickerEntry>>(
      EDGAR_COMPANY_TICKERS_URL,
    );

    const queryLower = query.toLowerCase();
    const results: CompanySearchResult[] = [];

    for (const entry of Object.values(data)) {
      const nameMatch = (entry.title ?? "").toLowerCase().includes(queryLower);
      const tickerMatch = (entry.ticker ?? "").toLowerCase() === queryLower;

      if (nameMatch || tickerMatch) {
        results.push({
          company_name: entry.title ?? "",
          cik: padCik((entry.cik_str ?? "").toString()),
          ticker: entry.ticker ?? "",
        });
      }

      // Cap results to avoid returning thousands
      if (results.length >= 25) break;
    }

    // Sort: exact ticker matches first, then by name
    results.sort((a, b) => {
      const aExact = a.ticker.toLowerCase() === queryLower ? 0 : 1;
      const bExact = b.ticker.toLowerCase() === queryLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.company_name.localeCompare(b.company_name);
    });

    return { results, total: results.length };
  }

  // ─── Filing Content ──────────────────────────────────────

  async getFilingContent(params: {
    accessionNumber: string;
    filingUrl?: string;
  }): Promise<{
    content: string;
    url: string;
    truncated: boolean;
    character_count: number;
  }> {
    let url = params.filingUrl;

    if (!url) {
      // Try to construct a URL from the accession number
      // First, get the filing index to find the primary document
      const accessionClean = params.accessionNumber.replace(/-/g, "");
      const accessionFormatted = params.accessionNumber.includes("-")
        ? params.accessionNumber
        : formatAccessionNumber(params.accessionNumber);

      url = `${EDGAR_ARCHIVES_URL}/${accessionClean.slice(0, 10)}/${accessionClean}/${accessionFormatted}-index.htm`;
    }

    const rawContent = await this.getText(url);

    // Strip HTML tags for cleaner text output
    const textContent = stripHtml(rawContent);
    const truncated = textContent.length > CHARACTER_LIMIT;
    const content = truncated
      ? textContent.slice(0, CHARACTER_LIMIT) + "\n\n[... content truncated at character limit ...]"
      : textContent;

    return {
      content,
      url,
      truncated,
      character_count: textContent.length,
    };
  }
}

// ─── Internal Helpers ────────────────────────────────────────

/** Pad a CIK number to 10 digits with leading zeros */
function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

/** Build a filing URL from CIK, accession number, and filename */
function buildFilingUrl(cik: string, accessionClean: string, fileName?: string): string {
  const cikTrimmed = cik.replace(/^0+/, "");
  if (fileName) {
    return `${EDGAR_ARCHIVES_URL}/${cikTrimmed}/${accessionClean}/${fileName}`;
  }
  return `${EDGAR_ARCHIVES_URL}/${cikTrimmed}/${accessionClean}/`;
}

/** Format a raw accession number (18 digits) into dash format */
function formatAccessionNumber(raw: string): string {
  const clean = raw.replace(/\D/g, "");
  if (clean.length === 18) {
    return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  }
  return raw;
}

/** Strip HTML tags and decode common entities for cleaner text */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── EDGAR API Response Types (internal) ─────────────────────

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

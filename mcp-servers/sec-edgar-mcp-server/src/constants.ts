/**
 * SEC EDGAR MCP Server Constants
 *
 * API endpoints, rate limits, and configuration for SEC EDGAR data access.
 */

// ─── API Endpoints ───────────────────────────────────────────

/** EDGAR full-text search (EFTS) endpoint */
export const EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";

/** XBRL company facts endpoint (financial data) */
export const EDGAR_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";

/** Company submissions/filings endpoint */
export const EDGAR_SUBMISSIONS_URL = "https://data.sec.gov/submissions";

/** EDGAR company search/tickers endpoint */
export const EDGAR_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

/** Base URL for EDGAR filing archives */
export const EDGAR_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";

// ─── Limits ──────────────────────────────────────────────────

/** Maximum characters to return for filing content */
export const CHARACTER_LIMIT = 25000;

/** Default number of results for search queries */
export const DEFAULT_SEARCH_LIMIT = 10;

/** Maximum number of results for search queries */
export const MAX_SEARCH_LIMIT = 50;

/** Default number of filings to return for company queries */
export const DEFAULT_FILINGS_LIMIT = 20;

/** SEC rate limit: maximum requests per second */
export const RATE_LIMIT_RPS = 10;

/** Delay between requests in ms to stay under rate limit */
export const REQUEST_DELAY_MS = 110;

// ─── User-Agent ──────────────────────────────────────────────

/** Default User-Agent header (SEC requires company name + email) */
export const DEFAULT_USER_AGENT = "Protoprism research@protoprism.ai";

// ─── Supported Form Types ────────────────────────────────────

export const SUPPORTED_FORM_TYPES = [
  "10-K",
  "10-Q",
  "8-K",
  "S-1",
  "DEF 14A",
  "13F",
] as const;

export type SupportedFormType = (typeof SUPPORTED_FORM_TYPES)[number];

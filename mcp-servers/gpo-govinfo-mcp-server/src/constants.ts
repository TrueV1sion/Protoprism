/**
 * GPO GovInfo API constants
 *
 * Base URL, collection codes, healthcare-relevant CFR titles/parts,
 * rate limits, and response constraints for the GovInfo REST API.
 */

// ── Base URL ────────────────────────────────────────────────

export const GOVINFO_BASE_URL = "https://api.govinfo.gov";

// ── Collection Codes ────────────────────────────────────────

/** GovInfo collections relevant to healthcare legislative/regulatory research */
export const COLLECTIONS = {
  /** Congressional Bills */
  BILLS: "BILLS",
  /** Code of Federal Regulations */
  CFR: "CFR",
  /** Congressional Record */
  CREC: "CREC",
  /** Federal Register */
  FR: "FR",
  /** Public and Private Laws */
  PLAW: "PLAW",
  /** Congressional Reports */
  CRPT: "CRPT",
  /** Congressional Hearings */
  CHRG: "CHRG",
  /** Statutes at Large */
  STATUTE: "STATUTE",
  /** House Documents */
  HDOC: "HDOC",
  /** Senate Documents */
  SDOC: "SDOC",
} as const;

/** All valid collection codes for search filtering */
export const VALID_COLLECTIONS = [
  "BILLS",
  "CFR",
  "CREC",
  "FR",
  "PLAW",
  "CRPT",
  "CHRG",
  "STATUTE",
  "HDOC",
  "SDOC",
] as const;

/** Bill types for congressional bill searches */
export const BILL_TYPES = ["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"] as const;

// ── Healthcare-Relevant CFR Titles ──────────────────────────

/**
 * CFR titles most relevant to healthcare policy and regulation.
 * These are commonly referenced by LEGISLATIVE-PIPELINE, REGULATORY-RADAR,
 * and ANALYST-STRATEGIC agent archetypes.
 */
export const HEALTHCARE_CFR_TITLES: Record<number, string> = {
  21: "Food and Drugs (FDA regulations, drug/device/food safety)",
  42: "Public Health and Welfare (CMS, Medicare, Medicaid, CDC, NIH, SAMHSA)",
  45: "Public Welfare (HHS administrative rules, HIPAA, human subjects research)",
  29: "Labor (ERISA, employer-sponsored health plans)",
  26: "Internal Revenue Code (ACA tax provisions, HSAs)",
  38: "Pensions, Bonuses, and Veterans' Relief (VA healthcare)",
  20: "Employees' Benefits (Social Security disability, SSI)",
};

// ── Rate Limits ─────────────────────────────────────────────

/** GovInfo allows 1,000 requests/hour with API key */
export const RATE_LIMIT_PER_HOUR = 1000;

/** Minimum interval between requests in ms (~3.6s = 1000/hour) */
export const MIN_REQUEST_INTERVAL_MS = 500;

/** Maximum retry attempts on transient errors */
export const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
export const BASE_BACKOFF_MS = 1000;

// ── Response Constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

/** Default number of results per page */
export const DEFAULT_PAGE_SIZE = 10;

/** Maximum page size the API supports */
export const MAX_PAGE_SIZE = 100;

/** Default offset for pagination */
export const DEFAULT_OFFSET = 0;

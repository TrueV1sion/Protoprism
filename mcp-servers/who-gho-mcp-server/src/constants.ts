/**
 * WHO Global Health Observatory (GHO) API constants
 *
 * Base URLs, curated indicator codes, healthcare categories,
 * rate limits, and response constraints for the GHO OData v4 API.
 */

// ─── Base URL ────────────────────────────────────────────────

export const GHO_BASE_URL = "https://ghoapi.azureedge.net/api/";

// ─── Rate limits ─────────────────────────────────────────────

/** Minimum interval between requests in ms (200ms = ~5/sec, respectful) */
export const MIN_REQUEST_INTERVAL_MS = 200;

/** Maximum number of retries on 429/5xx errors */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms */
export const BACKOFF_BASE_MS = 1000;

// ─── Response constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25_000;

/** Default number of results if not specified */
export const DEFAULT_LIMIT = 50;

/** Maximum results per request (OData page size) */
export const MAX_RESULTS_PER_REQUEST = 200;

// ─── Curated Indicator Codes ─────────────────────────────────

/**
 * Healthcare-relevant indicator codes organized by category.
 * These are the most commonly needed indicators for healthcare
 * research, policy analysis, and country comparisons.
 */
export const CURATED_INDICATORS = {
  "Health Expenditure": {
    GHED_CHE_pc_PPP_SHA2011: "Current health expenditure per capita (PPP int. $)",
    GHED_CHE_GDP_SHA2011: "Current health expenditure as % of GDP",
    GHED_OOPS_CHE_SHA2011: "Out-of-pocket expenditure as % of current health expenditure",
  },
  "Life Expectancy": {
    WHOSIS_000001: "Life expectancy at birth (both sexes)",
    WHOSIS_000002: "Healthy life expectancy (HALE) at birth (both sexes)",
    WHOSIS_000015: "Life expectancy at age 60 (both sexes)",
  },
  Mortality: {
    NCDMORT3070: "Probability of dying between age 30 and exact age 70 from any of cardiovascular disease, cancer, diabetes, or chronic respiratory disease",
    MDG_0000000001: "Under-five mortality rate (per 1000 live births)",
    MDG_0000000003: "Neonatal mortality rate (per 1000 live births)",
  },
  "Disease Burden": {
    DALY_EstTotal: "Disability-adjusted life years (DALYs), estimated total",
    YLL_EstTotal: "Years of life lost (YLL), estimated total",
  },
  "Health Workforce": {
    HWF_0001: "Medical doctors (per 10,000 population)",
    HWF_0002: "Nursing and midwifery personnel (per 10,000 population)",
    HWF_0006: "Dentists (per 10,000 population)",
  },
  "UHC & Coverage": {
    UHC_INDEX_REPORTED: "UHC service coverage index",
    WHS4_543: "DTP3 immunization coverage among 1-year-olds (%)",
    WHS8_110: "Births attended by skilled health personnel (%)",
  },
  "SDG Health Targets": {
    SDG_SH_ACS_UNHC: "UHC service coverage index (SDG 3.8.1)",
    SDG_SH_DYN_NCOM: "NCD mortality rate (SDG 3.4.1)",
  },
} as const;

/**
 * Flat lookup: indicator code -> { name, category }
 */
export interface IndicatorInfo {
  code: string;
  name: string;
  category: string;
}

export const CURATED_INDICATOR_LOOKUP: Record<string, IndicatorInfo> = {};

for (const [category, indicators] of Object.entries(CURATED_INDICATORS)) {
  for (const [code, name] of Object.entries(indicators)) {
    CURATED_INDICATOR_LOOKUP[code] = { code, name, category };
  }
}

/** All curated indicator codes as a flat array */
export const ALL_CURATED_CODES = Object.keys(CURATED_INDICATOR_LOOKUP);

/** Category names for discovery */
export const INDICATOR_CATEGORIES = Object.keys(CURATED_INDICATORS);

// ─── Country Profile Indicator Codes ─────────────────────────

/**
 * Indicators fetched for a country health profile.
 * Ordered for a logical narrative: demographics, expenditure,
 * workforce, coverage, mortality, disease burden.
 */
export const COUNTRY_PROFILE_INDICATORS = [
  "WHOSIS_000001",       // Life expectancy at birth
  "WHOSIS_000002",       // Healthy life expectancy (HALE)
  "GHED_CHE_pc_PPP_SHA2011", // Health expenditure per capita
  "GHED_CHE_GDP_SHA2011",    // Health expenditure % GDP
  "GHED_OOPS_CHE_SHA2011",   // Out-of-pocket %
  "HWF_0001",            // Physicians per 10k
  "HWF_0002",            // Nurses per 10k
  "UHC_INDEX_REPORTED",  // UHC coverage index
  "WHS4_543",            // DTP3 coverage
  "WHS8_110",            // Skilled birth attendance
  "MDG_0000000001",      // Under-5 mortality
  "MDG_0000000003",      // Neonatal mortality
  "NCDMORT3070",         // NCD mortality 30-70
] as const;

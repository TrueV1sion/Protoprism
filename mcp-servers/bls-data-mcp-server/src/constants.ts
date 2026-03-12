/**
 * BLS Public Data API Constants
 *
 * Base URL, rate limits, response constraints, and curated healthcare-related
 * series ID mappings for the Bureau of Labor Statistics API.
 */

// ─── Base URL ────────────────────────────────────────────────

export const BLS_BASE_URL = "https://api.bls.gov/publicAPI/v2";

export const BLS_TIMESERIES_ENDPOINT = "/timeseries/data/";

// ─── Rate Limits ─────────────────────────────────────────────

/** Daily request limit without an API key */
export const RATE_LIMIT_NO_KEY = 25;

/** Daily request limit with an API key */
export const RATE_LIMIT_WITH_KEY = 500;

/** Maximum series IDs per request */
export const MAX_SERIES_PER_REQUEST = 50;

/** Maximum year span per request (v2 with key) */
export const MAX_YEAR_SPAN = 20;

// ─── Response Constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

// ─── BLS Survey Prefixes ─────────────────────────────────────

export const BLS_SURVEYS = {
  CE: "Current Employment Statistics (CES)",
  CU: "Consumer Price Index - All Urban Consumers (CPI-U)",
  LA: "Local Area Unemployment Statistics (LAUS)",
  SM: "State and Metro Area Employment (SAE)",
  WM: "Occupational Employment and Wage Statistics (OEWS)",
  PC: "Producer Price Index (PPI)",
} as const;

export type BLSSurvey = keyof typeof BLS_SURVEYS;

// ─── Healthcare CPI Series ───────────────────────────────────

/**
 * Consumer Price Index series IDs for healthcare categories.
 * All series use CPI-U (All Urban Consumers, U.S. city average).
 */
export const HEALTHCARE_CPI_SERIES: Record<
  string,
  { seriesId: string; description: string }
> = {
  medical_care: {
    seriesId: "CUUR0000SAM",
    description: "Medical care (all items), CPI-U, US city average",
  },
  hospital: {
    seriesId: "CUUR0000SEMD01",
    description: "Hospital and related services, CPI-U, US city average",
  },
  prescription_drugs: {
    seriesId: "CUUR0000SEMF01",
    description: "Prescription drugs, CPI-U, US city average",
  },
  health_insurance: {
    seriesId: "CUUR0000SEME01",
    description: "Health insurance, CPI-U, US city average",
  },
  medical_supplies: {
    seriesId: "CUUR0000SEMF02",
    description:
      "Nonprescription drugs and medical supplies, CPI-U, US city average",
  },
  physician_services: {
    seriesId: "CUUR0000SEMC01",
    description: "Physicians' services, CPI-U, US city average",
  },
};

export type HealthcareCPICategory = keyof typeof HEALTHCARE_CPI_SERIES;

// ─── Healthcare Employment Series ────────────────────────────

/**
 * Current Employment Statistics (CES) series IDs for healthcare sectors.
 * These report seasonally adjusted all-employees counts (in thousands).
 */
export const HEALTHCARE_EMPLOYMENT_SERIES: Record<
  string,
  { seriesId: string; description: string }
> = {
  all_healthcare: {
    seriesId: "CES6562000001",
    description:
      "Health care, all employees (thousands), seasonally adjusted",
  },
  hospitals: {
    seriesId: "CES6562200001",
    description: "Hospitals, all employees (thousands), seasonally adjusted",
  },
  nursing_facilities: {
    seriesId: "CES6562300001",
    description:
      "Nursing and residential care facilities, all employees (thousands), seasonally adjusted",
  },
  ambulatory: {
    seriesId: "CES6562100001",
    description:
      "Ambulatory health care services, all employees (thousands), seasonally adjusted",
  },
  pharma_manufacturing: {
    seriesId: "CES3232540001",
    description:
      "Pharmaceutical and medicine manufacturing, all employees (thousands), seasonally adjusted",
  },
  home_health: {
    seriesId: "CES6562160001",
    description:
      "Home health care services, all employees (thousands), seasonally adjusted",
  },
};

export type HealthcareEmploymentSector =
  keyof typeof HEALTHCARE_EMPLOYMENT_SERIES;

// ─── Curated Healthcare Series Catalog ───────────────────────

/**
 * A comprehensive catalog of healthcare-related BLS series for keyword search.
 * Each entry has a seriesId, human-readable name, description, survey code,
 * and keywords for matching.
 */
export interface CatalogEntry {
  seriesId: string;
  name: string;
  description: string;
  survey: BLSSurvey;
  keywords: string[];
}

export const HEALTHCARE_SERIES_CATALOG: CatalogEntry[] = [
  // ── CPI Healthcare ──
  {
    seriesId: "CUUR0000SAM",
    name: "CPI Medical Care",
    description: "Consumer Price Index - Medical care, all items, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "medical",
      "care",
      "price",
      "index",
      "consumer",
      "inflation",
      "healthcare",
      "cost",
    ],
  },
  {
    seriesId: "CUUR0000SAM1",
    name: "CPI Medical Care Commodities",
    description:
      "CPI - Medical care commodities (drugs, equipment), US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "medical",
      "commodities",
      "drugs",
      "equipment",
      "supplies",
      "price",
      "inflation",
    ],
  },
  {
    seriesId: "CUUR0000SAM2",
    name: "CPI Medical Care Services",
    description: "CPI - Medical care services, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "medical",
      "services",
      "price",
      "inflation",
      "healthcare",
    ],
  },
  {
    seriesId: "CUUR0000SEMD01",
    name: "CPI Hospital Services",
    description: "CPI - Hospital and related services, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "hospital",
      "services",
      "price",
      "inflation",
      "inpatient",
      "outpatient",
    ],
  },
  {
    seriesId: "CUUR0000SEMF01",
    name: "CPI Prescription Drugs",
    description: "CPI - Prescription drugs, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "prescription",
      "drugs",
      "rx",
      "pharmacy",
      "pharmaceutical",
      "price",
      "inflation",
    ],
  },
  {
    seriesId: "CUUR0000SEME01",
    name: "CPI Health Insurance",
    description: "CPI - Health insurance, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "health",
      "insurance",
      "premium",
      "price",
      "inflation",
      "coverage",
    ],
  },
  {
    seriesId: "CUUR0000SEMF02",
    name: "CPI Medical Supplies",
    description:
      "CPI - Nonprescription drugs and medical supplies, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "medical",
      "supplies",
      "otc",
      "nonprescription",
      "over the counter",
      "price",
    ],
  },
  {
    seriesId: "CUUR0000SEMC01",
    name: "CPI Physician Services",
    description: "CPI - Physicians' services, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "physician",
      "doctor",
      "services",
      "office visit",
      "price",
      "inflation",
    ],
  },
  {
    seriesId: "CUUR0000SEMD02",
    name: "CPI Nursing Home Services",
    description: "CPI - Nursing homes and adult day services, US city average",
    survey: "CU",
    keywords: [
      "cpi",
      "nursing",
      "home",
      "adult",
      "day",
      "care",
      "long term",
      "ltc",
      "price",
    ],
  },

  // ── Employment - Healthcare ──
  {
    seriesId: "CES6562000001",
    name: "Healthcare Employment (All)",
    description:
      "Health care, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "healthcare",
      "health",
      "care",
      "jobs",
      "workers",
      "labor",
      "workforce",
    ],
  },
  {
    seriesId: "CES6562200001",
    name: "Hospital Employment",
    description: "Hospitals, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "hospital",
      "hospitals",
      "jobs",
      "workers",
      "inpatient",
    ],
  },
  {
    seriesId: "CES6562300001",
    name: "Nursing Facilities Employment",
    description:
      "Nursing and residential care facilities, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "nursing",
      "residential",
      "care",
      "facilities",
      "long term",
      "ltc",
      "snf",
    ],
  },
  {
    seriesId: "CES6562100001",
    name: "Ambulatory Care Employment",
    description:
      "Ambulatory health care services, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "ambulatory",
      "outpatient",
      "clinic",
      "services",
      "asc",
    ],
  },
  {
    seriesId: "CES6562160001",
    name: "Home Health Employment",
    description:
      "Home health care services, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "home",
      "health",
      "home care",
      "visiting",
      "jobs",
    ],
  },
  {
    seriesId: "CES3232540001",
    name: "Pharma Manufacturing Employment",
    description:
      "Pharmaceutical and medicine manufacturing, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "pharmaceutical",
      "pharma",
      "manufacturing",
      "drugs",
      "medicine",
      "biopharma",
    ],
  },

  // ── Earnings - Healthcare ──
  {
    seriesId: "CES6562000008",
    name: "Healthcare Average Hourly Earnings",
    description:
      "Health care, average hourly earnings (dollars), seasonally adjusted",
    survey: "CE",
    keywords: [
      "earnings",
      "wages",
      "hourly",
      "healthcare",
      "compensation",
      "salary",
      "pay",
    ],
  },
  {
    seriesId: "CES6562000011",
    name: "Healthcare Average Weekly Earnings",
    description:
      "Health care, average weekly earnings (dollars), seasonally adjusted",
    survey: "CE",
    keywords: [
      "earnings",
      "wages",
      "weekly",
      "healthcare",
      "compensation",
      "salary",
    ],
  },
  {
    seriesId: "CES6562200008",
    name: "Hospital Average Hourly Earnings",
    description:
      "Hospitals, average hourly earnings (dollars), seasonally adjusted",
    survey: "CE",
    keywords: [
      "earnings",
      "wages",
      "hourly",
      "hospital",
      "compensation",
      "salary",
    ],
  },
  {
    seriesId: "CES6562000006",
    name: "Healthcare Average Weekly Hours",
    description:
      "Health care, average weekly hours of all employees, seasonally adjusted",
    survey: "CE",
    keywords: [
      "hours",
      "weekly",
      "healthcare",
      "work",
      "labor",
      "schedule",
    ],
  },

  // ── PPI Healthcare ──
  {
    seriesId: "PCU622110622110",
    name: "PPI Hospitals (General Medical/Surgical)",
    description:
      "Producer Price Index - General medical and surgical hospitals",
    survey: "PC",
    keywords: [
      "ppi",
      "producer",
      "price",
      "hospital",
      "medical",
      "surgical",
      "inflation",
      "cost",
    ],
  },
  {
    seriesId: "PCU621111621111",
    name: "PPI Physician Offices",
    description: "Producer Price Index - Offices of physicians",
    survey: "PC",
    keywords: [
      "ppi",
      "producer",
      "price",
      "physician",
      "doctor",
      "office",
      "ambulatory",
    ],
  },
  {
    seriesId: "PCU621210621210",
    name: "PPI Dental Offices",
    description: "Producer Price Index - Offices of dentists",
    survey: "PC",
    keywords: [
      "ppi",
      "producer",
      "price",
      "dental",
      "dentist",
      "oral",
      "health",
    ],
  },
  {
    seriesId: "PCU622210622210",
    name: "PPI Psychiatric Hospitals",
    description:
      "Producer Price Index - Psychiatric and substance abuse hospitals",
    survey: "PC",
    keywords: [
      "ppi",
      "producer",
      "price",
      "psychiatric",
      "mental",
      "health",
      "substance",
      "abuse",
      "behavioral",
    ],
  },
  {
    seriesId: "PCU621610621610",
    name: "PPI Home Health Care",
    description: "Producer Price Index - Home health care services",
    survey: "PC",
    keywords: [
      "ppi",
      "producer",
      "price",
      "home",
      "health",
      "care",
      "home care",
    ],
  },

  // ── General Economy (useful for macro-context agents) ──
  {
    seriesId: "CUUR0000SA0",
    name: "CPI All Items",
    description: "CPI - All items, US city average (general inflation benchmark)",
    survey: "CU",
    keywords: [
      "cpi",
      "all",
      "items",
      "general",
      "inflation",
      "consumer",
      "price",
      "overall",
      "benchmark",
    ],
  },
  {
    seriesId: "CES0000000001",
    name: "Total Nonfarm Employment",
    description:
      "Total nonfarm, all employees (thousands), seasonally adjusted",
    survey: "CE",
    keywords: [
      "employment",
      "total",
      "nonfarm",
      "jobs",
      "economy",
      "labor",
      "overall",
      "benchmark",
    ],
  },
  {
    seriesId: "LNS14000000",
    name: "Unemployment Rate",
    description: "Unemployment rate, seasonally adjusted",
    survey: "LA",
    keywords: [
      "unemployment",
      "rate",
      "jobless",
      "labor",
      "economy",
      "macro",
    ],
  },
];

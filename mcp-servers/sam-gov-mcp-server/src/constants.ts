/**
 * SAM.gov API constants
 *
 * Base URLs, endpoint paths, rate limits, NAICS codes, set-aside types,
 * and response constraints for the SAM.gov public API.
 */

// ─── Base URL ────────────────────────────────────────────────

export const SAM_BASE_URL = "https://api.sam.gov";

// ─── Endpoint paths ──────────────────────────────────────────

export const ENDPOINTS = {
  OPPORTUNITIES: "/opportunities/v2/search",
  ENTITIES: "/entity-information/v3/entities",
} as const;

// ─── Rate limits ─────────────────────────────────────────────

/** SAM.gov allows 10 requests/second with an API key */
export const RATE_LIMIT_PER_SECOND = 10;

/** Minimum interval between requests in ms (100ms = 10/sec) */
export const MIN_REQUEST_INTERVAL_MS = 100;

/** Maximum retries on 429/5xx errors */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms */
export const BASE_RETRY_DELAY_MS = 1000;

// ─── Response constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

/** Default number of results if not specified */
export const DEFAULT_LIMIT = 10;

/** Maximum results per request for opportunities */
export const MAX_OPPORTUNITIES_LIMIT = 100;

/** Maximum results per request for entities */
export const MAX_ENTITIES_LIMIT = 100;

// ─── User Agent ──────────────────────────────────────────────

export const USER_AGENT = "Protoprism-SAM-MCP/1.0 (research@protoprism.ai)";

// ─── Procurement types ──────────────────────────────────────

export const PROCUREMENT_TYPES = {
  o: "Solicitation",
  p: "Presolicitation",
  k: "Combined Synopsis/Solicitation",
  r: "Sources Sought",
  g: "Sale of Surplus Property",
  s: "Special Notice",
  i: "Intent to Bundle Requirements",
  a: "Award Notice",
  u: "Justification and Approval",
} as const;

export type ProcurementType = keyof typeof PROCUREMENT_TYPES;

// ─── Set-aside types ─────────────────────────────────────────

export const SET_ASIDE_TYPES = {
  SBA: "Small Business Set-Aside",
  "8(a)": "8(a) Business Development",
  "8a": "8(a) Business Development",
  HUBZone: "HUBZone Small Business",
  SDVOSB: "Service-Disabled Veteran-Owned Small Business",
  WOSB: "Women-Owned Small Business",
  EDWOSB: "Economically Disadvantaged Women-Owned Small Business",
  VSA: "Veteran-Owned Small Business",
  ISBEE: "Indian Small Business Economic Enterprise",
} as const;

// ─── NAICS codes ─────────────────────────────────────────────

export interface NAICSCode {
  code: string;
  description: string;
  category: string;
}

/** Healthcare-relevant NAICS codes with Protoprism categorization */
export const HEALTHCARE_NAICS_CODES: NAICSCode[] = [
  // Providers
  { code: "621", description: "Ambulatory Health Care Services", category: "providers" },
  { code: "621111", description: "Offices of Physicians (except Mental Health Specialists)", category: "providers" },
  { code: "621112", description: "Offices of Physicians, Mental Health Specialists", category: "providers" },
  { code: "621210", description: "Offices of Dentists", category: "providers" },
  { code: "621310", description: "Offices of Chiropractors", category: "providers" },
  { code: "621320", description: "Offices of Optometrists", category: "providers" },
  { code: "621330", description: "Offices of Mental Health Practitioners (except Physicians)", category: "providers" },
  { code: "621340", description: "Offices of Physical, Occupational and Speech Therapists, and Audiologists", category: "providers" },
  { code: "621399", description: "Offices of All Other Miscellaneous Health Practitioners", category: "providers" },
  { code: "621410", description: "Family Planning Centers", category: "providers" },
  { code: "621420", description: "Outpatient Mental Health and Substance Abuse Centers", category: "providers" },
  { code: "621491", description: "HMO Medical Centers", category: "providers" },
  { code: "621492", description: "Kidney Dialysis Centers", category: "providers" },
  { code: "621493", description: "Freestanding Ambulatory Surgical and Emergency Centers", category: "providers" },
  { code: "621498", description: "All Other Outpatient Care Centers", category: "providers" },
  { code: "621511", description: "Medical Laboratories", category: "providers" },
  { code: "621512", description: "Diagnostic Imaging Centers", category: "providers" },
  { code: "621610", description: "Home Health Care Services", category: "providers" },
  { code: "621910", description: "Ambulance Services", category: "providers" },
  { code: "621991", description: "Blood and Organ Banks", category: "providers" },
  { code: "621999", description: "All Other Miscellaneous Ambulatory Health Care Services", category: "providers" },

  // Hospitals
  { code: "622", description: "Hospitals", category: "providers" },
  { code: "622110", description: "General Medical and Surgical Hospitals", category: "providers" },
  { code: "622210", description: "Psychiatric and Substance Abuse Hospitals", category: "providers" },
  { code: "622310", description: "Specialty (except Psychiatric and Substance Abuse) Hospitals", category: "providers" },

  // Nursing & Residential Care
  { code: "623", description: "Nursing and Residential Care Facilities", category: "providers" },
  { code: "623110", description: "Nursing Care Facilities (Skilled Nursing Facilities)", category: "providers" },
  { code: "623210", description: "Residential Intellectual and Developmental Disability Facilities", category: "providers" },
  { code: "623220", description: "Residential Mental Health and Substance Abuse Facilities", category: "providers" },
  { code: "623311", description: "Continuing Care Retirement Communities", category: "providers" },
  { code: "623312", description: "Assisted Living Facilities for the Elderly", category: "providers" },

  // Insurance
  { code: "524114", description: "Direct Health and Medical Insurance Carriers", category: "insurance" },
  { code: "524292", description: "Third Party Administration of Insurance and Pension Funds", category: "insurance" },

  // Pharmaceutical Manufacturing
  { code: "325411", description: "Medicinal and Botanical Manufacturing", category: "pharma" },
  { code: "325412", description: "Pharmaceutical Preparation Manufacturing", category: "pharma" },
  { code: "325413", description: "In-Vitro Diagnostic Substance Manufacturing", category: "pharma" },
  { code: "325414", description: "Biological Product (except Diagnostic) Manufacturing", category: "pharma" },

  // Medical Devices
  { code: "339112", description: "Surgical and Medical Instrument Manufacturing", category: "devices" },
  { code: "339113", description: "Surgical Appliance and Supplies Manufacturing", category: "devices" },
  { code: "339114", description: "Dental Equipment and Supplies Manufacturing", category: "devices" },
  { code: "339115", description: "Ophthalmic Goods Manufacturing", category: "devices" },
  { code: "339116", description: "Dental Laboratories", category: "devices" },

  // Research
  { code: "541711", description: "Research and Development in Biotechnology", category: "research" },
  { code: "541712", description: "Research and Development in the Physical, Engineering, and Life Sciences (except Biotechnology and Nanotechnology)", category: "research" },
  { code: "541714", description: "Research and Development in Biotechnology (except Nanobiotechnology)", category: "research" },
  { code: "541715", description: "Research and Development in Nanotechnology", category: "research" },

  // Health IT
  { code: "511210", description: "Software Publishers", category: "health_it" },
  { code: "518210", description: "Data Processing, Hosting, and Related Services", category: "health_it" },
  { code: "541511", description: "Custom Computer Programming Services", category: "health_it" },
  { code: "541512", description: "Computer Systems Design Services", category: "health_it" },
  { code: "541519", description: "Other Computer Related Services", category: "health_it" },
];

/** Healthcare NAICS prefix codes used for pre-filtering opportunities */
export const HEALTHCARE_NAICS_PREFIXES = [
  "621",    // Ambulatory Health Care Services
  "622",    // Hospitals
  "623",    // Nursing and Residential Care Facilities
  "524114", // Health Insurance Carriers
  "325411", // Medicinal and Botanical Manufacturing
  "325412", // Pharmaceutical Preparation Manufacturing
  "325413", // In-Vitro Diagnostic Substance Manufacturing
  "325414", // Biological Product Manufacturing
  "339112", // Surgical and Medical Instrument Manufacturing
  "339113", // Surgical Appliance and Supplies Manufacturing
  "339114", // Dental Equipment and Supplies Manufacturing
  "339115", // Ophthalmic Goods Manufacturing
  "541711", // R&D in Biotechnology
  "541712", // R&D in Physical/Engineering/Life Sciences
  "541714", // R&D in Biotechnology (except Nanobiotechnology)
] as const;

// ─── PSC codes (Product Service Codes) ───────────────────────

export interface PSCCode {
  code: string;
  description: string;
}

export const HEALTHCARE_PSC_CODES: PSCCode[] = [
  { code: "Q", description: "Medical Services" },
  { code: "Q101", description: "General Health Care" },
  { code: "Q201", description: "General Health Care Staffing" },
  { code: "Q301", description: "Medical/Dental Care - Civilian" },
  { code: "Q401", description: "Medical/Dental Care - Military" },
  { code: "Q501", description: "Medical Examination" },
  { code: "Q502", description: "Testing" },
  { code: "Q503", description: "Veterinary/Animal Care" },
  { code: "Q999", description: "Other Medical Services" },
  { code: "6505", description: "Drugs and Biologicals" },
  { code: "6508", description: "Medicated Cosmetics and Toiletries" },
  { code: "6510", description: "Surgical Dressing Materials" },
  { code: "6515", description: "Medical and Surgical Instruments, Equipment, and Supplies" },
  { code: "6520", description: "Dental Instruments, Equipment, and Supplies" },
  { code: "6525", description: "Imaging Equipment and Supplies" },
  { code: "6530", description: "Hospital Furniture, Equipment, Utensils, and Supplies" },
  { code: "6532", description: "Hospital and Surgical Clothing and Textile Special Purpose Items" },
  { code: "6540", description: "Ophthalmic Instruments, Equipment, and Supplies" },
  { code: "6545", description: "Replenishable Field Medical Sets, Kits, and Outfits" },
  { code: "6550", description: "In Vitro Diagnostics" },
];

// ─── NAICS categories ────────────────────────────────────────

export const NAICS_CATEGORIES = [
  "providers",
  "pharma",
  "devices",
  "insurance",
  "research",
  "health_it",
] as const;

export type NAICSCategory = (typeof NAICS_CATEGORIES)[number];

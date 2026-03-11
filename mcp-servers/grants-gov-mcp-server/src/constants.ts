/**
 * Grants.gov API constants
 *
 * Base URLs, endpoint paths, rate limits, agency codes, funding categories,
 * and response constraints for the Grants.gov public API.
 */

// ─── Base URLs ──────────────────────────────────────────────

/** Grants.gov v1 REST API base URL */
export const API_BASE_URL = "https://api.grants.gov/v1/api";

/** Legacy Grants.gov REST search endpoint (fallback) */
export const LEGACY_SEARCH_URL =
  "https://www.grants.gov/grantsws/rest/opportunities/search";

// ─── Rate Limits ────────────────────────────────────────────

/** Minimum interval between requests in ms */
export const RATE_LIMIT_MS = 300;

/** Maximum retries on 429/5xx errors */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms */
export const BASE_RETRY_DELAY_MS = 1000;

// ─── Response Constraints ───────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

/** Default number of results if not specified */
export const DEFAULT_LIMIT = 25;

/** Maximum results per request */
export const MAX_LIMIT = 100;

// ─── User Agent ─────────────────────────────────────────────

export const USER_AGENT = "Protoprism-Grants-MCP/1.0 (research@protoprism.ai)";

// ─── Request Timeout ────────────────────────────────────────

/** HTTP request timeout in ms */
export const REQUEST_TIMEOUT_MS = 30000;

// ─── Agency Definitions ─────────────────────────────────────

export interface Agency {
  /** Agency code used in Grants.gov API */
  code: string;
  /** Full agency name */
  name: string;
  /** Short / common abbreviation */
  abbreviation: string;
  /** Whether this agency is directly healthcare-relevant */
  healthcare_relevant: boolean;
  /** Brief description of healthcare relevance */
  healthcare_note: string;
}

/** Curated list of federal agencies relevant to grant searches */
export const AGENCIES: Agency[] = [
  {
    code: "HHS",
    name: "Department of Health and Human Services",
    abbreviation: "HHS",
    healthcare_relevant: true,
    healthcare_note:
      "Parent agency for NIH, CDC, CMS, FDA, and other major health agencies. " +
      "Largest source of healthcare-related federal grants.",
  },
  {
    code: "NIH",
    name: "National Institutes of Health",
    abbreviation: "NIH",
    healthcare_relevant: true,
    healthcare_note:
      "Primary federal agency for biomedical and public health research. " +
      "Funds the majority of federally-sponsored health research grants.",
  },
  {
    code: "CDC",
    name: "Centers for Disease Control and Prevention",
    abbreviation: "CDC",
    healthcare_relevant: true,
    healthcare_note:
      "Funds disease prevention, health promotion, preparedness, and " +
      "public health infrastructure grants.",
  },
  {
    code: "CMS",
    name: "Centers for Medicare & Medicaid Services",
    abbreviation: "CMS",
    healthcare_relevant: true,
    healthcare_note:
      "Funds healthcare delivery innovation, quality improvement, and " +
      "Medicare/Medicaid demonstration projects.",
  },
  {
    code: "SAMHSA",
    name: "Substance Abuse and Mental Health Services Administration",
    abbreviation: "SAMHSA",
    healthcare_relevant: true,
    healthcare_note:
      "Funds behavioral health, substance abuse prevention/treatment, " +
      "and mental health services grants.",
  },
  {
    code: "AHRQ",
    name: "Agency for Healthcare Research and Quality",
    abbreviation: "AHRQ",
    healthcare_relevant: true,
    healthcare_note:
      "Funds health services research, patient safety, and evidence-based " +
      "healthcare improvement grants.",
  },
  {
    code: "HRSA",
    name: "Health Resources and Services Administration",
    abbreviation: "HRSA",
    healthcare_relevant: true,
    healthcare_note:
      "Funds programs improving healthcare access for underserved populations, " +
      "including community health centers and workforce development.",
  },
  {
    code: "FDA",
    name: "Food and Drug Administration",
    abbreviation: "FDA",
    healthcare_relevant: true,
    healthcare_note:
      "Funds regulatory science research, drug/device safety studies, " +
      "and food safety grants.",
  },
  {
    code: "NSF",
    name: "National Science Foundation",
    abbreviation: "NSF",
    healthcare_relevant: true,
    healthcare_note:
      "Funds fundamental research including biomedical engineering, " +
      "computational biology, and health-related STEM grants.",
  },
  {
    code: "DOD",
    name: "Department of Defense",
    abbreviation: "DOD",
    healthcare_relevant: true,
    healthcare_note:
      "Funds military health research through CDMRP (Congressionally Directed " +
      "Medical Research Programs) including cancer, trauma, and PTSD research.",
  },
  {
    code: "VA",
    name: "Department of Veterans Affairs",
    abbreviation: "VA",
    healthcare_relevant: true,
    healthcare_note:
      "Funds veterans health research and healthcare delivery improvement grants.",
  },
  {
    code: "EPA",
    name: "Environmental Protection Agency",
    abbreviation: "EPA",
    healthcare_relevant: false,
    healthcare_note:
      "Funds environmental health research including air quality, " +
      "water safety, and environmental exposure impacts on health.",
  },
  {
    code: "USDA",
    name: "Department of Agriculture",
    abbreviation: "USDA",
    healthcare_relevant: false,
    healthcare_note:
      "Funds food safety, nutrition research, and rural health programs.",
  },
  {
    code: "ED",
    name: "Department of Education",
    abbreviation: "ED",
    healthcare_relevant: false,
    healthcare_note:
      "Funds health education, school-based health programs, and " +
      "rehabilitation services research.",
  },
  {
    code: "DOE",
    name: "Department of Energy",
    abbreviation: "DOE",
    healthcare_relevant: false,
    healthcare_note:
      "Funds radiation research, medical isotope production, and " +
      "computational biology through national laboratories.",
  },
  {
    code: "ACF",
    name: "Administration for Children and Families",
    abbreviation: "ACF",
    healthcare_relevant: true,
    healthcare_note:
      "Funds child welfare, early childhood development, and family " +
      "support programs with health components.",
  },
  {
    code: "ACL",
    name: "Administration for Community Living",
    abbreviation: "ACL",
    healthcare_relevant: true,
    healthcare_note:
      "Funds aging services, disability programs, and community-based " +
      "long-term care support grants.",
  },
  {
    code: "IHS",
    name: "Indian Health Service",
    abbreviation: "IHS",
    healthcare_relevant: true,
    healthcare_note:
      "Funds healthcare services and programs for American Indian and " +
      "Alaska Native populations.",
  },
  {
    code: "ASPR",
    name: "Administration for Strategic Preparedness and Response",
    abbreviation: "ASPR",
    healthcare_relevant: true,
    healthcare_note:
      "Funds public health emergency preparedness, medical countermeasures, " +
      "and healthcare system resilience grants.",
  },
];

// ─── Funding Categories ─────────────────────────────────────

export interface FundingCategory {
  /** Category code used in Grants.gov API */
  code: string;
  /** Full category name */
  name: string;
  /** Whether this category is healthcare-relevant */
  healthcare_relevant: boolean;
}

/** Grants.gov funding categories (used in fundingCategory filter) */
export const FUNDING_CATEGORIES: FundingCategory[] = [
  { code: "HL", name: "Health", healthcare_relevant: true },
  { code: "ST", name: "Science and Technology and Other Research and Development", healthcare_relevant: true },
  { code: "IS", name: "Income Security and Social Services", healthcare_relevant: true },
  { code: "FN", name: "Food and Nutrition", healthcare_relevant: true },
  { code: "DPR", name: "Disaster Prevention and Relief", healthcare_relevant: false },
  { code: "AG", name: "Agriculture", healthcare_relevant: false },
  { code: "AR", name: "Arts", healthcare_relevant: false },
  { code: "BC", name: "Business and Commerce", healthcare_relevant: false },
  { code: "CD", name: "Community Development", healthcare_relevant: false },
  { code: "CP", name: "Consumer Protection", healthcare_relevant: false },
  { code: "ED", name: "Education", healthcare_relevant: false },
  { code: "ELT", name: "Employment, Labor and Training", healthcare_relevant: false },
  { code: "EN", name: "Energy", healthcare_relevant: false },
  { code: "ENV", name: "Environment", healthcare_relevant: false },
  { code: "HU", name: "Housing", healthcare_relevant: false },
  { code: "HO", name: "Humanities", healthcare_relevant: false },
  { code: "IIJ", name: "Information and Statistics", healthcare_relevant: false },
  { code: "LJL", name: "Law, Justice and Legal Services", healthcare_relevant: false },
  { code: "NR", name: "Natural Resources", healthcare_relevant: false },
  { code: "RA", name: "Recovery Act", healthcare_relevant: false },
  { code: "RD", name: "Regional Development", healthcare_relevant: false },
  { code: "T", name: "Transportation", healthcare_relevant: false },
  { code: "O", name: "Other", healthcare_relevant: false },
];

// ─── Opportunity Status Values ──────────────────────────────

export const OPPORTUNITY_STATUSES = ["open", "closed", "forecasted"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

// ─── Sort Options ───────────────────────────────────────────

export const SORT_OPTIONS = ["openDate", "closeDate", "agencyName", "opportunityTitle"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

// ─── Healthcare Agencies (HHS sub-agencies) ─────────────────

/** Agency codes considered part of the HHS family for healthcare filtering */
export const HHS_FAMILY_AGENCIES = [
  "HHS",
  "NIH",
  "CDC",
  "CMS",
  "SAMHSA",
  "AHRQ",
  "HRSA",
  "FDA",
  "ACF",
  "ACL",
  "IHS",
  "ASPR",
] as const;

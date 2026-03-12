/**
 * Federal Register MCP Server — Constants
 *
 * API base URL, document types, healthcare-relevant agency slugs,
 * and default field selections.
 */

// ─── API ────────────────────────────────────────────────────

export const BASE_URL = "https://www.federalregister.gov/api/v1";

/** Maximum characters returned in any single tool response. */
export const CHARACTER_LIMIT = 25_000;

// ─── Document Types ─────────────────────────────────────────

/**
 * Federal Register document classification codes.
 *
 * RULE     — Final rules (published in CFR)
 * PRORULE  — Proposed rules (open for public comment)
 * NOTICE   — Agency notices (guidance, meetings, availability)
 * PRESDOCU — Presidential documents (executive orders, proclamations)
 */
export const DOCUMENT_TYPES = ["RULE", "PRORULE", "NOTICE", "PRESDOCU"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ─── Healthcare Agency Slugs ────────────────────────────────

/**
 * Commonly referenced healthcare agencies.
 * Provided as a convenience for the AI agents —
 * users can pass ANY valid agency slug to the tools.
 */
export const HEALTHCARE_AGENCIES: Record<string, string> = {
  HHS: "health-and-human-services-department",
  CMS: "centers-for-medicare-medicaid-services",
  FDA: "food-and-drug-administration",
  CDC: "centers-for-disease-control-and-prevention",
  NIH: "national-institutes-of-health",
  OIG: "inspector-general-office-health-and-human-services-department",
  SAMHSA:
    "substance-abuse-and-mental-health-services-administration",
  AHRQ: "agency-for-healthcare-research-and-quality",
  HRSA: "health-resources-and-services-administration",
  CMS_INNOVATION: "center-for-medicare-and-medicaid-innovation",
};

// ─── Default Fields ─────────────────────────────────────────

/**
 * Fields requested from the documents search endpoint.
 * Keeping this explicit avoids pulling the entire document body
 * (which can be very large) on every search.
 */
export const SEARCH_FIELDS = [
  "title",
  "type",
  "abstract",
  "document_number",
  "html_url",
  "pdf_url",
  "publication_date",
  "agencies",
  "topics",
  "significant",
  "action",
  "dates",
  "docket_ids",
  "comment_url",
  "comments_close_on",
] as const;

/**
 * Fields requested when fetching a single document in full.
 */
export const DETAIL_FIELDS = [
  "title",
  "type",
  "subtype",
  "abstract",
  "action",
  "dates",
  "document_number",
  "citation",
  "html_url",
  "pdf_url",
  "body_html_url",
  "raw_text_url",
  "publication_date",
  "effective_on",
  "signing_date",
  "comment_url",
  "comments_close_on",
  "agencies",
  "topics",
  "cfr_references",
  "docket_ids",
  "regulation_id_numbers",
  "significant",
  "start_page",
  "end_page",
  "page_length",
  "page_views",
  "executive_order_number",
  "presidential_document_number",
  "corrections",
  "correction_of",
] as const;

// ─── HTTP Server ────────────────────────────────────────────

export const DEFAULT_HTTP_PORT = 4005;

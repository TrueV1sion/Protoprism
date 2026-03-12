/**
 * openFDA API constants
 *
 * Base URLs, endpoint paths, rate limits, and response constraints
 * for the openFDA public API.
 */

// ─── Base URL ────────────────────────────────────────────────

export const OPENFDA_BASE_URL = "https://api.fda.gov";

// ─── Endpoint paths ──────────────────────────────────────────

export const ENDPOINTS = {
  DRUG_LABEL: "/drug/label.json",
  DRUG_EVENT: "/drug/event.json",
  DRUG_ENFORCEMENT: "/drug/enforcement.json",
  DEVICE_510K: "/device/510k.json",
  DEVICE_EVENT: "/device/event.json",
  DEVICE_RECALL: "/device/recall.json",
  FOOD_ENFORCEMENT: "/food/enforcement.json",
} as const;

// ─── Rate limits ─────────────────────────────────────────────

/** Requests per minute without an API key */
export const RATE_LIMIT_NO_KEY = 40;

/** Requests per minute with an API key */
export const RATE_LIMIT_WITH_KEY = 240;

/** Minimum interval between requests in ms (no key: 1500ms = 40/min) */
export const MIN_REQUEST_INTERVAL_MS = 1500;

// ─── Response constraints ────────────────────────────────────

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25000;

/** openFDA maximum limit per request */
export const MAX_RESULTS_PER_REQUEST = 100;

/** Default number of results if not specified */
export const DEFAULT_LIMIT = 10;

/** Default skip offset */
export const DEFAULT_SKIP = 0;

// ─── Count fields ────────────────────────────────────────────

/**
 * Commonly used count fields for the adverse events endpoint.
 * These are the fields available for the `count` parameter.
 */
export const ADVERSE_EVENT_COUNT_FIELDS = [
  "patient.reaction.reactionmeddrapt.exact",
  "patient.drug.openfda.brand_name.exact",
  "patient.drug.openfda.generic_name.exact",
  "patient.drug.openfda.substance_name.exact",
  "patient.drug.drugindication.exact",
  "serious",
  "seriousnessdeath",
  "seriousnesshospitalization",
  "seriousnesslifethreatening",
  "seriousnessdisabling",
  "receivedate",
  "patient.patientsex",
  "primarysource.reportercountry.exact",
  "patient.drug.drugcharacterization",
] as const;

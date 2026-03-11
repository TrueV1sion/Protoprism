/**
 * FDA Orange Book MCP Server — Constants
 *
 * Base URL, rate limits, response constraints, and reference maps for
 * therapeutic equivalence (TE) codes and exclusivity codes.
 */

// ─── API Configuration ──────────────────────────────────────

/** openFDA drugsfda endpoint (Orange Book data) */
export const BASE_URL = "https://api.fda.gov/drug/drugsfda.json";

/** User-Agent string for all outbound requests */
export const USER_AGENT =
  "Protoprism-OrangeBook-MCP/1.0 (research@protoprism.ai)";

// ─── Rate Limits ────────────────────────────────────────────

/** Minimum milliseconds between consecutive API requests */
export const RATE_LIMIT_MS = 200;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

// ─── Response Constraints ───────────────────────────────────

/** Default number of results when limit is not specified */
export const DEFAULT_LIMIT = 10;

/** Maximum results the openFDA API returns per request */
export const MAX_LIMIT = 100;

/** Maximum characters to return in a single tool response */
export const CHARACTER_LIMIT = 25_000;

// ─── Therapeutic Equivalence (TE) Code Reference ────────────

/**
 * FDA Therapeutic Equivalence evaluation codes.
 * "A"-rated drugs are considered therapeutically equivalent.
 * "B"-rated drugs are NOT considered therapeutically equivalent.
 */
export const TE_CODE_DESCRIPTIONS: Record<string, string> = {
  // A-rated (therapeutically equivalent)
  AA: "No bioequivalence problems — no known or suspected problems; conventional dosage forms",
  AB: "Bioequivalence demonstrated — meets necessary bioequivalence requirements",
  AN: "Aerosol — nebulizer drug products shown to be bioequivalent",
  AO: "Injectable oil solutions — shown to be bioequivalent",
  AP: "Injectable aqueous solutions — shown to be bioequivalent",
  AT: "Topical products — shown to be bioequivalent",

  // B-rated (NOT therapeutically equivalent)
  BC: "Extended-release dosage forms — controlled-release with bioequivalence issues",
  BD: "Active ingredients and dosage forms with documented bioequivalence problems",
  BE: "Delayed-release enteric-coated products with bioequivalence issues",
  BN: "Nebulizer drug products — insufficient evidence of therapeutic equivalence",
  BP: "Active ingredients and dosage forms with potential bioequivalence problems",
  BR: "Suppositories or enemas with bioequivalence issues",
  BS: "Products with drug standard deficiencies",
  BT: "Topical products with bioequivalence issues",
  BX: "Insufficient data — drug products for which data are insufficient to determine therapeutic equivalence",
} as const;

// ─── Exclusivity Code Reference ─────────────────────────────

/**
 * FDA Exclusivity codes granted to approved drug applications.
 * These provide periods of market exclusivity beyond patent protection.
 */
export const EXCLUSIVITY_CODE_DESCRIPTIONS: Record<string, string> = {
  // New Chemical Entity
  NCE: "New Chemical Entity — 5 years of exclusivity from approval date",

  // Orphan Drug
  ODE: "Orphan Drug Exclusivity — 7 years of exclusivity for designated orphan indications",

  // Pediatric
  PED: "Pediatric Exclusivity — 6-month extension added to existing patents/exclusivity",

  // New Clinical Investigation
  NCI: "New Clinical Investigation — 3 years for new conditions of approval (new indication, dosage form, route, etc.)",

  // Patent Challenge (Paragraph IV)
  "P-IV": "First Generic — 180 days of marketing exclusivity for first ANDA with Paragraph IV certification",
  "180-FTF": "First to File — 180-day generic exclusivity (first ANDA filer)",

  // Biosimilar
  BLA: "Biologic License Application exclusivity",
  BPCA: "Best Pharmaceuticals for Children Act — pediatric exclusivity for biologics",

  // Competitive Generic Therapy
  CGT: "Competitive Generic Therapy — 180-day exclusivity for first approved generic of certain drugs",

  // Qualified Infectious Disease Product
  QIDP: "Qualified Infectious Disease Product — 5 additional years of exclusivity",

  // New Patient Population
  NPP: "New Patient Population — 3 years of exclusivity",

  // New Dosage Form
  NDF: "New Dosage Form — 3 years of exclusivity",

  // Other common codes
  "I-462": "Pediatric study exclusivity",
  NC: "New combination — exclusivity for new fixed-dose combinations",
  NP: "New product — 3 years exclusivity for new product applications",
} as const;

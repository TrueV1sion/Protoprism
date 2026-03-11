/**
 * Constants for the Congress.gov MCP Server
 *
 * Covers API configuration, bill types, healthcare-relevant committees,
 * and output formatting limits.
 */

// ─── API Configuration ──────────────────────────────────────

export const BASE_URL = "https://api.congress.gov/v3";

export const CHARACTER_LIMIT = 25000;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const DEFAULT_ACTIONS_LIMIT = 50;

// ─── Bill Types ─────────────────────────────────────────────

export const BILL_TYPES = ["hr", "s", "hjres", "sjres"] as const;
export type BillType = (typeof BILL_TYPES)[number];

export const BILL_TYPE_LABELS: Record<BillType, string> = {
  hr: "House Bill",
  s: "Senate Bill",
  hjres: "House Joint Resolution",
  sjres: "Senate Joint Resolution",
};

// ─── Chambers ───────────────────────────────────────────────

export const CHAMBERS = ["house", "senate"] as const;
export type Chamber = (typeof CHAMBERS)[number];

export const COMMITTEE_CHAMBERS = ["house", "senate", "joint"] as const;
export type CommitteeChamber = (typeof COMMITTEE_CHAMBERS)[number];

// ─── Parties ────────────────────────────────────────────────

export const PARTIES = ["D", "R", "I"] as const;
export type Party = (typeof PARTIES)[number];

// ─── Sort Options ───────────────────────────────────────────

export const BILL_SORT_OPTIONS = ["updateDate", "latestAction"] as const;
export type BillSortOption = (typeof BILL_SORT_OPTIONS)[number];

// ─── Healthcare-Relevant Committees ─────────────────────────

/**
 * Key congressional committees that handle healthcare legislation.
 * Used for filtering and context by healthcare-focused archetypes
 * like LEGISLATIVE-PIPELINE and REGULATORY-RADAR.
 */
export const HEALTHCARE_COMMITTEES = [
  "Senate Health, Education, Labor, and Pensions Committee",
  "Senate Finance Committee",
  "House Energy and Commerce Committee",
  "House Ways and Means Committee",
  "House Appropriations Committee",
  "Senate Appropriations Committee",
  "House Budget Committee",
  "Senate Budget Committee",
] as const;

// ─── Server Metadata ────────────────────────────────────────

export const SERVER_NAME = "congress-gov-mcp-server";
export const SERVER_VERSION = "1.0.0";

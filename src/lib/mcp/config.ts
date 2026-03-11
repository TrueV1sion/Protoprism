/**
 * MCP Server Configuration
 *
 * Defines the MCP server registry, connection parameters, and
 * archetype-to-server routing for the PRISM pipeline.
 *
 * Server Categories:
 *   1. Anthropic-provided (remote SSE): PubMed, CMS Coverage, ICD-10,
 *      NPI Registry, Clinical Trials, bioRxiv — no standalone npm packages.
 *   2. Protoprism-built (remote HTTP or stdio): openFDA, SEC EDGAR,
 *      Federal Register, USPTO Patents, Congress.gov, BLS, Census —
 *      standalone MCP servers under /mcp-servers/.
 *
 * The MCPManager handles missing/unavailable servers gracefully —
 * agents note unavailable tools in their `gaps` field.
 */

import type { ArchetypeFamily } from "@/lib/pipeline/types";

// ─── Server Config ──────────────────────────────────────────

export interface MCPServerConfig {
  /** Human-readable description of what this server provides */
  description: string;
  /**
   * Whether this server is enabled.
   * If true, MCPManager will attempt connection at init.
   * Connection failures degrade gracefully (server marked unavailable at runtime).
   */
  available: boolean;
  /** Transport type: "sse" for remote HTTP servers, "stdio" for local processes */
  transport: "sse" | "stdio";
  // ── SSE transport fields ──
  /** Env var key holding the server URL (resolved at runtime) */
  envUrlKey?: string;
  // ── Stdio transport fields ──
  /** Command to spawn the server process */
  command?: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the spawned process */
  env?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Server Registry
// ─────────────────────────────────────────────────────────────

export const MCP_SERVERS: Record<string, MCPServerConfig> = {
  // ── Anthropic-provided healthcare servers ──────────────────
  pubmed: {
    description: "PubMed article search and retrieval",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_PUBMED_URL",
  },
  cms_coverage: {
    description: "CMS national and local coverage determinations",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_CMS_COVERAGE_URL",
  },
  icd10: {
    description: "ICD-10 code lookup, search, and validation",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_ICD10_URL",
  },
  npi_registry: {
    description: "NPI provider registry search and validation",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_NPI_REGISTRY_URL",
  },
  clinical_trials: {
    description: "ClinicalTrials.gov search and analysis",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_CLINICAL_TRIALS_URL",
  },
  biorxiv: {
    description: "bioRxiv/medRxiv preprint search and retrieval",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_BIORXIV_URL",
  },

  // ── Protoprism-built public API servers ────────────────────
  openfda: {
    description:
      "openFDA drug/device safety: labels, adverse events, recalls, 510(k)s",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_OPENFDA_URL",
  },
  sec_edgar: {
    description:
      "SEC EDGAR filings: 10-K, 10-Q, 8-K, S-1, company facts (XBRL)",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_SEC_EDGAR_URL",
  },
  federal_register: {
    description:
      "Federal Register: proposed/final rules, notices, presidential actions",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_FEDERAL_REGISTER_URL",
  },
  uspto_patents: {
    description:
      "USPTO PatentsView: patent search, assignees, citations, CPC classes",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_USPTO_PATENTS_URL",
  },
  congress_gov: {
    description:
      "Congress.gov: bills, amendments, committee actions, hearings",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_CONGRESS_GOV_URL",
  },
  bls_data: {
    description:
      "BLS Public Data: employment, CPI, wages, healthcare sector stats",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_BLS_DATA_URL",
  },
  census_bureau: {
    description:
      "Census Bureau: demographics, health insurance (ACS/SAHIE), income",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_CENSUS_BUREAU_URL",
  },

  // ── Protoprism-built Tier 2 public API servers ──────────────
  who_gho: {
    description:
      "WHO Global Health Observatory: disease burden, health expenditure, workforce, SDG indicators across 194 countries",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_WHO_GHO_URL",
  },
  gpo_govinfo: {
    description:
      "GPO GovInfo: full-text CFR, public laws, congressional reports, bills, Federal Register documents",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_GPO_GOVINFO_URL",
  },
  cbo: {
    description:
      "Congressional Budget Office: cost estimates, budget projections, healthcare spending analysis",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_CBO_URL",
  },
  oecd_health: {
    description:
      "OECD Health Statistics: cross-country health system performance, spending, outcomes, workforce",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_OECD_HEALTH_URL",
  },
  sam_gov: {
    description:
      "SAM.gov: federal contract opportunities, awards, entity registrations for government procurement",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_SAM_GOV_URL",
  },

  // ── Protoprism-built Tier 3 public API servers ──────────────
  fda_orange_book: {
    description:
      "FDA Orange Book: approved drug products, therapeutic equivalence, patent/exclusivity data",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_FDA_ORANGE_BOOK_URL",
  },
  grants_gov: {
    description:
      "Grants.gov: federal grant opportunities, forecasts, agency funding programs",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_GRANTS_GOV_URL",
  },
  ahrq_hcup: {
    description:
      "AHRQ HCUP: healthcare cost & utilization statistics, hospital stays, ED visits, diagnoses",
    available: true,
    transport: "sse",
    envUrlKey: "MCP_AHRQ_HCUP_URL",
  },
};

// ─── Archetype → Server Routing ─────────────────────────────

/**
 * Maps archetype families to the MCP server names they should have access to.
 * Archetypes not listed here get no MCP tools (only Anthropic native tools
 * like web_search if applicable).
 */
export const ARCHETYPE_TOOL_ROUTING: Partial<
  Record<ArchetypeFamily, string[]>
> = {
  // ── Researchers ────────────────────────────────────────────
  "RESEARCHER-WEB": [], // Uses web_search native tool instead of MCP
  "RESEARCHER-DATA": [
    "pubmed",
    "clinical_trials",
    "biorxiv",
    "census_bureau", // demographic/insurance data
    "who_gho", // global health indicators
    "oecd_health", // cross-country health system data
    "grants_gov", // federal grant funding data
    "ahrq_hcup", // healthcare utilization statistics
  ],
  "RESEARCHER-DOMAIN": [
    "pubmed",
    "cms_coverage",
    "icd10",
    "npi_registry",
    "clinical_trials",
    "openfda", // drug labels, device data
    "fda_orange_book", // approved drugs, patents, exclusivity
    "grants_gov", // federal research funding
  ],
  "RESEARCHER-LATERAL": [
    "pubmed",
    "biorxiv",
    "uspto_patents", // patent landscape for innovation signals
  ],

  // ── Analysts ───────────────────────────────────────────────
  "ANALYST-FINANCIAL": [
    "sec_edgar", // 10-K, 10-Q, S-1 filings, XBRL facts
    "bls_data", // employment, CPI, wage data
    "cbo", // budget projections, cost estimates
    "sam_gov", // federal contract awards
    "ahrq_hcup", // healthcare cost/utilization data
  ],
  "ANALYST-STRATEGIC": [
    "sec_edgar", // competitive filing analysis
    "federal_register", // regulatory environment
    "congress_gov", // legislative landscape
    "sam_gov", // government procurement landscape
    "oecd_health", // international market comparisons
    "grants_gov", // federal funding landscape
  ],
  "ANALYST-TECHNICAL": [
    "pubmed",
    "clinical_trials",
    "openfda", // drug safety, 510(k) clearances
    "uspto_patents", // patent/IP landscape
    "fda_orange_book", // approved drug patents, therapeutic equivalence
  ],
  "ANALYST-RISK": [
    "cms_coverage",
    "clinical_trials",
    "openfda", // adverse events, recalls
    "federal_register", // regulatory risk signals
  ],
  "ANALYST-QUALITY": [
    "cms_coverage",
    "icd10",
    "who_gho", // global health quality benchmarks
    "ahrq_hcup", // hospital quality/utilization metrics
  ],

  // ── Critics ────────────────────────────────────────────────
  "CRITIC-FACTUAL": [], // Uses web_search native tool for fact-checking
  "CRITIC-LOGICAL": [],
  "CRITIC-STRATEGIC": [],
  "CRITIC-EDITORIAL": [],

  // ── Creators ───────────────────────────────────────────────
  "CREATOR-WRITER": [],
  "CREATOR-PRESENTER": [],
  "CREATOR-TECHNICAL": [],
  "CREATOR-PERSUADER": [],

  // ── Meta ───────────────────────────────────────────────────
  SYNTHESIZER: [],
  ARBITER: [],

  // ── Specialists ────────────────────────────────────────────
  "DEVILS-ADVOCATE": [],
  FUTURIST: [
    "clinical_trials",
    "biorxiv",
    "uspto_patents", // emerging patent trends
  ],
  HISTORIAN: ["pubmed"],
  "RED-TEAM": [],
  "CUSTOMER-PROXY": ["npi_registry", "census_bureau"],

  // ── Regulatory / Policy ────────────────────────────────────
  "LEGISLATIVE-PIPELINE": [
    "cms_coverage",
    "congress_gov", // bills, hearings, committee actions
    "federal_register", // proposed/final rules
    "cbo", // CBO cost estimates for legislation
    "gpo_govinfo", // full-text laws, reports, CFR
  ],
  "REGULATORY-RADAR": [
    "cms_coverage",
    "icd10",
    "openfda", // FDA enforcement, recalls
    "federal_register", // regulatory notices
    "gpo_govinfo", // full-text CFR, regulatory source docs
    "fda_orange_book", // drug approval/exclusivity status
  ],

  // ── Macro ──────────────────────────────────────────────────
  "MACRO-CONTEXT": [
    "biorxiv",
    "bls_data", // labor market, CPI trends
    "census_bureau", // population, insurance coverage
    "who_gho", // global health trends, disease burden
    "oecd_health", // international health system benchmarks
    "cbo", // budget outlook, spending projections
    "ahrq_hcup", // healthcare utilization trends
  ],
};

/**
 * Archetypes that should receive Anthropic's native web_search server tool.
 * This is separate from MCP tools — web_search is a first-party Anthropic
 * tool passed directly in the `tools` array of messages.create().
 */
export const WEB_SEARCH_ARCHETYPES: Set<ArchetypeFamily> = new Set([
  "RESEARCHER-WEB",
  "CRITIC-FACTUAL",
  "ANALYST-STRATEGIC",
  "MACRO-CONTEXT",
  "LEGISLATIVE-PIPELINE",
  "REGULATORY-RADAR",
  "RED-TEAM",
]);

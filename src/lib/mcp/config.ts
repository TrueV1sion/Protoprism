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

// ─── Archetype → Tool Routing ────────────────────────────────
// NOTE: Archetype-to-tool routing (ARCHETYPE_TOOL_ROUTING) and
// WEB_SEARCH_ARCHETYPES have moved to src/lib/data-sources/registry.ts.
// The ToolRegistry now owns all in-process tool routing.
// MCP_SERVERS above is still used by MCPManager for remote MCP connections.

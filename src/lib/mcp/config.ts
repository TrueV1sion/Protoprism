/**
 * MCP Server Configuration
 *
 * Defines the MCP server registry, connection parameters, and
 * archetype-to-server routing for the PRISM pipeline.
 *
 * NOTE: Many healthcare-specific MCP servers (PubMed, CMS Coverage, ICD-10,
 * NPI Registry, Clinical Trials, bioRxiv) are provided as remote MCP
 * integrations by Anthropic/Claude.ai and do NOT have standalone npm packages
 * with stdio transports. The MCPManager handles missing/unavailable servers
 * gracefully — agents note unavailable tools in their `gaps` field.
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

export const MCP_SERVERS: Record<string, MCPServerConfig> = {
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
};

// ─── Archetype → Tool Routing ────────────────────────────────
// NOTE: Archetype-to-tool routing (ARCHETYPE_TOOL_ROUTING) and
// WEB_SEARCH_ARCHETYPES have moved to src/lib/data-sources/registry.ts.
// The ToolRegistry now owns all in-process tool routing.
// MCP_SERVERS above is still used by MCPManager for remote MCP connections.

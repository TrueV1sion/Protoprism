/**
 * ToolRegistry — In-Process Data Source Tool Registry
 *
 * Replaces MCPManager for the 15 Protoprism-built data sources.
 * MCPManager continues to handle the 6 Anthropic-provided remote MCP servers.
 *
 * Tool names MUST NOT contain "__" — that delimiter is reserved for
 * MCPManager qualified names (server__tool). This prevents routing collisions.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { ArchetypeFamily } from "@/lib/pipeline/types";
import type { DataSourceTool, ToolResult } from "./types";
import { ResultCache } from "./cache";
import { formatCitations } from "./format";
// Layer 2: Granular tool imports (15 modules)
import { openfdaTools } from "./tools/openfda.tools";
import { secEdgarTools } from "./tools/sec-edgar.tools";
import { federalRegisterTools } from "./tools/federal-register.tools";
import { usptoPatentsTools } from "./tools/uspto-patents.tools";
import { congressGovTools } from "./tools/congress-gov.tools";
import { blsDataTools } from "./tools/bls-data.tools";
import { censusBureauTools } from "./tools/census-bureau.tools";
import { whoGhoTools } from "./tools/who-gho.tools";
import { gpoGovinfoTools } from "./tools/gpo-govinfo.tools";
import { cboTools } from "./tools/cbo.tools";
import { oecdHealthTools } from "./tools/oecd-health.tools";
import { samGovTools } from "./tools/sam-gov.tools";
import { fdaOrangeBookTools } from "./tools/fda-orange-book.tools";
import { grantsGovTools } from "./tools/grants-gov.tools";
import { ahrqHcupTools } from "./tools/ahrq-hcup.tools";

// Layer 3: Research tool imports (13 modules)
import { drugSafetyResearchTool } from "./research/drug-safety";
import { clinicalEvidenceResearchTool } from "./research/clinical-evidence";
import { coveragePolicyResearchTool } from "./research/coverage-policy";
import { companyPositionResearchTool } from "./research/company-position";
import { regulatoryLandscapeResearchTool } from "./research/regulatory-landscape";
import { marketDynamicsResearchTool } from "./research/market-dynamics";
import { patentLandscapeResearchTool } from "./research/patent-landscape";
import { legislativeStatusResearchTool } from "./research/legislative-status";
import { providerLandscapeResearchTool } from "./research/provider-landscape";
import { globalHealthResearchTool } from "./research/global-health";
import { competitiveIntelResearchTool } from "./research/competitive-intel";
import { fundingLandscapeResearchTool } from "./research/funding-landscape";
import { qualityBenchmarksResearchTool } from "./research/quality-benchmarks";

// ─── Archetype Routing ───────────────────────────────────────

interface ArchetypeToolSet {
  research: string[];  // Layer 3 tools (listed first — Claude prefers earlier tools)
  granular: string[];  // Layer 2 tools (precision fallback)
}

// ─── WEB_SEARCH_ARCHETYPES ──────────────────────────────────

/**
 * Archetypes that receive Anthropic's native web_search server tool.
 * Moved here from src/lib/mcp/config.ts since archetype routing now
 * lives in this module. The conditional-inclusion logic stays in deploy.ts.
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

// ─── Archetype Tool Routing ──────────────────────────────────
// Maps each archetype family to the research (Layer 3) and granular (Layer 2)
// tools it should have access to. Research tools are listed first so Claude
// preferentially selects them.

export const ARCHETYPE_TOOL_ROUTING: Record<string, {
  research: string[];
  granular: string[];
}> = {
  "RESEARCHER-DATA": {
    research: ["research_clinical_evidence", "research_global_health", "research_market_dynamics"],
    granular: ["search_bls_series", "search_census_data", "search_who_indicators"],
  },
  "RESEARCHER-DOMAIN": {
    research: ["research_drug_safety", "research_coverage_policy", "research_clinical_evidence"],
    granular: ["search_drug_labels", "search_adverse_events", "search_ncd"],
  },
  "ANALYST-RISK": {
    research: ["research_drug_safety", "research_regulatory_landscape", "research_clinical_evidence", "research_coverage_policy"],
    granular: ["search_adverse_events", "search_recalls", "search_federal_register"],
  },
  "ANALYST-FINANCIAL": {
    research: ["research_company_position", "research_market_dynamics", "research_funding_landscape"],
    granular: ["search_sec_filings", "get_company_facts", "search_bls_series"],
  },
  "ANALYST-STRATEGIC": {
    research: ["research_company_position", "research_competitive_intel", "research_regulatory_landscape"],
    granular: ["search_sec_filings", "search_federal_register", "search_congress_bills"],
  },
  "ANALYST-TECHNICAL": {
    research: ["research_clinical_evidence", "research_patent_landscape", "research_drug_safety"],
    granular: ["search_clinical_trials", "search_patents", "search_drug_labels"],
  },
  "ANALYST-QUALITY": {
    research: ["research_quality_benchmarks", "research_coverage_policy", "research_global_health"],
    granular: ["search_hcup_statistics", "search_ncd", "search_who_indicators"],
  },
  "LEGISLATIVE-PIPELINE": {
    research: ["research_legislative_status", "research_regulatory_landscape", "research_coverage_policy"],
    granular: ["search_congress_bills", "search_cbo_reports", "search_govinfo"],
  },
  "REGULATORY-RADAR": {
    research: ["research_regulatory_landscape", "research_drug_safety", "research_coverage_policy"],
    granular: ["search_federal_register", "search_drug_labels", "search_govinfo"],
  },
  "MACRO-CONTEXT": {
    research: ["research_global_health", "research_market_dynamics", "research_quality_benchmarks"],
    granular: ["search_bls_series", "search_census_data", "search_oecd_indicators"],
  },
  "FUTURIST": {
    research: ["research_clinical_evidence", "research_patent_landscape", "research_competitive_intel"],
    granular: ["search_clinical_trials", "search_patents", "search_biorxiv"],
  },
  "CUSTOMER-PROXY": {
    research: ["research_provider_landscape", "research_market_dynamics"],
    granular: ["search_npi_providers", "search_census_data"],
  },
};

// ─── ToolRegistry ────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, DataSourceTool>();
  private cache: ResultCache;
  private archetypeRouting = new Map<ArchetypeFamily, ArchetypeToolSet>();

  constructor() {
    this.cache = new ResultCache();
  }

  /** Register a single tool. Validates naming convention. */
  registerTool(tool: DataSourceTool): void {
    if (tool.name.includes("__")) {
      throw new Error(
        `Tool name "${tool.name}" must not contain '__'. ` +
        `Double-underscore is reserved for MCPManager qualified names.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /** Register multiple tools at once. */
  registerTools(tools: DataSourceTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /** Set archetype routing (for testing or manual configuration). */
  setArchetypeRouting(archetype: ArchetypeFamily, toolSet: ArchetypeToolSet): void {
    this.archetypeRouting.set(archetype, toolSet);
  }

  /** Load the production archetype routing map. */
  loadDefaultRouting(routing: Record<string, ArchetypeToolSet>): void {
    for (const [archetype, toolSet] of Object.entries(routing)) {
      this.archetypeRouting.set(archetype as ArchetypeFamily, toolSet);
    }
  }

  /** Check if a tool name belongs to this registry. */
  hasToolName(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get Anthropic-format tool definitions for an archetype.
   * Research tools listed first (Claude preferentially selects earlier tools).
   */
  getToolsForArchetype(archetype: ArchetypeFamily): Anthropic.Messages.Tool[] {
    const routing = this.archetypeRouting.get(archetype);
    if (!routing) return [];

    const toolNames = [...routing.research, ...routing.granular];
    const result: Anthropic.Messages.Tool[] = [];

    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        result.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
        });
      }
    }

    return result;
  }

  /**
   * Get tool name strings for an archetype (for prompt-building in construct.ts).
   * Returns research tool names first, then granular tool names.
   */
  getToolNamesForArchetype(archetype: ArchetypeFamily): string[] {
    const routing = this.archetypeRouting.get(archetype);
    if (!routing) return [];
    return [...routing.research, ...routing.granular];
  }

  /** Get gap descriptions for tools that are in routing but not registered. */
  getGapsForArchetype(archetype: ArchetypeFamily): string[] {
    const routing = this.archetypeRouting.get(archetype);
    if (!routing) return [];

    const toolNames = [...routing.research, ...routing.granular];
    const gaps: string[] = [];

    for (const name of toolNames) {
      if (!this.tools.has(name)) {
        gaps.push(`Tool "${name}" is configured for this archetype but not available`);
      }
    }

    return gaps;
  }

  /**
   * Execute a tool by name. Results are cached per pipeline run.
   * Returns the formatted content string (markdown + citations).
   */
  async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool "${name}" in ToolRegistry`);
    }

    const result = await this.cache.getOrCompute(name, input, () =>
      tool.handler(input, this.cache),
    );

    return this.formatResult(result);
  }

  /** Reset cache (call between pipeline runs). */
  resetCache(): void {
    this.cache.clear();
  }

  /** Cache stats for observability. */
  cacheStats(): { hits: number; misses: number; entries: number } {
    return this.cache.stats();
  }

  /** Format a ToolResult into the final string returned to the agent. */
  private formatResult(result: ToolResult): string {
    const parts = [result.content];

    if (result.citations.length > 0) {
      parts.push(formatCitations(result.citations));
    }

    return parts.join("\n\n");
  }
}

// ─── Tool Initialization ────────────────────────────────────

function initializeAllTools(registry: ToolRegistry): void {
  // Layer 2: Register all 15 granular tool sets
  registry.registerTools(openfdaTools);
  registry.registerTools(secEdgarTools);
  registry.registerTools(federalRegisterTools);
  registry.registerTools(usptoPatentsTools);
  registry.registerTools(congressGovTools);
  registry.registerTools(blsDataTools);
  registry.registerTools(censusBureauTools);
  registry.registerTools(whoGhoTools);
  registry.registerTools(gpoGovinfoTools);
  registry.registerTools(cboTools);
  registry.registerTools(oecdHealthTools);
  registry.registerTools(samGovTools);
  registry.registerTools(fdaOrangeBookTools);
  registry.registerTools(grantsGovTools);
  registry.registerTools(ahrqHcupTools);

  // Layer 3: Register all 13 research tools
  registry.registerTool(drugSafetyResearchTool);
  registry.registerTool(clinicalEvidenceResearchTool);
  registry.registerTool(coveragePolicyResearchTool);
  registry.registerTool(companyPositionResearchTool);
  registry.registerTool(regulatoryLandscapeResearchTool);
  registry.registerTool(marketDynamicsResearchTool);
  registry.registerTool(patentLandscapeResearchTool);
  registry.registerTool(legislativeStatusResearchTool);
  registry.registerTool(providerLandscapeResearchTool);
  registry.registerTool(globalHealthResearchTool);
  registry.registerTool(competitiveIntelResearchTool);
  registry.registerTool(fundingLandscapeResearchTool);
  registry.registerTool(qualityBenchmarksResearchTool);

  // Load archetype routing
  registry.loadDefaultRouting(ARCHETYPE_TOOL_ROUTING);
}

// ─── Singleton ───────────────────────────────────────────────

let registryInstance: ToolRegistry | null = null;

/**
 * Get the singleton ToolRegistry instance.
 * Call once at app startup; subsequent calls return the same instance.
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    initializeAllTools(registryInstance);
  }
  return registryInstance;
}

/** Reset the singleton (for testing). */
export function resetToolRegistry(): void {
  registryInstance = null;
}

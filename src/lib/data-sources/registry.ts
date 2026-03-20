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
import { CrossRunCache, CACHE_TTL } from "@/lib/cache/cross-run-cache";
import { formatCitations } from "./format";
// Layer 2: Granular tool imports (22 modules)
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
import { datasetQueryTools } from "./tools/dataset-query.tools";
import { feedSearchTools } from "./tools/feed-search.tools";
import { openSecretsTools } from "./tools/opensecrets.tools";
import { cmsOpenPaymentsTools } from "./tools/cms-open-payments.tools";
import { hospitalCompareTools } from "./tools/hospital-compare.tools";
import { sbirGovTools } from "./tools/sbir-gov.tools";
import { leapfrogTools } from "./tools/leapfrog.tools";
import { signalQueryTools } from "./tools/signal-query.tools";

// Layer 3: Research tool imports (19 modules)
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
import { datasetIntelligenceResearchTool } from "./research/dataset-intelligence";
import { newsIntelligenceResearchTool } from "./research/news-intelligence";
import { lobbyingInfluenceResearchTool } from "./research/lobbying-influence";
import { providerQualityResearchTool } from "./research/provider-quality";
import { innovationFundingResearchTool } from "./research/innovation-funding";
import { crossSourceCorrelationResearchTool } from "./research/cross-source-correlation";

// ─── Tag-Based Router ───────────────────────────────────────

/** Maximum tools returned by tag-based matching for a single archetype. */
const MAX_TOOLS_PER_ARCHETYPE = 8;

/**
 * Tag-based tool routing. Computes tool sets by intersecting
 * archetype tags with tool routingTags. ARCHETYPE_TOOL_ROUTING
 * is the explicit override layer — if an entry exists there,
 * it takes precedence over tag-based matching.
 */
export class TagBasedRouter {
  private tagIndex = new Map<string, Set<string>>(); // tag → tool names

  /** Build index from registered tools. */
  buildIndex(tools: Map<string, DataSourceTool>): void {
    this.tagIndex.clear();
    for (const [name, tool] of tools) {
      for (const tag of tool.routingTags ?? []) {
        let toolSet = this.tagIndex.get(tag);
        if (!toolSet) {
          toolSet = new Set();
          this.tagIndex.set(tag, toolSet);
        }
        toolSet.add(name);
      }
    }
  }

  /** Find tools matching ANY of the given tags, scored by overlap count. */
  matchTools(tags: string[], tools: Map<string, DataSourceTool>): DataSourceTool[] {
    const scores = new Map<string, number>();
    for (const tag of tags) {
      const matchingTools = this.tagIndex.get(tag);
      if (matchingTools) {
        for (const toolName of matchingTools) {
          scores.set(toolName, (scores.get(toolName) ?? 0) + 1);
        }
      }
    }

    // Sort by: score descending, then layer 3 before layer 2
    return Array.from(scores.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]; // Higher score first
        const toolA = tools.get(a[0])!;
        const toolB = tools.get(b[0])!;
        return toolB.layer - toolA.layer; // Layer 3 before Layer 2
      })
      .map(([name]) => tools.get(name)!)
      .filter(Boolean);
  }
}

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
  // Phase 1 additions
  "MA-SIGNAL-HUNTER",
  "VC-SCOUT",
  "TALENT-TRACKER",
  "INFLUENCE-MAPPER",
  "SUPPLY-CHAIN-TRACKER",
  "SENTINEL",
  "BENCHMARKER",
  "DILIGENCE-AUDITOR",
  "ECOSYSTEM-MAPPER",
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
    research: ["research_dataset_trends", "research_clinical_evidence", "research_global_health", "research_market_dynamics"],
    granular: ["search_dataset_deltas", "query_cms_data", "search_bls_series", "search_census_data"],
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
    research: ["research_news_intelligence", "research_company_position", "research_competitive_intel", "research_regulatory_landscape"],
    granular: ["search_feed_items", "search_sec_filings", "search_federal_register", "search_congress_bills"],
  },
  "ANALYST-TECHNICAL": {
    research: ["research_clinical_evidence", "research_patent_landscape", "research_drug_safety"],
    granular: ["search_clinical_trials", "search_patents", "search_drug_labels"],
  },
  "ANALYST-QUALITY": {
    research: ["research_quality_benchmarks", "research_dataset_trends", "research_coverage_policy", "research_global_health"],
    granular: ["search_hcup_statistics", "search_dataset_deltas", "query_cms_data", "search_ncd"],
  },
  "LEGISLATIVE-PIPELINE": {
    research: ["research_news_intelligence", "research_legislative_status", "research_regulatory_landscape", "research_coverage_policy"],
    granular: ["search_feed_items", "search_congress_bills", "search_cbo_reports", "search_govinfo"],
  },
  "REGULATORY-RADAR": {
    research: ["research_news_intelligence", "research_regulatory_landscape", "research_drug_safety", "research_coverage_policy"],
    granular: ["search_feed_items", "search_federal_register", "search_drug_labels", "search_govinfo"],
  },
  "MACRO-CONTEXT": {
    research: ["research_news_intelligence", "research_global_health", "research_market_dynamics", "research_quality_benchmarks"],
    granular: ["search_feed_items", "search_bls_series", "search_census_data", "search_oecd_indicators"],
  },
  "FUTURIST": {
    research: ["research_clinical_evidence", "research_patent_landscape", "research_competitive_intel"],
    granular: ["search_clinical_trials", "search_patents", "search_biorxiv"],
  },
  "CUSTOMER-PROXY": {
    research: ["research_provider_landscape", "research_market_dynamics"],
    granular: ["search_npi_providers", "search_census_data"],
  },
  "DATA-CURATOR": {
    research: ["research_dataset_trends", "research_quality_benchmarks"],
    granular: ["search_dataset_deltas", "query_cms_data"],
  },
  "MA-SIGNAL-HUNTER": {
    research: ["research_dataset_trends", "research_market_dynamics", "research_competitive_intel"],
    granular: ["search_dataset_deltas", "query_cms_data", "search_sec_filings", "search_signals"],
  },
  "PAYER-ANALYST": {
    research: ["research_dataset_trends", "research_coverage_policy", "research_market_dynamics"],
    granular: ["search_dataset_deltas", "query_cms_data", "search_ncd"],
  },
  "PROVIDER-MAPPER": {
    research: ["research_provider_quality", "research_dataset_trends", "research_provider_landscape"],
    granular: ["search_hospital_quality", "search_hospital_safety_grades", "search_dataset_deltas", "query_cms_data", "search_npi_providers"],
  },
  "SENTINEL": {
    research: ["research_cross_source_patterns", "research_news_intelligence", "research_dataset_trends", "research_regulatory_landscape"],
    granular: ["search_signals", "search_alerts", "search_feed_items", "search_dataset_deltas"],
  },
  // Phase 5: New API-powered archetypes
  "INFLUENCE-MAPPER": {
    research: ["research_lobbying_influence", "research_competitive_intel"],
    granular: ["search_lobbying_activity", "search_pac_contributions", "search_campaign_contributions"],
  },
  "VC-SCOUT": {
    research: ["research_innovation_funding", "research_patent_landscape"],
    granular: ["search_sbir_awards", "search_health_innovation_grants", "search_patents"],
  },
  "DILIGENCE-AUDITOR": {
    research: ["research_company_position", "research_lobbying_influence", "research_provider_quality"],
    granular: ["search_sec_filings", "search_lobbying_activity", "search_physician_payments"],
  },
  "BENCHMARKER": {
    research: ["research_quality_benchmarks", "research_provider_quality"],
    granular: ["search_hospital_quality", "search_hospital_safety_grades", "search_patient_experience"],
  },
  "ECOSYSTEM-MAPPER": {
    research: ["research_competitive_intel", "research_innovation_funding"],
    granular: ["search_sec_filings", "search_sbir_awards", "search_feed_items"],
  },
  "NETWORK-ANALYST": {
    research: ["research_lobbying_influence", "research_provider_quality"],
    granular: ["search_physician_payments", "search_lobbying_activity", "search_company_payments"],
  },
  // Phase 2/3: Feed + Dataset archetypes
  "SIGNAL-CORRELATOR": {
    research: ["research_cross_source_patterns", "research_news_intelligence", "research_dataset_trends"],
    granular: ["search_signals", "search_alerts", "search_feed_items", "search_dataset_deltas"],
  },
  "MA-INTEGRATOR": {
    research: ["research_dataset_trends", "research_market_dynamics"],
    granular: ["search_dataset_deltas", "query_cms_data", "search_sec_filings"],
  },
  "TALENT-TRACKER": {
    research: ["research_news_intelligence"],
    granular: ["search_feed_items"],
  },
  "RESEARCHER-WEB": {
    research: ["research_news_intelligence"],
    granular: ["search_feed_items"],
  },
  "HISTORIAN": {
    research: ["research_dataset_trends"],
    granular: ["search_dataset_deltas", "query_cms_data"],
  },
  "SUPPLY-CHAIN-TRACKER": {
    research: ["research_drug_safety", "research_patent_landscape"],
    granular: ["search_drug_labels", "search_510k", "search_feed_items"],
  },
  "PRICING-STRATEGIST": {
    research: ["research_market_dynamics", "research_coverage_policy"],
    granular: ["search_bls_series", "query_cms_data", "search_census_data"],
  },
};

// ─── TTL Resolution ──────────────────────────────────────────

/**
 * Maps tool name prefixes to TTL categories for cross-run caching.
 * Tools matching these prefixes get the corresponding TTL when cached in Redis.
 * Default TTL (4h) applies when no prefix matches.
 */
export const TOOL_TTL_MAP: Record<string, keyof typeof CACHE_TTL> = {
  // Government data sources — slow-changing (24h)
  "search_congress": "government",
  "search_federal_register": "government",
  "search_govinfo": "government",
  "search_cbo": "government",
  "search_grants": "government",
  "search_sam_": "government",
  "search_ncd": "government",
  "search_hospital_quality": "government",
  "search_hospital_safety": "government",
  "search_sbir": "government",
  "search_physician_payments": "government",
  "search_company_payments": "government",
  "query_cms_data": "government",
  // Feed tools — update frequently (1h)
  "search_feed_items": "rss",
  "research_news_intelligence": "rss",
  // Dataset tools — snapshot-based (6h)
  "search_dataset_deltas": "dataset",
  "research_dataset_trends": "dataset",
  // Signal tools — real-time (15m)
  "search_signals": "realtime",
  "search_alerts": "realtime",
  // Cross-source research — update frequently (1h)
  "research_cross_source_patterns": "rss",
  // Real-time tools — short TTL (15m)
  "search_adverse_events": "realtime",
  "search_sec_filings": "realtime",
  "search_lobbying": "realtime",
  "search_pac_contributions": "realtime",
  "search_campaign_contributions": "realtime",
};

/** Resolve TTL category for a tool by matching its name against prefix map. */
function resolveToolTTL(toolName: string): keyof typeof CACHE_TTL {
  for (const [prefix, category] of Object.entries(TOOL_TTL_MAP)) {
    if (toolName.startsWith(prefix)) return category;
  }
  return "default";
}

// ─── ToolRegistry ────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, DataSourceTool>();
  private cache: ResultCache;
  private archetypeRouting = new Map<ArchetypeFamily, ArchetypeToolSet>();
  private tagRouter = new TagBasedRouter();
  /** Per-TTL CrossRunCache instances — shared across tools with same TTL */
  private crossRunCaches = new Map<string, CrossRunCache>();

  constructor() {
    // Default cache uses CrossRunCache for L1+L2 persistence
    const defaultCrossRun = new CrossRunCache(CACHE_TTL.default);
    this.cache = ResultCache.withCrossRunCache(defaultCrossRun);
    this.crossRunCaches.set("default", defaultCrossRun);
  }

  /** Get or create a CrossRunCache for a specific TTL category. */
  private getCrossRunCache(ttlCategory: keyof typeof CACHE_TTL): CrossRunCache {
    const existing = this.crossRunCaches.get(ttlCategory);
    if (existing) return existing;
    const cache = new CrossRunCache(CACHE_TTL[ttlCategory]);
    this.crossRunCaches.set(ttlCategory, cache);
    return cache;
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

  /** Build the tag-based routing index from all registered tools. */
  buildTagIndex(): void {
    this.tagRouter.buildIndex(this.tools);
  }

  /** Check if a tool name belongs to this registry. */
  hasToolName(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get Anthropic-format tool definitions for an archetype.
   *
   * 1. Check ARCHETYPE_TOOL_ROUTING first (explicit override takes precedence).
   * 2. If no explicit routing, look up archetype tags from ARCHETYPE_REGISTRY
   *    and use tagRouter.matchTools() for tag-based matching.
   * 3. Cap at MAX_TOOLS_PER_ARCHETYPE tools, research tools first.
   */
  getToolsForArchetype(archetype: ArchetypeFamily): Anthropic.Messages.Tool[] {
    // 1. Explicit routing — takes precedence
    const routing = this.archetypeRouting.get(archetype);
    if (routing) {
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

    // 2. Tag-based matching — lazy import of archetype registry
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ARCHETYPE_REGISTRY } = require("@/lib/pipeline/archetypes");
      const profile = ARCHETYPE_REGISTRY[archetype];
      if (!profile?.tags || profile.tags.length === 0) return [];

      const matched = this.tagRouter.matchTools(profile.tags, this.tools);
      return matched.slice(0, MAX_TOOLS_PER_ARCHETYPE).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
      }));
    } catch {
      // ARCHETYPE_REGISTRY not available — return empty
      return [];
    }
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
   * Execute a tool by name. Results are cached per pipeline run with
   * TTL-aware cross-run caching (L1 in-memory + L2 Redis).
   * Returns the formatted content string (markdown + citations).
   */
  async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool "${name}" in ToolRegistry`);
    }

    // Resolve TTL-appropriate cross-run cache for this tool
    const ttlCategory = resolveToolTTL(name);
    const crossRunCache = this.getCrossRunCache(ttlCategory);
    const ttlCache = ResultCache.withCrossRunCache(crossRunCache);

    const result = await ttlCache.getOrCompute(name, input, () =>
      tool.handler(input, this.cache),
    );

    return this.formatResult(result);
  }

  /** Reset cache (call between pipeline runs). Clears per-run L0 caches only. */
  resetCache(): void {
    this.cache.clear();
  }

  /** Cache stats for observability — includes per-TTL cross-run stats. */
  cacheStats(): {
    hits: number;
    misses: number;
    entries: number;
    crossRun?: { l1Hits: number; l2Hits: number; misses: number; l1Entries: number };
    ttlCaches: Record<string, { l1Hits: number; l2Hits: number; misses: number; l1Entries: number }>;
  } {
    const base = this.cache.stats();
    const ttlCaches: Record<string, { l1Hits: number; l2Hits: number; misses: number; l1Entries: number }> = {};
    for (const [category, cache] of this.crossRunCaches) {
      ttlCaches[category] = cache.stats();
    }
    return { ...base, ttlCaches };
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
  // Layer 2: Register all 17 granular tool sets
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
  registry.registerTools(datasetQueryTools);
  registry.registerTools(feedSearchTools);
  registry.registerTools(openSecretsTools);
  registry.registerTools(cmsOpenPaymentsTools);
  registry.registerTools(hospitalCompareTools);
  registry.registerTools(sbirGovTools);
  registry.registerTools(leapfrogTools);
  registry.registerTools(signalQueryTools);

  // Layer 3: Register all 19 research tools
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
  registry.registerTool(datasetIntelligenceResearchTool);
  registry.registerTool(newsIntelligenceResearchTool);
  registry.registerTool(lobbyingInfluenceResearchTool);
  registry.registerTool(providerQualityResearchTool);
  registry.registerTool(innovationFundingResearchTool);
  registry.registerTool(crossSourceCorrelationResearchTool);

  // Load archetype routing
  registry.loadDefaultRouting(ARCHETYPE_TOOL_ROUTING);

  // Build tag-based routing index
  registry.buildTagIndex();
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

// ─── Structured Data Extractor ────────────────────────────────────────────────

/**
 * Derives a structured data record from a ToolResult for use in the template
 * pipeline's data-aware planning and chart compilation.
 *
 * - If the result already carries explicit `structuredData`, that is returned
 *   as-is without merging.
 * - Otherwise, citation `resultCount` values are projected into
 *   `citation_result_counts` and any markdown tables in `content` are parsed
 *   into `table_N` arrays of `{ label, period, value }` records.
 * - Returns `undefined` when no structured data can be derived.
 */
export function buildStructuredDataFromResult(
  result: ToolResult,
): Record<string, unknown> | undefined {
  if (result.structuredData) {
    return result.structuredData;
  }

  const out: Record<string, unknown> = {};

  // Project citation result counts.
  // `period` mirrors `label` (the source name) because citation metadata does
  // not carry temporal granularity — the chart compiler uses `period` as the
  // x-axis label, so the source name is the most meaningful fallback here.
  const citationCounts = result.citations
    .filter((c) => c.resultCount !== undefined)
    .map((c) => ({
      label: c.source,
      period: c.source,
      value: c.resultCount as number,
      query: c.query,
    }));

  if (citationCounts.length > 0) {
    out.citation_result_counts = citationCounts;
  }

  // Parse markdown tables from content
  const lines = result.content.split("\n");
  let tableIdx = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (
      line.startsWith("|") &&
      i + 1 < lines.length &&
      /^\|[-: |]+\|$/.test(lines[i + 1].trim())
    ) {
      // Skip header row and separator
      i += 2;

      const rows: { label: string; period: string; value: number }[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (cells.length >= 2) {
          const label = cells[0];
          const value = Number(cells[1]);
          if (!isNaN(value)) {
            // `period` mirrors `label` (first column) because generic markdown
            // tables may not have an explicit time dimension; the chart compiler
            // uses `period` as the x-axis category label.
            rows.push({ label, period: label, value });
          }
        }
        i++;
      }

      if (rows.length > 0) {
        out[`table_${tableIdx}`] = rows;
        tableIdx++;
      }

      continue;
    }
    i++;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

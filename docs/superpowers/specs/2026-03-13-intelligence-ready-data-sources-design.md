# Intelligence-Ready Data Source Architecture

**Date**: 2026-03-13
**Status**: Approved
**Scope**: Replace 15 MCP sidecar servers with a three-layer in-process data source architecture that maximizes agent analytical output quality.

---

## Problem

PRISM pipeline agents spend ~60% of their 15-turn tool-use budget on data retrieval and parsing raw API JSON rather than analysis. The current architecture — 15 standalone MCP servers on ports 3010-3024 — returns raw API responses that are:

1. **Token-inefficient**: ~200 tokens of signal buried in ~2,500 tokens of JSON noise (pagination metadata, boilerplate fields, nested structures)
2. **Context-hostile**: Agents accumulate 50K+ tokens of raw JSON before they begin synthesis
3. **Correlation-blind**: Cross-source insights require multiple turns of manual correlation
4. **Citation-poor**: Agents produce vague citations ("openFDA data") instead of specific references
5. **Operationally fragile**: 15 Node processes, 15 ports, connection failures degrade analysis silently
6. **Undeployable**: Localhost MCP servers don't translate to production hosting

## Solution

Three-layer in-process data source architecture with intelligence-formatted responses at every layer.

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  PRISM Agent (Claude)                           │
│  15 turns · selects tools · analyzes results    │
├─────────────────────────────────────────────────┤
│  Layer 3: Research Tools (primary interface)     │
│  ~13 compound tools                             │
│  research_drug_safety() · research_regulatory() │
│  → Multiple API calls + extraction + formatting │
│  → Returns intelligence packets (markdown)      │
├─────────────────────────────────────────────────┤
│  Layer 2: Granular Tools (precision fallback)    │
│  ~60 individual tools                           │
│  search_adverse_events() · search_filings()     │
│  → Single API call + smart formatting           │
│  → Markdown-formatted, LLM-optimized responses  │
├─────────────────────────────────────────────────┤
│  Layer 1: API Clients (internal, not exposed)    │
│  15 client modules                              │
│  openfda.ts · sec-edgar.ts · clinical-trials.ts │
│  → Raw fetch(), auth, rate limits, pagination   │
│  → Typed responses, error handling              │
└─────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Signal density over data volume**: Every token in a tool response should carry analytical value. Strip noise, format for LLM readability.
2. **Turn efficiency**: Compound research tools do 3-5 API calls in 1 agent turn. Agents spend turns on analysis, not data gathering.
3. **Pre-correlation**: Research tools cross-reference data across sources before returning. Agents receive connected insights, not isolated data points.
4. **Citation-ready**: Every response includes pre-formatted citation blocks that agents can directly reference in findings.
5. **Data vintage tracking**: Every response declares data freshness. Agents know when they're working with stale data.
6. **Shared caching**: Per-pipeline-run cache prevents redundant API calls across agents and ensures data consistency.

---

## File Structure

```
src/lib/data-sources/
  ── Layer 1: API Clients ──
  clients/
    openfda.ts
    sec-edgar.ts
    federal-register.ts
    uspto-patents.ts
    congress-gov.ts
    bls-data.ts
    census-bureau.ts
    who-gho.ts
    gpo-govinfo.ts
    cbo.ts
    oecd-health.ts
    sam-gov.ts
    fda-orange-book.ts
    grants-gov.ts
    ahrq-hcup.ts

  ── Layer 2: Granular Tools ──
  tools/
    openfda.tools.ts
    sec-edgar.tools.ts
    federal-register.tools.ts
    uspto-patents.tools.ts
    congress-gov.tools.ts
    bls-data.tools.ts
    census-bureau.tools.ts
    who-gho.tools.ts
    gpo-govinfo.tools.ts
    cbo.tools.ts
    oecd-health.tools.ts
    sam-gov.tools.ts
    fda-orange-book.tools.ts
    grants-gov.tools.ts
    ahrq-hcup.tools.ts

  ── Layer 3: Research Tools ──
  research/
    drug-safety.ts           ← openFDA AE + labels + Orange Book
    clinical-evidence.ts     ← PubMed + ClinicalTrials + bioRxiv
    coverage-policy.ts       ← CMS NCD/LCD + ICD-10
    company-position.ts      ← SEC EDGAR + SAM.gov + patents
    regulatory-landscape.ts  ← Fed Register + CMS + Congress + GPO
    market-dynamics.ts       ← BLS + Census + OECD
    patent-landscape.ts      ← USPTO + FDA Orange Book
    legislative-status.ts    ← Congress + CBO + GPO
    provider-landscape.ts    ← NPI + Census
    global-health.ts         ← WHO + OECD + AHRQ
    competitive-intel.ts     ← SEC + patents + trials + FDA
    funding-landscape.ts     ← Grants.gov + SAM.gov
    quality-benchmarks.ts    ← AHRQ HCUP + CMS + WHO

  ── Infrastructure ──
  registry.ts                ← ToolRegistry (replaces MCPManager for Protoprism sources)
  cache.ts                   ← Per-pipeline-run result cache
  types.ts                   ← DataSourceTool, IntelligencePacket, ToolResult interfaces
  format.ts                  ← Shared markdown formatting helpers
```

---

## Layer 1: API Clients

Pure HTTP fetch wrappers. Internal only — never exposed to agents.

### Interface

```typescript
// src/lib/data-sources/types.ts

interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;           // From env var, optional
  userAgent?: string;        // Required by some APIs (SEC EDGAR)
  rateLimitMs?: number;      // Minimum ms between requests
  timeoutMs?: number;        // Request timeout (default: 15000)
  maxRetries?: number;       // Retry on transient failures (default: 2)
}

interface ApiResponse<T> {
  data: T;
  status: number;
  vintage: DataVintage;      // When was this data last updated?
}

interface DataVintage {
  queriedAt: string;         // ISO timestamp of the API call
  dataThrough?: string;      // "2024-Q4", "2025-01", etc. (API-specific)
  source: string;            // "openFDA FAERS", "BLS CES", etc.
}
```

### Responsibilities
- HTTP fetch with retry (exponential backoff, 2 retries)
- Auth header injection (API keys from env vars)
- Rate limiting (per-client token bucket — see Rate Limiting below)
- Timeout handling (15s default)
- Response typing (Zod validation of API responses)
- Pagination support (auto-paginate up to N pages for compound tools)
- Data vintage extraction (parse API metadata for freshness info)

### Rate Limiting

Two layers of rate limiting prevent overwhelming upstream APIs:

**Per-client rate limiter** (token bucket): Each Layer 1 client has a configurable requests-per-second limit based on the upstream API's documented rate limits. Defaults:

| API | Rate Limit | Notes |
|-----|-----------|-------|
| openFDA | 4 req/s | 240/min without API key |
| SEC EDGAR | 10 req/s | Fair access policy |
| BLS | 2 req/s | Conservative; no key = 25/day |
| Census Bureau | 5 req/s | With API key |
| Others | 3 req/s | Safe default |

**Global concurrency limiter**: A shared semaphore limits total concurrent outbound API requests across all clients to **20** simultaneous requests. This prevents a PRISM pipeline with 20+ parallel agents from sending 40+ simultaneous requests. Agents that exceed the limit await the semaphore — they don't fail.

```typescript
// src/lib/data-sources/rate-limit.ts
class GlobalRateLimiter {
  private semaphore: number;        // Current available slots
  private readonly maxConcurrent: number;  // Default: 20
  private queue: Array<() => void>; // Waiting requests

  async acquire(): Promise<void> { ... }
  release(): void { ... }
}
```

Layer 1 clients call `globalLimiter.acquire()` before every fetch and `globalLimiter.release()` after. The ResultCache further reduces pressure — cached responses bypass the limiter entirely.

### Error Handling
- Transient errors (429, 503): retry with backoff
- Client errors (400, 404): return structured error with context
- Auth errors (401, 403): return error noting missing API key
- Timeout: return partial results if any, error if none

---

## Layer 2: Granular Tools

Individual tool definitions wrapping single API calls. Available to agents as precision fallback. The critical difference from current MCP tools: **responses are markdown-formatted and LLM-optimized, not raw JSON.**

### Interface

```typescript
// src/lib/data-sources/types.ts

interface DataSourceTool {
  name: string;                    // e.g., "search_adverse_events"
  description: string;             // LLM-facing description
  inputSchema: Record<string, unknown>;  // JSON Schema for tool input
  handler: (input: Record<string, unknown>, cache: ResultCache) => Promise<ToolResult>;
  layer: 2 | 3;                   // Which layer this tool belongs to
  sources: string[];               // Which API clients this tool uses
}

interface ToolResult {
  content: string;                 // Markdown-formatted response
  citations: Citation[];           // Pre-formatted source citations
  vintage: DataVintage;            // Data freshness
  confidence: "HIGH" | "MEDIUM" | "LOW";  // Data completeness
  truncated: boolean;              // Whether results were truncated
}

interface Citation {
  id: string;                      // e.g., "[FAERS-ADA-2024]"
  source: string;                  // e.g., "openFDA FAERS"
  query: string;                   // The actual query made
  dateRange?: string;              // If applicable
  resultCount?: number;            // How many results matched
}
```

### Response Formatting Rules

All Layer 2 responses follow these rules:
1. **No raw JSON** — always markdown tables, bullet points, or structured text
2. **Lead with key data** — most important information first
3. **Strip noise** — no pagination metadata, no boilerplate fields, no empty/null fields
4. **Table format for tabular data** — markdown tables, max 20 rows, sorted by relevance
5. **Citation block at end** — pre-formatted for agent copy-paste
6. **Character budget**: 4,000 chars max (smart truncation, not byte-position)

### Smart Truncation

When results exceed the character budget:
1. Keep the header/summary section (always)
2. Keep the citation block (always)
3. Truncate the data section — prefer fewer rows of complete data over many rows of truncated data
4. Add a note: "Showing top 15 of 847 results. Use more specific filters for complete data."

---

## Layer 3: Research Tools

Compound tools that combine multiple API calls + programmatic extraction into pre-analyzed intelligence packets. This is the primary agent interface.

### Research Tool Catalog

| Tool | Sources Combined | Use Case |
|------|-----------------|----------|
| `research_drug_safety` | openFDA AE + labels + Orange Book | Drug safety profile, AE trends, label warnings, patent/exclusivity status |
| `research_clinical_evidence` | PubMed + ClinicalTrials + bioRxiv | Evidence landscape for a condition/intervention, trial pipeline |
| `research_coverage_policy` | CMS NCD/LCD + ICD-10 | Medicare coverage landscape, coding requirements |
| `research_company_position` | SEC EDGAR + SAM.gov + USPTO | Company financial profile, government contracts, IP position |
| `research_regulatory_landscape` | Fed Register + CMS + Congress + GPO | Active regulatory activity for a topic |
| `research_market_dynamics` | BLS + Census + OECD | Labor market, demographic, and economic context |
| `research_patent_landscape` | USPTO + FDA Orange Book | IP landscape, patent expiry timelines, exclusivity windows |
| `research_legislative_status` | Congress + CBO + GPO | Bill tracking, cost estimates, legislative history |
| `research_provider_landscape` | NPI + Census | Provider density, demographics, specialty distribution |
| `research_global_health` | WHO + OECD + AHRQ | International health system benchmarks, disease burden |
| `research_competitive_intel` | SEC + patents + trials + FDA | Multi-dimensional competitive analysis |
| `research_funding_landscape` | Grants.gov + SAM.gov | Federal funding opportunities and contract awards |
| `research_quality_benchmarks` | AHRQ HCUP + CMS + WHO | Healthcare quality and utilization metrics |

### Intelligence Packet Format

Every Layer 3 tool returns a markdown intelligence packet:

```markdown
## [Topic]: [Entity/Subject]
**Confidence**: HIGH/MEDIUM/LOW | **Sources**: N/M returned data | **Data through**: [vintage]

### Key Intelligence
1. [Most important finding — one sentence with key metric]
2. [Second finding]
3. [Third finding]
(3-5 bullets, ranked by importance)

### [Domain-Specific Section 1]
| Metric | Value | Trend | Period |
|--------|-------|-------|--------|
(Structured data, max 10 rows)

### [Domain-Specific Section 2]
(Varies by tool — could be another table, bullet list, or narrative)

### Citations
[ID-1] Source: query details | date range | N results
[ID-2] Source: query details | date range | N results

### Suggested Follow-ups
→ tool_name("query") — reason to investigate
→ tool_name("query") — reason to investigate
```

### Layer 3 Input Schemas

All Layer 3 research tools accept a single `query` string plus optional filters. The `query` is the primary entity or topic — research tools decide internally how to decompose it into API-specific queries.

```typescript
// Common pattern for all Layer 3 tools
interface ResearchToolInput {
  query: string;           // Primary entity: drug name, company name, condition, topic
  timeframe?: string;      // "1y", "3y", "5y" — default varies by tool
  focus?: string;          // Tool-specific focus area (optional)
}
```

**Per-tool input schemas:**

| Tool | `query` examples | `focus` options | Default `timeframe` |
|------|-----------------|-----------------|---------------------|
| `research_drug_safety` | "adalimumab", "Keytruda" | "adverse_events", "labels", "patents" | 3y |
| `research_clinical_evidence` | "GLP-1 diabetes", "CAR-T lymphoma" | "trials", "publications", "preprints" | 5y |
| `research_coverage_policy` | "CGM devices", "cardiac rehab" | "national", "local", "coding" | — |
| `research_company_position` | "Pfizer", "Illumina" | "financial", "contracts", "ip" | 2y |
| `research_regulatory_landscape` | "AI diagnostics", "biosimilars" | "proposed", "final", "legislative" | 1y |
| `research_market_dynamics` | "home health", "nursing workforce" | "employment", "demographics", "spending" | 3y |
| `research_patent_landscape` | "mRNA vaccines", "CRISPR" | "grants", "expirations", "assignees" | 5y |
| `research_legislative_status` | "drug pricing", "telehealth" | "active", "enacted", "hearings" | 2y |
| `research_provider_landscape` | "oncology", "rural health" | "density", "specialties", "demographics" | — |
| `research_global_health` | "antimicrobial resistance", "maternal mortality" | "burden", "spending", "workforce" | 5y |
| `research_competitive_intel` | "Novo Nordisk obesity", "Medtronic diabetes" | "pipeline", "financial", "ip" | 3y |
| `research_funding_landscape` | "cancer research", "health IT" | "grants", "contracts", "forecasts" | 1y |
| `research_quality_benchmarks` | "heart failure readmissions", "sepsis" | "utilization", "outcomes", "cost" | 3y |

When `focus` is omitted, the research tool queries all its sources. When provided, it prioritizes the focused area (more detail, fewer sources queried).

### Compound Query Logic

Each research tool follows this pattern:
1. Make 2-5 API calls in parallel (via Layer 1 clients)
2. Extract relevant fields programmatically (no internal LLM calls)
3. Cross-reference results (e.g., match patent expiry dates with biosimilar trial timelines)
4. Compute derived metrics (e.g., YoY trend from multi-year data)
5. Format into intelligence packet with citations
6. Assess confidence based on data completeness (all sources returned? data fresh?)

### Character Budget

Layer 3 intelligence packets have a **6,000 character budget**. When the combined output exceeds this:
1. Keep the header line (Confidence/Sources/Vintage) — always
2. Keep Key Intelligence bullets — always (these are the highest-value content)
3. Keep Citations block — always
4. Truncate data tables to fewer rows (prefer 5 complete rows over 10 truncated)
5. Drop Suggested Follow-ups section if still over budget
6. Add note: "Intelligence packet truncated. Use granular tools for detailed data."

### Confidence Scoring

Each research tool declares its **expected sources** — the data sources it attempts to query. Confidence is assessed as:

```
HIGH:   All expected sources returned ≥1 result, data within 6 months
MEDIUM: 1+ sources returned zero results OR any source data older than 6 months
LOW:    1+ sources failed (network/API error) OR majority of data older than 12 months
```

Key distinction:
- **Zero results** (query succeeded, no matches) → MEDIUM. The absence of data is itself a finding.
- **Source failure** (network error, timeout, 5xx) → LOW. Data quality cannot be assessed.
- **Source not configured** (e.g., MCP server not connected) → LOW, and noted in the intelligence packet.

---

## Infrastructure

### ToolRegistry

Replaces MCPManager for the 15 Protoprism data sources. MCPManager continues to handle the 6 Anthropic-provided remote MCP servers (PubMed, ClinicalTrials, CMS Coverage, ICD-10, NPI Registry, bioRxiv).

```typescript
// src/lib/data-sources/registry.ts

class ToolRegistry {
  private tools: Map<string, DataSourceTool>;
  private cache: ResultCache;

  constructor() {
    this.tools = new Map();
    this.cache = new ResultCache();
    this.registerAllTools();
  }

  /** Get Anthropic-format tool definitions for an archetype */
  getToolsForArchetype(archetype: ArchetypeFamily): Anthropic.Messages.ToolUnion[] { ... }

  /** Execute a tool by name, with caching */
  async executeTool(name: string, input: Record<string, unknown>): Promise<string> { ... }

  /** Check if a tool name belongs to this registry */
  hasToolName(name: string): boolean { ... }

  /** Reset cache (call between pipeline runs) */
  resetCache(): void { ... }
}
```

### ResultCache

Per-pipeline-run cache keyed by (tool_name, input_hash). Uses **promise coalescing** to prevent redundant API calls when parallel agents request the same data simultaneously.

```typescript
// src/lib/data-sources/cache.ts

interface CacheEntry {
  result: ToolResult;
  createdAt: number;        // Date.now() — for observability, not expiry
}

class ResultCache {
  private store: Map<string, CacheEntry>;
  private inflight: Map<string, Promise<ToolResult>>;  // Promise coalescing
  private hits: number;
  private misses: number;

  /**
   * Get or compute a cached result. If another agent is already
   * fetching the same (tool, input), this awaits the same promise
   * instead of making a duplicate API call.
   */
  async getOrCompute(
    toolName: string,
    input: Record<string, unknown>,
    compute: () => Promise<ToolResult>
  ): Promise<ToolResult> {
    const key = this.cacheKey(toolName, input);

    // 1. Check completed cache
    const cached = this.store.get(key);
    if (cached) { this.hits++; return cached.result; }

    // 2. Check inflight — another agent already computing this
    const inflight = this.inflight.get(key);
    if (inflight) { this.hits++; return inflight; }

    // 3. Cache miss — compute and share the promise
    this.misses++;
    const promise = compute().then(result => {
      this.store.set(key, { result, createdAt: Date.now() });
      this.inflight.delete(key);
      return result;
    }).catch(err => {
      this.inflight.delete(key);
      throw err;
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Clear all entries (call between pipeline runs) */
  clear(): void { this.store.clear(); this.inflight.clear(); this.hits = 0; this.misses = 0; }

  /** Cache stats for observability */
  stats(): { hits: number; misses: number; entries: number } {
    return { hits: this.hits, misses: this.misses, entries: this.store.size };
  }

  private cacheKey(toolName: string, input: Record<string, unknown>): string {
    return `${toolName}::${JSON.stringify(input, Object.keys(input).sort())}`;
  }
}
```

Cache benefits:
- 8-12 agents researching the same entity make 1 API call instead of 12
- **Promise coalescing**: if 3 agents call `search_adverse_events("adalimumab")` simultaneously, the first triggers the API call and the other 2 await the same promise
- All agents see identical data → consistent findings → better synthesis
- Cache hit returns instantly (no API latency)
- Scoped to single pipeline run — no stale data across runs

### Archetype Routing

```typescript
// src/lib/data-sources/registry.ts

// ArchetypeFamily is the union type from src/lib/pipeline/types.ts
const ARCHETYPE_TOOL_ROUTING: Record<ArchetypeFamily, {
  research: string[];   // Layer 3 compound tools (listed first in tools array)
  granular: string[];   // Layer 2 precision tools (listed after research tools)
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
  // Archetypes with no data source tools (use web_search or no tools):
  // RESEARCHER-WEB, RESEARCHER-LATERAL, all CRITICs, all CREATORs,
  // SYNTHESIZER, ARBITER, DEVILS-ADVOCATE, HISTORIAN, RED-TEAM
};
```

Note: Research tools are listed first in the tools array. Claude preferentially selects tools listed earlier, so agents will default to compound research tools and fall back to granular tools only when they need surgical precision.

---

## Integration with deploy.ts

Minimal changes to deploy.ts:

```typescript
// deploy.ts changes

import { getToolRegistry } from "@/lib/data-sources/registry";
import { getMCPManager } from "@/lib/mcp/client";

async function executeAgent(agent, emitEvent, mcpManager, toolRegistry) {
  // Build tools: in-process data sources + remote MCP + submit_findings
  const dataSourceTools = toolRegistry.getToolsForArchetype(archetypeFamily);
  const remoteMcpTools = mcpManager.getToolsForArchetype(archetypeFamily);
  const allTools = [...dataSourceTools, ...remoteMcpTools, submitFindingsTool];

  // Tool execution routing
  for (const toolBlock of toolUseBlocks) {
    if (toolRegistry.hasToolName(toolBlock.name)) {
      result = await toolRegistry.executeTool(toolBlock.name, toolBlock.input);
    } else if (mcpToolNames.has(toolBlock.name)) {
      result = await mcpManager.executeTool(toolBlock.name, toolBlock.input);
    }
  }
}
```

MCPManager continues to handle:
- PubMed (`pubmed`)
- CMS Coverage (`cms_coverage`)
- ICD-10 (`icd10`)
- NPI Registry (`npi_registry`)
- Clinical Trials (`clinical_trials`)
- bioRxiv (`biorxiv`)

These are Anthropic-provided remote servers where MCP is the correct protocol.

### MCP Bridge: How Layer 3 Reaches Anthropic Sources

Several Layer 3 research tools combine Protoprism in-process data (Layer 1) with Anthropic MCP data. For example, `research_clinical_evidence` needs PubMed + ClinicalTrials + bioRxiv — all Anthropic-provided MCP servers.

**Solution: `McpBridge` adapter module.**

```typescript
// src/lib/data-sources/mcp-bridge.ts

import { getMCPManager } from "@/lib/mcp/client";

/**
 * Thin adapter that lets Layer 3 research tools call Anthropic MCP
 * server tools programmatically. Translates between the MCPManager's
 * qualified-name API and a typed function call interface.
 *
 * NOT a generic bridge — hardcodes the 6 Anthropic server tools
 * that Layer 3 needs. If an MCP server is unavailable, returns
 * { available: false } so the research tool can degrade gracefully.
 */
// Singleton export
export const mcpBridge = new McpBridge();

class McpBridge {
  /** Execute a tool on an Anthropic MCP server */
  async call(
    server: "pubmed" | "clinical_trials" | "biorxiv" | "cms_coverage" | "icd10" | "npi_registry",
    toolName: string,
    input: Record<string, unknown>
  ): Promise<McpBridgeResult> {
    const mcpManager = getMCPManager();
    const qualifiedName = `${server}__${toolName}`;

    // isServerAvailable() must be added to MCPManager — checks unavailableServers[]
    if (!mcpManager.isServerAvailable(server)) {
      return { available: false, server, toolName, error: "MCP server not connected" };
    }

    try {
      const rawResult = await mcpManager.executeTool(qualifiedName, input);
      return { available: true, server, toolName, data: rawResult };
    } catch (err) {
      return { available: false, server, toolName, error: String(err) };
    }
  }

  /** Check which Anthropic MCP servers are currently connected */
  availableServers(): string[] {
    const mcpManager = getMCPManager();
    return ["pubmed", "clinical_trials", "biorxiv", "cms_coverage", "icd10", "npi_registry"]
      .filter(s => mcpManager.isServerAvailable(s));
  }
}

interface McpBridgeResult {
  available: boolean;
  server: string;
  toolName: string;
  data?: string;
  error?: string;
}
```

**Usage in Layer 3 research tools:**

```typescript
// src/lib/data-sources/research/clinical-evidence.ts
import { mcpBridge } from "../mcp-bridge";
import { openfdaClient } from "../clients/openfda";

async function researchClinicalEvidence(input: ResearchToolInput) {
  // Parallel: Protoprism in-process + Anthropic MCP
  const [pubmedResult, trialsResult, fdaResult] = await Promise.all([
    mcpBridge.call("pubmed", "search_articles", { query: `${input.query} clinical trial` }),
    mcpBridge.call("clinical_trials", "search_trials", { condition: input.query }),
    openfdaClient.searchAdverseEvents({ search: input.query }),  // Layer 1 direct
  ]);

  // Confidence degrades if MCP sources unavailable
  const sourcesAvailable = [pubmedResult, trialsResult].filter(r => r.available).length;
  const confidence = sourcesAvailable === 2 ? "HIGH" : sourcesAvailable === 1 ? "MEDIUM" : "LOW";

  // Format intelligence packet from whatever data we have...
}
```

**Degradation behavior:** When an Anthropic MCP server is unavailable (not configured, connection failed), the Layer 3 tool still returns an intelligence packet from whatever sources succeeded. The confidence score drops, and the packet notes which sources were unavailable. Agents see the gap and can use web_search or granular tools to compensate.

**Caching:** McpBridge calls are routed through `ResultCache.getOrCompute()` at the Layer 3 level, not within the bridge itself. When a Layer 3 tool calls `cache.getOrCompute("research_clinical_evidence", input, () => ...)`, the entire compound result is cached. If two agents both call the same research tool with the same input, the second gets the cached result — which includes the MCP data. Individual MCP bridge calls within a research tool are NOT separately cached because they're internal implementation details of the compound operation.

### Tool Naming Convention

To prevent collisions between ToolRegistry (in-process) and MCPManager (remote MCP) tools:

**MCPManager tools** use qualified names: `{server}__{tool}` (e.g., `pubmed__search_articles`, `clinical_trials__search_trials`). This is the existing convention and doesn't change.

**ToolRegistry tools** use unqualified names: `search_adverse_events`, `research_drug_safety`. These names are prefixed by domain but not by server name.

**Collision prevention rules:**
1. ToolRegistry tool names MUST NOT contain double-underscore (`__`). This delimiter is reserved for MCPManager qualified names.
2. In `deploy.ts`, ToolRegistry is checked first (`hasToolName`). Since ToolRegistry names never contain `__` and MCPManager names always do, there is zero ambiguity — the name format itself determines routing.
3. Layer 3 research tool names always start with `research_`. Layer 2 granular tool names always start with a verb (`search_`, `get_`, `list_`, `lookup_`). Neither format overlaps with MCPManager's `server__tool` pattern.

This means the routing logic in deploy.ts has zero collision risk:
```typescript
if (toolRegistry.hasToolName(name)) {        // No __ in name → in-process
  result = await toolRegistry.executeTool(name, input);
} else if (mcpToolNames.has(name)) {         // Has __ → remote MCP
  result = await mcpManager.executeTool(name, input);
}
```

### WEB_SEARCH_ARCHETYPES Handling

The `WEB_SEARCH_ARCHETYPES` set stays in `deploy.ts` (not ToolRegistry or MCPManager). Web search is an Anthropic-native tool passed in the `tools` array — it's not an MCP tool and not an in-process tool. `deploy.ts` already has the logic to conditionally include it based on archetype. No change needed.

The set itself moves from `src/lib/mcp/config.ts` to `src/lib/data-sources/registry.ts` since that's where archetype routing now lives. The MCP config file shrinks to only the 6 Anthropic server definitions.

---

## MCP Facade (Optional)

For ecosystem compatibility and dev debugging, a single MCP server that exposes all Layer 2 + Layer 3 tools:

```
scripts/mcp-dev-server.ts
  → imports all tool definitions from src/lib/data-sources/
  → registers them as MCP tools via @modelcontextprotocol/sdk
  → serves on a single port (3010)
  → for use in Claude Code or other MCP hosts
  → NOT used by PRISM pipeline itself
```

This replaces the 15 separate MCP servers with one unified server for external use.

---

## Migration Strategy

### What Gets Replaced
- `mcp-servers/` directory (15 servers) → archived, not deleted
- `src/lib/mcp/config.ts` ARCHETYPE_TOOL_ROUTING → replaced by registry routing
- `scripts/start-mcp-servers.sh` → no longer needed for PRISM pipeline
- `.env` MCP_*_URL entries for localhost servers → removed

### What Stays
- `src/lib/mcp/client.ts` MCPManager → still handles 6 Anthropic remote servers
- `src/lib/mcp/config.ts` MCP_SERVERS → reduced to 6 Anthropic entries only
- `.env` MCP_*_URL entries for Anthropic servers → remain (to be configured)

### Build Order
1. Layer 1 API clients (15 modules) — port logic from existing MCP server implementations
2. Layer 2 granular tools (15 tool files) — port tool definitions, add markdown formatting
3. ToolRegistry + ResultCache infrastructure
4. Integration with deploy.ts (dual routing: ToolRegistry + MCPManager)
5. Layer 3 research tools (13 compound tools) — new code, most impactful
6. Archetype routing update
7. MCP facade (optional, low priority)

### Verification
- Each Layer 1 client should have integration tests against the real API (with rate limiting)
- Each Layer 2 tool should have unit tests with mocked API responses
- Each Layer 3 research tool should have unit tests verifying intelligence packet format
- End-to-end: run a pipeline with the new architecture and compare finding quality to MCP baseline

---

## Expected Impact

| Metric | Current (MCP) | Projected (Intelligence-Ready) |
|--------|--------------|-------------------------------|
| Turns spent on data gathering | ~8-10 of 15 | ~3-5 of 15 |
| Turns available for analysis | ~5-7 | ~10-12 |
| Context tokens per tool result | ~2,500 (raw JSON) | ~300-800 (markdown) |
| Cross-source correlation | Manual (agent) | Pre-computed (tool) |
| Citation specificity | Vague ("openFDA data") | Specific (query + date + count) |
| Cache hit rate | 0% (no cache) | ~40-60% (shared cache) |
| Connection failure rate | Variable (15 processes) | 0% (in-process) |
| Startup time | ~10s (15 servers) | 0s (imported modules) |

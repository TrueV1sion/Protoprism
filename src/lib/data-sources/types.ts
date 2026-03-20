/**
 * Intelligence-Ready Data Source Types
 *
 * Core interfaces for the three-layer data source architecture.
 * Layer 1 (API Clients), Layer 2 (Granular Tools), Layer 3 (Research Tools).
 */

// NOTE: No imports from ./cache — avoids circular dependency.
// DataSourceTool.handler uses ToolCache interface (defined below),
// which ResultCache implements.

// ─── Constants ───────────────────────────────────────────────

/** Maximum characters for a Layer 2 granular tool response */
export const LAYER_2_CHAR_BUDGET = 4000;

/** Maximum characters for a Layer 3 intelligence packet */
export const LAYER_3_CHAR_BUDGET = 6000;

/** Maximum table rows in Layer 2 responses */
export const MAX_TABLE_ROWS_LAYER_2 = 20;

/** Maximum table rows in Layer 3 intelligence packets */
export const MAX_TABLE_ROWS_LAYER_3 = 10;

/** Maximum concurrent outbound API requests across all clients */
export const MAX_CONCURRENT_REQUESTS = 20;

// ─── Layer 1: API Client Types ───────────────────────────────

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  userAgent?: string;
  rateLimitMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  vintage: DataVintage;
}

export interface DataVintage {
  queriedAt: string;
  dataThrough?: string;
  source: string;
}

// ─── Cache Interface ─────────────────────────────────────────

/**
 * Minimal cache interface used by tool handlers.
 * ResultCache (in cache.ts) implements this — defined here to avoid
 * a circular import between types.ts and cache.ts.
 */
export interface ToolCache {
  getOrCompute(
    toolName: string,
    input: Record<string, unknown>,
    compute: () => Promise<ToolResult>,
  ): Promise<ToolResult>;
}

// ─── Layer 2: Granular Tool Types ────────────────────────────

export interface DataSourceTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, cache: ToolCache) => Promise<ToolResult>;
  layer: 2 | 3;
  sources: string[];
  routingTags?: string[];  // Semantic tags for auto-routing via TagBasedRouter
}

export interface ToolResult {
  content: string;
  citations: Citation[];
  vintage: DataVintage;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  truncated: boolean;
  structuredData?: Record<string, unknown>;
}

export interface Citation {
  id: string;
  source: string;
  query: string;
  dateRange?: string;
  resultCount?: number;
}

// ─── Layer 3: Research Tool Types ────────────────────────────

export interface ResearchToolInput {
  query: string;
  timeframe?: string;
  focus?: string;
}

// ─── MCP Bridge Types ────────────────────────────────────────

export type AnthropicMcpServer =
  | "pubmed"
  | "clinical_trials"
  | "biorxiv"
  | "cms_coverage"
  | "icd10"
  | "npi_registry";

export interface McpBridgeResult {
  available: boolean;
  server: string;
  toolName: string;
  data?: string;
  error?: string;
}

// ─── Cache Types ─────────────────────────────────────────────

export interface CacheEntry {
  result: ToolResult;
  createdAt: number;
}

// ─── Type Guard ──────────────────────────────────────────────

export function isToolResult(value: unknown): value is ToolResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.content === "string" &&
    Array.isArray(v.citations) &&
    v.vintage !== null &&
    typeof v.vintage === "object" &&
    typeof (v.vintage as Record<string, unknown>).queriedAt === "string" &&
    typeof (v.vintage as Record<string, unknown>).source === "string" &&
    (v.confidence === "HIGH" || v.confidence === "MEDIUM" || v.confidence === "LOW") &&
    typeof v.truncated === "boolean"
  );
}

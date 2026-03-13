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

// ─── Singleton ───────────────────────────────────────────────

let registryInstance: ToolRegistry | null = null;

/**
 * Get the singleton ToolRegistry instance.
 * Call once at app startup; subsequent calls return the same instance.
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    // Tools will be registered by tool modules importing this and calling registerTool
    // The production routing will be loaded by the initialization code
  }
  return registryInstance;
}

/** Reset the singleton (for testing). */
export function resetToolRegistry(): void {
  registryInstance = null;
}

/**
 * MCP Bridge — Adapter for Layer 3 → Anthropic MCP Server Calls
 *
 * Thin adapter that lets Layer 3 research tools call Anthropic MCP
 * server tools programmatically. Translates between MCPManager's
 * qualified-name API and a typed function call interface.
 *
 * Hardcodes the 6 Anthropic server names that Layer 3 needs.
 * If an MCP server is unavailable, returns { available: false }
 * so the research tool can degrade gracefully.
 */

import { getMCPManager } from "@/lib/mcp/client";
import type { AnthropicMcpServer, McpBridgeResult } from "./types";

const ANTHROPIC_SERVERS: AnthropicMcpServer[] = [
  "pubmed",
  "clinical_trials",
  "biorxiv",
  "cms_coverage",
  "icd10",
  "npi_registry",
];

export class McpBridge {
  /** Execute a tool on an Anthropic MCP server. */
  async call(
    server: AnthropicMcpServer,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<McpBridgeResult> {
    const mcpManager = getMCPManager();
    const qualifiedName = `${server}__${toolName}`;

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

  /** Check which Anthropic MCP servers are currently connected. */
  availableServers(): string[] {
    const mcpManager = getMCPManager();
    return ANTHROPIC_SERVERS.filter((s) => mcpManager.isServerAvailable(s));
  }
}

/** Singleton bridge instance */
export const mcpBridge = new McpBridge();

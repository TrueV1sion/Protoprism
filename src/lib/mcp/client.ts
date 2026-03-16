/**
 * MCP Client Manager
 *
 * Manages connections to MCP servers and provides tool discovery/execution
 * for PRISM pipeline agents. Handles unavailable servers gracefully by
 * tracking them as gaps rather than failing.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Anthropic from "@anthropic-ai/sdk";

import type { ArchetypeFamily } from "@/lib/pipeline/types";
import { WEB_SEARCH_TOOL } from "@/lib/ai/client";
import { WEB_SEARCH_ARCHETYPES } from "@/lib/data-sources/registry";
import { MCP_SERVERS, type MCPServerConfig } from "./config";

// ─── MCP-Level Archetype → Server Routing ─────────────────────
// Maps archetype families to the MCP server names they need.
// Separate from ToolRegistry's ARCHETYPE_TOOL_ROUTING (in-process tool names).
// This routing is only for remote MCP servers managed by MCPManager.
const MCP_ARCHETYPE_SERVERS: Partial<Record<ArchetypeFamily, string[]>> = {
  "RESEARCHER-WEB": [],
  "RESEARCHER-DATA": ["pubmed", "clinical_trials", "biorxiv"],
  "RESEARCHER-DOMAIN": ["pubmed", "cms_coverage", "icd10", "npi_registry", "clinical_trials"],
  "RESEARCHER-LATERAL": ["pubmed", "biorxiv"],
  "ANALYST-FINANCIAL": [],
  "ANALYST-STRATEGIC": [],
  "ANALYST-TECHNICAL": ["pubmed", "clinical_trials"],
  "ANALYST-RISK": ["cms_coverage", "clinical_trials"],
  "ANALYST-QUALITY": ["cms_coverage", "icd10"],
  "CRITIC-FACTUAL": [],
  "CRITIC-LOGICAL": [],
  "CRITIC-STRATEGIC": [],
  "CRITIC-EDITORIAL": [],
  "CREATOR-WRITER": [],
  "CREATOR-PRESENTER": [],
  "CREATOR-TECHNICAL": [],
  "CREATOR-PERSUADER": [],
  SYNTHESIZER: [],
  ARBITER: [],
  "DEVILS-ADVOCATE": [],
  FUTURIST: ["clinical_trials", "biorxiv"],
  HISTORIAN: ["pubmed"],
  "RED-TEAM": [],
  "CUSTOMER-PROXY": ["npi_registry"],
  "LEGISLATIVE-PIPELINE": ["cms_coverage"],
  "REGULATORY-RADAR": ["cms_coverage", "icd10"],
  "MACRO-CONTEXT": ["biorxiv"],
};

// ─── Types ──────────────────────────────────────────────────

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;
  tools: MCPToolInfo[];
}

interface MCPToolInfo {
  /** Server-scoped name (e.g. "search_articles") */
  name: string;
  /** Qualified name for routing (e.g. "pubmed__search_articles") */
  qualifiedName: string;
  /** Which MCP server this tool belongs to */
  serverName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ─── MCPManager ─────────────────────────────────────────────

export class MCPManager {
  private servers = new Map<string, ConnectedServer>();
  private unavailableServers: string[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Connect to all available MCP servers defined in the config.
   * Unavailable servers are silently tracked — call getUnavailableServers()
   * to see which ones could not be connected.
   * Uses a singleton promise to prevent concurrent initialization races.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    const entries = Object.entries(MCP_SERVERS);

    await Promise.allSettled(
      entries.map(async ([name, config]) => {
        if (!config.available) {
          this.unavailableServers.push(name);
          return;
        }

        try {
          await this.connectServer(name, config);
        } catch (err) {
          console.warn(
            `[MCPManager] Failed to connect to MCP server "${name}":`,
            err instanceof Error ? err.message : err,
          );
          this.unavailableServers.push(name);
        }
      }),
    );

    this.initialized = true;

    const connected = this.servers.size;
    const unavailable = this.unavailableServers.length;
    console.log(
      `[MCPManager] Initialized: ${connected} connected, ${unavailable} unavailable`,
    );
  }

  private async connectServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<void> {
    let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

    if (config.transport === "sse") {
      const url = config.envUrlKey ? process.env[config.envUrlKey] : undefined;
      if (!url) {
        console.warn(
          `[MCPManager] Remote server "${name}" skipped: env var ${config.envUrlKey} not set`,
        );
        this.unavailableServers.push(name);
        return;
      }

      const parsedUrl = new URL(url);

      // Try StreamableHTTP first (modern), fall back to SSE (legacy) on connection failure
      transport = new StreamableHTTPClientTransport(parsedUrl);
      try {
        const client = new Client(
          { name: `prism-${name}`, version: "1.0.0" },
          { capabilities: {} },
        );
        await client.connect(transport);
        const { tools } = await client.listTools();
        const toolInfos: MCPToolInfo[] = tools.map((tool) => ({
          name: tool.name,
          qualifiedName: `${name}__${tool.name}`,
          serverName: name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema as Record<string, unknown>,
        }));
        this.servers.set(name, { client, transport, tools: toolInfos });
        return; // StreamableHTTP succeeded
      } catch {
        // StreamableHTTP connection failed — try SSE fallback
        console.warn(
          `[MCPManager] StreamableHTTP failed for "${name}", trying SSE fallback`,
        );
        transport = new SSEClientTransport(parsedUrl);
      }
    } else {
      if (!config.command) {
        throw new Error(`Stdio server "${name}" missing command`);
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env,
      });
    }

    const client = new Client(
      { name: `prism-${name}`, version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const { tools } = await client.listTools();

    const toolInfos: MCPToolInfo[] = tools.map((tool) => ({
      name: tool.name,
      qualifiedName: `${name}__${tool.name}`,
      serverName: name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));

    this.servers.set(name, { client, transport, tools: toolInfos });
  }

  /**
   * Returns the Claude API tool definitions for a given archetype.
   * Includes both MCP tools (converted to Anthropic Tool format) and
   * native Anthropic server tools (web_search) where applicable.
   */
  getToolsForArchetype(archetype: ArchetypeFamily): Anthropic.Messages.ToolUnion[] {
    const tools: Anthropic.Messages.ToolUnion[] = [];

    // Add MCP-sourced tools
    const serverNames = MCP_ARCHETYPE_SERVERS[archetype] ?? [];
    for (const serverName of serverNames) {
      const server = this.servers.get(serverName);
      if (!server) continue;

      for (const tool of server.tools) {
        tools.push({
          name: tool.qualifiedName,
          description: `[${serverName}] ${tool.description}`,
          input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
        });
      }
    }

    // Add native web_search tool for applicable archetypes
    if (WEB_SEARCH_ARCHETYPES.has(archetype)) {
      tools.push(WEB_SEARCH_TOOL);
    }

    return tools;
  }

  /**
   * Returns the list of gap descriptions for servers that an archetype
   * needs but that are unavailable. Agents should include these in their
   * `gaps` output.
   */
  getGapsForArchetype(archetype: ArchetypeFamily): string[] {
    const serverNames = MCP_ARCHETYPE_SERVERS[archetype] ?? [];
    const gaps: string[] = [];

    for (const name of serverNames) {
      if (this.unavailableServers.includes(name)) {
        const config = MCP_SERVERS[name];
        gaps.push(
          `MCP server "${name}" unavailable: ${config?.description ?? "unknown"}`,
        );
      }
    }

    return gaps;
  }

  /** Check if a specific MCP server is connected and available. */
  isServerAvailable(serverName: string): boolean {
    return this.servers.has(serverName) && !this.unavailableServers.includes(serverName);
  }

  /**
   * Execute a tool call by routing to the correct MCP server.
   *
   * @param qualifiedName - The qualified tool name (e.g. "pubmed__search_articles")
   * @param input - The tool input arguments
   * @returns The text content from the tool result
   * @throws If the server or tool is not found
   */
  async executeTool(
    qualifiedName: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const separatorIndex = qualifiedName.indexOf("__");
    if (separatorIndex === -1) {
      throw new Error(
        `Invalid qualified tool name "${qualifiedName}" — expected "serverName__toolName" format`,
      );
    }

    const serverName = qualifiedName.slice(0, separatorIndex);
    const toolName = qualifiedName.slice(separatorIndex + 2);
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(
        `MCP server "${serverName}" is not connected. Tool "${qualifiedName}" cannot be executed.`,
      );
    }

    const result = await server.client.callTool({
      name: toolName,
      arguments: input,
    });

    // Extract text content from the MCP result
    if ("content" in result && Array.isArray(result.content)) {
      return result.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
    }

    return JSON.stringify(result);
  }

  /** Returns the list of server names that could not be connected */
  getUnavailableServers(): string[] {
    return [...this.unavailableServers];
  }

  /** Returns the list of server names that are connected */
  getConnectedServers(): string[] {
    return [...this.servers.keys()];
  }

  /** Shut down all MCP server connections */
  async shutdown(): Promise<void> {
    const shutdowns = [...this.servers.entries()].map(
      async ([name, server]) => {
        try {
          await server.transport.close();
        } catch (err) {
          console.warn(
            `[MCPManager] Error closing server "${name}":`,
            err instanceof Error ? err.message : err,
          );
        }
      },
    );

    await Promise.allSettled(shutdowns);
    this.servers.clear();
    this.unavailableServers = [];
    this.initialized = false;
    this.initPromise = null;
  }
}

// ─── Singleton ──────────────────────────────────────────────

let instance: MCPManager | null = null;

export function getMCPManager(): MCPManager {
  if (!instance) {
    instance = new MCPManager();
  }
  return instance;
}

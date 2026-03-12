/**
 * PRISM Pipeline -- Phase 2: DEPLOY
 *
 * Parallel Agent Executor with MCP Tool-Use Loop.
 *
 * Each agent runs as an Anthropic messages.create() call with a tool-use
 * agentic loop: Claude calls MCP tools or web_search, we relay tool results
 * back, and the loop continues until the agent calls submit_findings.
 *
 * Quality controls:
 * - Real data gathering via MCP servers (PubMed, CMS, EDGAR, etc.) and
 *   Anthropic native web_search
 * - Agent outputs validated against AgentResultSchema (Zod)
 * - Source verification: findings must reference real tool data
 * - Unsourced findings flagged and confidence downgraded
 * - Per-agent failure handling: Promise.allSettled, no cascading failures
 * - CRITIC-FACTUAL runs after all other agents when depth >= 4
 * - Two-wave execution for EXTENDED+ tiers with MemoryBus context injection
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, MODELS, cachedSystemPrompt } from "@/lib/ai/client";
import { getMCPManager, type MCPManager } from "@/lib/mcp/client";
import { WEB_SEARCH_ARCHETYPES } from "@/lib/mcp/config";
import {
  AgentResultSchema,
  type AgentResult,
  type AgentFinding,
  type Blueprint,
  type ConstructedAgent,
  type PipelineEvent,
  type ArchetypeFamily,
} from "./types";
import { MemoryBus } from "./memory-bus";

// ─── Types ──────────────────────────────────────────────────

export interface DeployInput {
  agents: ConstructedAgent[];
  blueprint: Blueprint;
  emitEvent: (event: PipelineEvent) => void;
  signal?: AbortSignal;
  memoryBus?: MemoryBus;
}

export interface DeployOutput {
  agentResults: AgentResult[];
  criticResult?: AgentResult; // CRITIC-FACTUAL result if depth >= 4
}

/** Kept for backward compatibility with index.ts re-exports */
export interface AgentDeployResult {
  agentName: string;
  dimension: string;
  result: AgentResult | null;
  error?: string;
  warnings: string[];
}

// ─── Normalize AI Output ─────────────────────────────────────
// AI models frequently return enum values in mixed case (e.g. "Primary" instead of "PRIMARY").
// Normalize before Zod validation to prevent spurious failures.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAgentOutput(data: any): void {
  if (!data || typeof data !== "object") return;

  // Default missing arrays
  if (!Array.isArray(data.minorityViews)) data.minorityViews = [];
  if (!Array.isArray(data.gaps)) data.gaps = [];
  if (!Array.isArray(data.signals)) data.signals = [];
  if (!Array.isArray(data.toolsUsed)) data.toolsUsed = [];

  // Normalize findings
  const validSourceTiers = new Set(["PRIMARY", "SECONDARY", "TERTIARY"]);
  const validConfidenceLevels = new Set(["HIGH", "MEDIUM", "LOW"]);
  const validEvidenceTypes = new Set(["direct", "inferred", "analogical", "modeled"]);

  if (Array.isArray(data.findings)) {
    for (const f of data.findings) {
      if (typeof f.sourceTier === "string") {
        const upper = f.sourceTier.toUpperCase();
        f.sourceTier = validSourceTiers.has(upper) ? upper : "SECONDARY";
      } else {
        f.sourceTier = "SECONDARY";
      }
      if (typeof f.confidence === "string") {
        const upper = f.confidence.toUpperCase();
        f.confidence = validConfidenceLevels.has(upper) ? upper : "MEDIUM";
      } else {
        f.confidence = "MEDIUM";
      }
      if (typeof f.evidenceType === "string") {
        const lower = f.evidenceType.toLowerCase();
        f.evidenceType = validEvidenceTypes.has(lower) ? lower : "inferred";
      } else {
        f.evidenceType = "inferred";
      }
      if (!Array.isArray(f.tags)) f.tags = [];
    }
  }
}

// ─── AgentResult JSON Schema for submit_findings tool ────────

function getAgentResultJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(AgentResultSchema) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}

// ─── Main Function ──────────────────────────────────────────

/**
 * Phase 2: DEPLOY -- Execute all agents in parallel with MCP tool access.
 *
 * Each agent:
 * 1. Gets a tools array: MCP tools + web_search (if applicable) + submit_findings
 * 2. Runs a tool-use loop with Claude until submit_findings is called
 * 3. AgentResult is validated with Zod
 *
 * For MICRO/STANDARD tiers: all non-CRITIC agents run in parallel.
 * For EXTENDED+ tiers: two-wave execution with MemoryBus context injection.
 * CRITIC-FACTUAL always runs last, after all other agents.
 */
export async function deploy(input: DeployInput): Promise<DeployOutput> {
  const { agents, blueprint, emitEvent, signal, memoryBus } = input;

  const mcpManager = getMCPManager();
  await mcpManager.initialize();

  // Separate CRITIC-FACTUAL from other agents
  const criticAgents = agents.filter((a) => a.archetype === "CRITIC-FACTUAL");
  const regularAgents = agents.filter((a) => a.archetype !== "CRITIC-FACTUAL");

  // ─── Wave Execution Strategy ──────────────────────────────

  const tier = blueprint.tier;
  const useWaves =
    (tier === "EXTENDED" || tier === "MEGA" || tier === "CAMPAIGN") &&
    regularAgents.length >= 7;

  let agentResults: AgentResult[];

  if (useWaves) {
    // Check abort before starting wave execution
    if (signal?.aborted) {
      return { agentResults: [] };
    }
    agentResults = await executeTwoWaves(
      regularAgents,
      blueprint,
      emitEvent,
      mcpManager,
      memoryBus,
    );
  } else {
    // Check abort before starting parallel execution
    if (signal?.aborted) {
      return { agentResults: [] };
    }
    // Standard parallel execution for MICRO/STANDARD
    agentResults = await executeParallel(
      regularAgents,
      emitEvent,
      mcpManager,
      memoryBus,
    );
  }

  // ─── CRITIC-FACTUAL (runs after all other agents) ─────────

  let criticResult: AgentResult | undefined;

  if (criticAgents.length > 0 && !signal?.aborted) {
    const criticAgent = criticAgents[0];

    // Build the top 10 claims from all agent findings for verification
    const topClaims = extractTopClaims(agentResults, 10);

    // Inject claims into the critic's research prompt
    const criticWithClaims: ConstructedAgent = {
      ...criticAgent,
      researchPrompt:
        criticAgent.researchPrompt +
        `\n\n## Claims to Verify (top 10 by confidence/impact)\n\n` +
        topClaims
          .map(
            (c, i) =>
              `${i + 1}. [${c.agentName}] "${c.statement}" (confidence: ${c.confidence}, source: ${c.source})`,
          )
          .join("\n"),
    };

    emitEvent({
      type: "agent_spawned",
      agentName: criticWithClaims.name,
      archetype: criticWithClaims.archetype,
      dimension: criticWithClaims.dimension,
    });

    try {
      criticResult = await executeAgent(
        criticWithClaims,
        emitEvent,
        mcpManager,
      );
    } catch (err) {
      console.error(
        "[DEPLOY] CRITIC-FACTUAL failed:",
        err instanceof Error ? err.message : err,
      );
      emitEvent({
        type: "error",
        message: `CRITIC-FACTUAL failed: ${err instanceof Error ? err.message : String(err)}`,
        phase: "deploy",
      });
    }
  }

  return { agentResults, criticResult };
}

// ─── Parallel Execution ─────────────────────────────────────

async function executeParallel(
  agents: ConstructedAgent[],
  emitEvent: (event: PipelineEvent) => void,
  mcpManager: MCPManager,
  memoryBus?: MemoryBus,
): Promise<AgentResult[]> {
  const settled = await Promise.allSettled(
    agents.map((agent) => {
      emitEvent({
        type: "agent_spawned",
        agentName: agent.name,
        archetype: agent.archetype,
        dimension: agent.dimension,
      });
      return executeAgent(agent, emitEvent, mcpManager);
    }),
  );

  const results = collectResults(settled, agents, emitEvent);

  // Populate MemoryBus for MICRO/STANDARD tiers (not just EXTENDED+)
  if (memoryBus) {
    populateBusFromResults(results, memoryBus, emitEvent);
  }

  return results;
}

// ─── Two-Wave Execution ─────────────────────────────────────

async function executeTwoWaves(
  agents: ConstructedAgent[],
  blueprint: Blueprint,
  emitEvent: (event: PipelineEvent) => void,
  mcpManager: MCPManager,
  externalBus?: MemoryBus,
): Promise<AgentResult[]> {
  const memoryBus = externalBus ?? new MemoryBus(blueprint.query);
  const midpoint = Math.ceil(agents.length / 2);
  const wave1Agents = agents.slice(0, midpoint);
  const wave2Agents = agents.slice(midpoint);

  emitEvent({
    type: "agent_progress",
    agentName: "orchestrator",
    progress: 10,
    message: `Wave 1: Deploying ${wave1Agents.length} foundation agents...`,
  });

  // Wave 1: Foundation agents
  const wave1Settled = await Promise.allSettled(
    wave1Agents.map((agent) => {
      emitEvent({
        type: "agent_spawned",
        agentName: agent.name,
        archetype: agent.archetype,
        dimension: agent.dimension,
      });
      return executeAgent(agent, emitEvent, mcpManager);
    }),
  );

  const wave1Results = collectResults(wave1Settled, wave1Agents, emitEvent);

  // Write Wave 1 findings to memory bus for Wave 2 context
  populateBusFromResults(wave1Results, memoryBus, emitEvent);

  emitEvent({
    type: "agent_progress",
    agentName: "orchestrator",
    progress: 55,
    message: `Wave 2: Deploying ${wave2Agents.length} specialist agents with cross-agent context...`,
  });

  // Wave 2: Specialist agents with blackboard context injected
  const wave2AgentsWithContext = wave2Agents.map((agent) => ({
    ...agent,
    researchPrompt:
      agent.researchPrompt +
      "\n\n## Intelligence from Wave 1 Agents\n" +
      memoryBus.formatForAgentContext(agent.name),
  }));

  const wave2Settled = await Promise.allSettled(
    wave2AgentsWithContext.map((agent) => {
      emitEvent({
        type: "agent_spawned",
        agentName: agent.name,
        archetype: agent.archetype,
        dimension: agent.dimension,
      });
      return executeAgent(agent, emitEvent, mcpManager);
    }),
  );

  const wave2Results = collectResults(
    wave2Settled,
    wave2AgentsWithContext,
    emitEvent,
  );

  // Write Wave 2 findings to memory bus for downstream phases
  populateBusFromResults(wave2Results, memoryBus, emitEvent);

  return [...wave1Results, ...wave2Results];
}

// ─── Result Collection ──────────────────────────────────────

function collectResults(
  settled: PromiseSettledResult<AgentResult>[],
  agents: ConstructedAgent[],
  emitEvent: (event: PipelineEvent) => void,
): AgentResult[] {
  const results: AgentResult[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const agent = agents[i];

    if (outcome.status === "fulfilled") {
      const result = outcome.value;
      results.push(result);

      // Emit per-finding events
      for (const finding of result.findings) {
        emitEvent({ type: "finding_added", agentName: result.agentName, finding });
      }

      emitEvent({
        type: "agent_complete",
        agentName: result.agentName,
        findingCount: result.findings.length,
        tokensUsed: result.tokensUsed,
      });
    } else {
      const errorMsg =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);

      console.error(`[DEPLOY] Agent "${agent.name}" failed:`, errorMsg);
      emitEvent({
        type: "error",
        message: `Agent "${agent.name}" failed: ${errorMsg}`,
        phase: "deploy",
      });
    }
  }

  return results;
}

// ─── MemoryBus Population ────────────────────────────────────

function populateBusFromResults(
  results: AgentResult[],
  memoryBus: MemoryBus,
  emitEvent: (event: PipelineEvent) => void,
): void {
  for (const result of results) {
    for (const finding of result.findings) {
      const key = `${result.dimension.toLowerCase().replace(/\s+/g, "-")}/${finding.evidenceType}`;
      const confidence =
        finding.confidence === "HIGH"
          ? 0.9
          : finding.confidence === "MEDIUM"
            ? 0.6
            : 0.3;

      memoryBus.writeToBlackboard({
        agent: result.agentName,
        key,
        value: finding.statement,
        confidence,
        evidenceType:
          finding.evidenceType === "direct"
            ? "direct"
            : finding.evidenceType === "inferred"
              ? "inferred"
              : "analogical",
        tags: [result.dimension.toLowerCase(), finding.confidence.toLowerCase()],
        references: [finding.source],
      });

      emitEvent({ type: "memory_write", agentName: result.agentName, key, confidence });
    }
    for (const signal of result.signals) {
      memoryBus.sendSignal({
        from: result.agentName,
        to: "all",
        type: "discovery",
        priority: "medium",
        message: signal,
      });

      emitEvent({
        type: "memory_signal",
        from: result.agentName,
        to: "all",
        signalType: "discovery",
        priority: "medium",
      });
    }
  }
}

// ─── Per-Agent Execution with Tool-Use Loop ─────────────────

/**
 * Execute a single agent via the Anthropic messages API with a tool-use
 * agentic loop.
 *
 * 1. Build tools: MCP tools + web_search (if applicable) + submit_findings
 * 2. Call messages.create()
 * 3. Loop: if response contains tool_use blocks, execute them and continue
 * 4. When submit_findings is called, validate and return AgentResult
 * 5. If the model stops without calling submit_findings, attempt text parsing
 */
async function executeAgent(
  agent: ConstructedAgent,
  emitEvent: (event: PipelineEvent) => void,
  mcpManager: MCPManager,
): Promise<AgentResult> {
  const client = getAnthropicClient();

  // ─── Build tools array ────────────────────────────────────

  const archetypeFamily = agent.archetype as ArchetypeFamily;

  // MCP tools (already in Anthropic tool format)
  const mcpTools = mcpManager.getToolsForArchetype(archetypeFamily);

  // Track which tool names are MCP tools for routing
  const mcpToolNames = new Set<string>();
  for (const tool of mcpTools) {
    if ("name" in tool && tool.type !== "web_search_20250305") {
      mcpToolNames.add(tool.name);
    }
  }

  // Add submit_findings tool for structured output
  const submitFindingsTool: Anthropic.Messages.Tool = {
    name: "submit_findings",
    description:
      "Submit your complete structured analysis. You MUST call this tool when your research is complete. " +
      "Include all findings, gaps, signals, minority views, and tools used.",
    input_schema:
      getAgentResultJsonSchema() as Anthropic.Messages.Tool.InputSchema,
  };

  const allTools: Anthropic.Messages.ToolUnion[] = [
    ...mcpTools,
    submitFindingsTool,
  ];

  // Include MCP gaps as pre-populated gap entries
  const mcpGaps = mcpManager.getGapsForArchetype(archetypeFamily);

  // ─── Build initial messages ───────────────────────────────

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content:
        agent.researchPrompt +
        (mcpGaps.length > 0
          ? `\n\n## Known Data Gaps (unavailable tools)\n${mcpGaps.map((g) => `- ${g}`).join("\n")}\nInclude these in your gaps output.`
          : ""),
    },
  ];

  // ─── Tool-use agentic loop ────────────────────────────────

  const toolsUsed: string[] = [];
  let totalTokens = 0;
  const MAX_TURNS = 15; // Safety limit

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    emitEvent({
      type: "agent_progress",
      agentName: agent.name,
      progress: Math.min(10 + turn * 6, 85),
      message:
        turn === 0
          ? `${agent.name} starting research...`
          : `${agent.name} continuing research (turn ${turn + 1})...`,
    });

    const response = await client.messages.create({
      model: MODELS.DEPLOY,
      max_tokens: 8192,
      system: [cachedSystemPrompt(agent.systemPrompt)],
      tools: allTools,
      messages,
    });

    // Track token usage
    totalTokens +=
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);

    // Process content blocks
    const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];
    let hasSubmitFindings = false;
    let submitFindingsInput: Record<string, unknown> | null = null;

    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolUseBlocks.push(block);

        if (block.name === "submit_findings") {
          hasSubmitFindings = true;
          submitFindingsInput = block.input as Record<string, unknown>;
        }
      }
    }

    // ─── If submit_findings was called, parse and return ────

    if (hasSubmitFindings && submitFindingsInput) {
      emitEvent({
        type: "agent_progress",
        agentName: agent.name,
        progress: 95,
        message: `${agent.name} submitted findings, validating...`,
      });

      // Inject agent metadata if not provided by the model
      submitFindingsInput.agentName =
        submitFindingsInput.agentName ?? agent.name;
      submitFindingsInput.archetype =
        submitFindingsInput.archetype ?? agent.archetype;
      submitFindingsInput.dimension =
        submitFindingsInput.dimension ?? agent.dimension;
      submitFindingsInput.toolsUsed =
        submitFindingsInput.toolsUsed ?? toolsUsed;
      submitFindingsInput.tokensUsed = totalTokens;

      // Add known MCP gaps to the gaps array
      if (mcpGaps.length > 0) {
        const existingGaps = Array.isArray(submitFindingsInput.gaps)
          ? (submitFindingsInput.gaps as string[])
          : [];
        submitFindingsInput.gaps = [...existingGaps, ...mcpGaps];
      }

      // Normalize AI output — models frequently return enum values in mixed case
      normalizeAgentOutput(submitFindingsInput);

      const result = AgentResultSchema.parse(submitFindingsInput);
      return result;
    }

    // ─── Process non-submit tool calls ──────────────────────

    if (toolUseBlocks.length > 0 && !hasSubmitFindings) {
      // Build tool_result messages for each tool call
      const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const toolName = toolBlock.name;
        const toolInput = toolBlock.input as Record<string, unknown>;

        // web_search is handled server-side by Anthropic -- we should not
        // see tool_use blocks for it in practice, but if we do, skip.
        if (toolName === "web_search") {
          // Server-side tool -- results come back in the response automatically.
          // This branch should not normally execute.
          continue;
        }

        // MCP tool call
        if (mcpToolNames.has(toolName)) {
          emitEvent({
            type: "tool_call",
            agentName: agent.name,
            toolName,
            serverName: toolName.split("__")[0] ?? "unknown",
          });

          if (!toolsUsed.includes(toolName)) {
            toolsUsed.push(toolName);
          }

          try {
            const toolResult = await mcpManager.executeTool(
              toolName,
              toolInput,
            );
            toolResultContents.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: toolResult.slice(0, 10000), // Cap at 10K chars
            });
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : String(err);
            toolResultContents.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: `Tool error: ${errMsg}`,
              is_error: true,
            });
          }
        } else {
          // Unknown tool -- return error
          toolResultContents.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Unknown tool "${toolName}". Available tools: ${[...mcpToolNames].join(", ")}, submit_findings`,
            is_error: true,
          });
        }
      }

      // Append assistant response and tool results to conversation
      messages.push({ role: "assistant", content: response.content });

      if (toolResultContents.length > 0) {
        messages.push({ role: "user", content: toolResultContents });
      }

      continue; // Next turn
    }

    // ─── Model stopped without tool calls ───────────────────

    if (response.stop_reason === "end_turn") {
      // Try to extract structured findings from text response (fallback)
      const textContent = response.content
        .filter(
          (b): b is Anthropic.Messages.TextBlock => b.type === "text",
        )
        .map((b) => b.text)
        .join("\n");

      // Ask the model one more time to call submit_findings
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          "You must call the submit_findings tool with your structured analysis. " +
          "Do not respond with text -- use the submit_findings tool now.",
      });

      continue; // One more chance
    }

    // If we got here with max_tokens stop, the response was too long
    // Try to continue the conversation
    if (response.stop_reason === "max_tokens") {
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          "Your response was truncated. Please call submit_findings now with your analysis so far.",
      });
      continue;
    }

    // Fallback: break loop
    break;
  }

  // ─── Fallback: agent never called submit_findings ─────────

  console.warn(
    `[DEPLOY] Agent "${agent.name}" did not call submit_findings after ${MAX_TURNS} turns. Building fallback result.`,
  );

  return {
    agentName: agent.name,
    archetype: agent.archetype,
    dimension: agent.dimension,
    findings: [],
    gaps: [
      ...mcpGaps,
      "Agent did not produce structured findings within the tool-use loop limit.",
    ],
    signals: [],
    minorityViews: [],
    toolsUsed,
    tokensUsed: totalTokens,
  };
}

// ─── Helpers ────────────────────────────────────────────────

interface ClaimForVerification {
  agentName: string;
  statement: string;
  confidence: string;
  source: string;
}

/**
 * Extract the top N claims from all agent results, prioritized by
 * HIGH confidence first, then by findings with specific sources.
 */
function extractTopClaims(
  results: AgentResult[],
  n: number,
): ClaimForVerification[] {
  const claims: ClaimForVerification[] = [];

  for (const result of results) {
    for (const finding of result.findings) {
      claims.push({
        agentName: result.agentName,
        statement: finding.statement,
        confidence: finding.confidence,
        source: finding.source,
      });
    }
  }

  // Sort: HIGH confidence first, then MEDIUM, then LOW
  // Within same confidence, prefer those with actual sources
  const confidenceRank: Record<string, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  claims.sort((a, b) => {
    const rankDiff =
      (confidenceRank[b.confidence] ?? 0) -
      (confidenceRank[a.confidence] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    // Prefer claims with real sources
    const aHasSource =
      a.source && a.source.trim() !== "" && !a.source.toLowerCase().includes("not available") ? 1 : 0;
    const bHasSource =
      b.source && b.source.trim() !== "" && !b.source.toLowerCase().includes("not available") ? 1 : 0;
    return bHasSource - aHasSource;
  });

  return claims.slice(0, n);
}

/**
 * PRISM Pipeline -- Phase 3: SYNTHESIZE
 *
 * Emergence Detection & Synthesis Engine.
 *
 * This is the product differentiator. If PRISM cannot find insights that
 * a single analyst would miss, it has no reason to exist.
 *
 * Implements all 4 emergence detection algorithms from methodology-core.md:
 * 1. Cross-Agent Theme Mining (with Source Independence Test)
 * 2. Tension Point Mapping (with conflict classification + resolution)
 * 3. Gap Triangulation (shared absences)
 * 4. Structural Pattern Recognition (deep principles)
 *
 * Plus conflict resolution, emergence quality scoring, critic review,
 * and tiered synthesis strategies.
 *
 * Uses Anthropic SDK directly with:
 * - Opus model with extended thinking for deep reasoning
 * - Prompt caching for the methodology system prompt
 * - submit_synthesis tool for structured output
 * - Zod validation of all outputs
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  getAnthropicClient,
  MODELS,
  EXTENDED_THINKING,
  cachedSystemPrompt,
} from "@/lib/ai/client";
import {
  SynthesisResultSchema,
  type SynthesisResult,
  type AgentResult,
  type Blueprint,
  type PipelineEvent,
  type SynthesisLayer,
  type EmergentInsight,
} from "./types";
import type { MemoryBus } from "./memory-bus";

// ─── Types ──────────────────────────────────────────────────

export interface SynthesizeInput {
  agentResults: AgentResult[];
  blueprint: Blueprint;
  criticResult?: AgentResult;
  memoryBus?: MemoryBus;
  emitEvent: (event: PipelineEvent) => void;
}

/** Backward-compatible output type */
export interface SynthesizeOutput {
  synthesis: SynthesisResult;
  qualityPassed: boolean;
  qualityIssues: string[];
  warnings: string[];
  synthesisStrategy: "direct" | "validated" | "grouped" | "hierarchical";
}

// ─── Methodology-Core Sections 4-6 (System Prompt) ──────────

const METHODOLOGY_SECTIONS_4_6 = `## 4. Emergence Detection

### Algorithm 1: Cross-Agent Theme Mining
Identify themes appearing in multiple agent outputs using different language/evidence.
- Same concept, same evidence = CORROBORATION (not emergence)
- Same concept, different evidence = CONVERGENT EMERGENCE (strong signal)
- Related concepts forming a pattern = PATTERN EMERGENCE (deepest insight)

**Source Independence Test (REQUIRED before declaring CONVERGENT EMERGENCE):**
Before promoting a finding to convergent emergence, trace each agent's evidence back to its
PRIMARY source. If multiple agents cite different secondary analyses (e.g., different trade
press articles) that all derive from the SAME primary source, downgrade to CORROBORATED
FINDING, not CONVERGENT EMERGENCE. True convergent emergence requires genuinely independent
evidence trails. Confidence is bounded by the accuracy of any shared primary source. If that
shared root is itself secondary/tertiary, flag for primary source validation before the
finding enters synthesis.

### Algorithm 2: Tension Point Mapping
Find where agent perspectives create productive tension.
- List ALL findings where agents explicitly or implicitly disagree
- Classify each conflict:

| Type | Signature | Resolution Strategy |
|------|-----------|---------------------|
| Factual | Disagreement on verifiable facts | Evidence Weighting (primary=3, secondary=2, tertiary=1, +1 recency, +1 corroboration). Gap >3 = higher score wins. Gap <=3 = contested. |
| Interpretive | Same facts, different meaning | Perspective Synthesis (find common ground, divergence point, higher-order frame, synthesized position. If no synthesis: preserve as dual perspectives.) |
| Methodological | Different approaches, different results | Framework Arbitration (identify methodological difference, evaluate appropriateness for context, use best-fit method or report range.) |
| Predictive | Disagreement about future | Scenario Branching (construct scenarios for each prediction + neither, identify robust strategies that work across scenarios.) |
| Values-Based | Different priorities | Stakeholder Mapping (surface different priorities, map to stakeholder interests, present for human decision.) |
| Scope | Different problem definitions | Scope Alignment (identify scope differences, determine which scope is most relevant to the query.) |

- For each tension, ask: "What if BOTH are true?" -- this often reveals deeper structure
- Productive tensions that cannot be resolved: preserve as genuine complexity (do NOT flatten them)

### Algorithm 3: Gap Triangulation
Multiple agents independently noting the absence of the same thing.
- Collect each agent's "what I couldn't find" (gaps section)
- Shared gaps are often MORE IMPORTANT than shared findings
- For each shared gap: "WHY is this missing?" (data doesn't exist? proprietary? not yet studied? deliberately hidden?)

### Algorithm 4: Structural Pattern Recognition
Agents solving different sub-problems arrive at structurally similar solutions.
- Compare the STRUCTURE (not content) of agent outputs
- Example: Agent A finds "drug pricing uses tiered access" and Agent B finds "quality programs use tiered incentives" = structural similarity = "tiering as a control mechanism"
- Structural similarity across domains suggests a deep underlying principle
- These are the highest-value emergent insights

### Emergence Quality Scoring
Every emergent insight MUST be scored on 5 dimensions (each 1-5):

| Metric | Question |
|--------|----------|
| Novelty | Would any single agent have stated this? (1=yes obviously, 5=impossible from one agent) |
| Grounding | Supported by evidence from 2+ agents? (1=no evidence, 5=strong multi-agent evidence) |
| Actionability | Suggests a specific decision or action? (1=purely academic, 5=clear "do this") |
| Depth | Explains WHY, not just WHAT? (1=surface observation, 5=deep causal mechanism) |
| Surprise | Contradicts initial assumptions? (1=obvious, 5=genuinely unexpected) |

**QUALITY GATE: An insight qualifies as "emergent" ONLY if it scores 4+ on at least 3 of these 5 dimensions.** Below that threshold, it is a finding, not an emergence. Be honest about this -- false emergence is worse than no emergence.

## 5. Conflict Resolution

### Conflict Classification

| Type | Signature | Resolution Strategy |
|------|-----------|---------------------|
| Factual | Disagreement on verifiable facts | Evidence Weighting |
| Interpretive | Same facts, different meaning | Perspective Synthesis |
| Methodological | Different approaches, different results | Framework Arbitration |
| Predictive | Disagreement about future | Scenario Branching |
| Values-Based | Different priorities | Stakeholder Mapping |
| Scope | Different problem definitions | Scope Alignment |

### Resolution Strategies

**Evidence Weighting:** Score evidence (primary=3, secondary=2, tertiary=1, recency +1, corroboration +1). Gap >3 = higher score wins. Gap <=3 = contested.

**Perspective Synthesis:** Find common ground, identify divergence point, seek higher-order frame, synthesized position. If no synthesis: preserve as dual perspectives.

**Framework Arbitration:** Identify methodological difference, evaluate appropriateness for context, use best-fit method's results or report range.

**Scenario Branching:** Construct scenarios for each prediction + neither. Identify robust strategies that work across scenarios.

**Stakeholder Mapping:** Surface different priorities, map to stakeholder interests, present for human decision.

### Escalation Ladder
1. Auto-Resolve (evidence clearly favors one side, gap >3)
2. Synthesis Attempt (integrative resolution)
3. Preserve as Complexity (both views presented, human decides)
4. Flag for Human (surface with recommendation)

## 6. Tiered Synthesis Protocol

| Tier | Agents | Strategy | Process |
|------|--------|----------|---------|
| MICRO | 2-4 | Direct | Single synthesizer reads all outputs |
| STANDARD | 5-8 | Validated | Synthesizer then Critic review then Refined output |
| EXTENDED | 9-12 | Grouped | Cluster agents then Sub-synthesizers then Meta-synthesizer |
| MEGA | 13-15 | Hierarchical | Sub-swarms then Sub-synths then Meta-orchestrator then Final |
| CAMPAIGN | 15+ | Multi-phase | Sequential swarm phases with persistent memory |

### Synthesis Layers (ALL 5 REQUIRED for every tier)

1. **Foundation Layer:** Uncontested ground -- what ALL agents agree on
2. **Convergence Layer:** Where agents independently arrived at same truth via different evidence paths
3. **Tension Layer:** Productive tensions preserved as genuine complexity (NOT artificially resolved)
4. **Emergence Layer:** Insights visible ONLY from seeing all perspectives at once
5. **Gap Layer:** What the swarm collectively could NOT determine (be honest about this)`;


// ─── System Prompt ──────────────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You are the PRISM Emergence Detection & Synthesis Engine. You have received the structured output from multiple independent AI research agents, each analyzing a different dimension of a strategic question.

Your job is THE most important part of the entire PRISM pipeline: finding insights that NO single agent would have discovered alone. This is emergence -- the whole revealing what the parts cannot.

${METHODOLOGY_SECTIONS_4_6}

## Critical Rules
1. **Emergence must be REAL.** Do not manufacture fake emergent insights. If 5 agents produce only 1 genuine emergence, report 1 -- not 5 forced ones.
2. **Preserve complexity.** Productive tensions are features, not bugs.
3. **Be transparent about gaps.** What the swarm could not find is as important as what it found.
4. **Source everything.** Every insight traces back to specific agent findings with evidence.
5. **Calibrate honestly.** Quality scores must reflect reality, not aspirations.
6. **Every emergent insight MUST include a whyMultiAgent explanation** -- explain precisely why this insight required multiple agents to discover and could not have been found by any single agent alone.
7. **Apply ALL 4 algorithms.** Do not skip any of the emergence detection algorithms. Each one may reveal different types of insights.
8. **Produce ALL 5 synthesis layers.** Every layer must be populated. An empty gap layer is a red flag for suppressed uncertainty.`;


// ─── SynthesisResult JSON Schema for submit_synthesis tool ──

function getSynthesisResultJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(SynthesisResultSchema) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}


// ─── Main Function ──────────────────────────────────────────

/**
 * Phase 3: SYNTHESIZE -- Tiered Emergence Detection & Synthesis.
 *
 * Routes to tier-appropriate synthesis strategy:
 * - MICRO (2-4 agents): Direct -- single Opus call
 * - STANDARD (5-8): Validated -- synthesis then critic review then revision
 * - EXTENDED (9-12): Grouped -- cluster then sub-synthesize then meta-synthesize
 * - MEGA/CAMPAIGN (13+): Hierarchical -- grouped + meta pass
 */
export async function synthesize(input: SynthesizeInput): Promise<SynthesisResult> {
  const { agentResults, blueprint, criticResult, memoryBus, emitEvent } = input;

  if (agentResults.length < 2) {
    throw new Error(
      `Cannot synthesize with fewer than 2 agent results. Got ${agentResults.length}.`,
    );
  }

  emitEvent({
    type: "synthesis_started",
    agentCount: agentResults.length,
  });

  // Determine synthesis strategy based on ACTUAL agent count, not tier label.
  // The tier label reflects query complexity, but synthesis routing should be
  // driven by the data volume we're synthesizing. With <=6 agents, the clustered
  // EXTENDED path creates a single cluster and a redundant meta-synthesis layer
  // that adds latency and risk of API termination for no benefit.
  const agentCount = agentResults.length;
  const effectiveSynthesisStrategy =
    agentCount <= 4 ? "direct" :
    agentCount <= 8 ? "validated" :
    "clustered";

  console.log(`[SYNTHESIZE] Tier=${blueprint.tier}, agents=${agentCount}, strategy=${effectiveSynthesisStrategy}`);
  let synthesis: SynthesisResult;

  switch (effectiveSynthesisStrategy) {
    case "direct":
      synthesis = await directSynthesis(
        agentResults,
        blueprint,
        criticResult,
        emitEvent,
        undefined,
        memoryBus,
      );
      break;

    case "validated": {
      // Synthesis -> CRITIC review -> revision
      synthesis = await directSynthesis(
        agentResults,
        blueprint,
        criticResult,
        emitEvent,
        undefined,
        memoryBus,
      );

      emitEvent({
        type: "agent_progress",
        agentName: "synthesis-critic",
        progress: 50,
        message: "Running critic review of synthesis...",
      });

      const revisions = await criticReview(synthesis, agentResults);

      if (revisions.length > 0) {
        // Emit critic revisions first (even if revision pass fails)
        for (const revision of revisions) {
          emitEvent({
            type: "critic_review",
            issue: revision,
            severity: "warning",
          });
        }

        // Apply revisions via a second synthesis pass (graceful fallback)
        try {
          const revisedSynthesis = await directSynthesis(
            agentResults,
            blueprint,
            criticResult,
            emitEvent,
            revisions,
            memoryBus,
          );
          revisedSynthesis.criticRevisions = revisions;
          synthesis = revisedSynthesis;
        } catch (revisionError) {
          console.warn(`[SYNTHESIZE] Revision pass failed, using initial synthesis: ${revisionError}`);
          // Keep the original synthesis but attach the critic revisions
          synthesis.criticRevisions = revisions;
        }
      }
      break;
    }

    case "clustered": {
      // Cluster agents by interconnection -> sub-synthesize -> meta-synthesize
      const clusters = clusterAgents(blueprint, agentResults);

      emitEvent({
        type: "agent_progress",
        agentName: "synthesis-orchestrator",
        progress: 10,
        message: `Grouped synthesis: ${clusters.length} clusters detected. Running sub-synthesizers...`,
      });

      // Sub-synthesize each cluster
      const subSyntheses: Array<{ clusterName: string; synthesis: SynthesisResult }> = [];

      for (let ci = 0; ci < clusters.length; ci++) {
        const cluster = clusters[ci];
        console.log(`[SYNTHESIZE] Sub-synthesis ${ci + 1}/${clusters.length}: cluster "${cluster.name}" (${cluster.agents.length} agents)`);
        const subSynthesis = await directSynthesis(
          cluster.agents,
          blueprint,
          criticResult,
          emitEvent,
          undefined,
          memoryBus,
        );
        console.log(`[SYNTHESIZE] Sub-synthesis ${ci + 1}/${clusters.length} complete: ${subSynthesis.layers.length} layers, ${subSynthesis.emergentInsights.length} emergences`);
        subSyntheses.push({ clusterName: cluster.name, synthesis: subSynthesis });
      }

      // Meta-synthesize
      console.log(`[SYNTHESIZE] Starting meta-synthesis across ${subSyntheses.length} clusters...`);
      synthesis = await metaSynthesize(
        subSyntheses,
        blueprint,
        agentResults,
        criticResult,
        emitEvent,
      );

      // Run critic review on meta-synthesis for larger swarms
      if (agentResults.length >= 10) {
        const revisions = await criticReview(synthesis, agentResults);
        if (revisions.length > 0) {
          synthesis.criticRevisions = revisions;
          for (const revision of revisions) {
            emitEvent({
              type: "critic_review",
              issue: revision,
              severity: "warning",
            });
          }
        }
      }
      break;
    }

    default:
      synthesis = await directSynthesis(
        agentResults,
        blueprint,
        criticResult,
        emitEvent,
        undefined,
        memoryBus,
      );
  }

  // Emit layer events
  for (const layer of synthesis.layers) {
    emitEvent({ type: "synthesis_layer", layer });
  }

  // Emit emergence events (only qualified ones)
  for (const insight of synthesis.emergentInsights) {
    const scores = insight.qualityScores;
    const scoreValues = [
      scores.novelty,
      scores.grounding,
      scores.actionability,
      scores.depth,
      scores.surprise,
    ];
    const qualifies = scoreValues.filter((s) => s >= 4).length >= 3;
    if (qualifies) {
      emitEvent({ type: "emergence_detected", insight });
    }
  }

  return synthesis;
}


// ─── Direct Synthesis (MICRO + base for all tiers) ──────────

/**
 * Single-pass synthesis using Opus with extended thinking.
 * Used directly for MICRO, and as the base call for STANDARD/EXTENDED+.
 */
async function directSynthesis(
  agentResults: AgentResult[],
  blueprint: Blueprint,
  criticResult: AgentResult | undefined,
  emitEvent: (event: PipelineEvent) => void,
  criticRevisions?: string[],
  memoryBus?: MemoryBus,
): Promise<SynthesisResult> {
  const client = getAnthropicClient();

  const agentSummaries = formatAgentSummaries(agentResults);
  const metrics = calculatePreSynthesisMetrics(agentResults);

  let userPrompt = `Here are the structured outputs from ${agentResults.length} independent PRISM agents analyzing this strategic question:

"${blueprint.query}"

${agentSummaries}

---

Pre-synthesis quality metrics:
- Total findings: ${metrics.totalFindings}
- Sourced findings: ${metrics.sourcedFindings} (${metrics.sourceCoveragePercent}%)
- Confidence distribution: HIGH=${metrics.confidenceDist.high}, MEDIUM=${metrics.confidenceDist.medium}, LOW=${metrics.confidenceDist.low}
- Agents: ${agentResults.length} successful

Now run ALL FOUR emergence detection algorithms. Produce the complete synthesis with all 5 layers, qualified emergent insights with quality scores and whyMultiAgent explanations, tension points with conflict classification and resolution strategy, and overall confidence.

Remember: emergence must be REAL. Score honestly. Preserve productive tensions. Be transparent about gaps. Every emergent insight must explain why it required multiple agents.`;

  // Include CRITIC-FACTUAL result as factual ground truth
  if (criticResult) {
    userPrompt += `

---

## FACTUAL GROUND TRUTH (from CRITIC-FACTUAL verification agent)

The following findings have been independently verified by a fact-checking agent. Your synthesis MUST NOT override or contradict these verified facts:

${criticResult.findings
  .map(
    (f) =>
      `- **${f.statement}** (confidence: ${f.confidence}, source: ${f.source})\n  Evidence: ${f.evidence}`,
  )
  .join("\n\n")}

${
  criticResult.gaps.length > 0
    ? `\nVerification gaps (could not confirm): ${criticResult.gaps.join("; ")}`
    : ""
}`;
  }

  // Include critic revisions if this is a revision pass
  if (criticRevisions && criticRevisions.length > 0) {
    userPrompt += `

---

## CRITIC FEEDBACK (address these issues in your revised synthesis)

${criticRevisions.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Revise your synthesis to address these weaknesses while maintaining the quality of your emergence detection.`;
  }

  // Append MemoryBus context if available
  if (memoryBus) {
    const openConflicts = memoryBus.getOpenConflicts();
    if (openConflicts.length > 0) {
      userPrompt += `

---

## Agent Conflicts (from MemoryBus)

The following formal disagreements between agents were registered during execution. Consider these when mapping tension points and resolving conflicts:

${openConflicts
  .map(
    (c) =>
      `### Conflict: ${c.claim}
- ID: ${c.id}
- Type: ${c.resolutionStrategy ?? "unclassified"}
- Registered at: ${c.timestamp}
- Positions:
${c.positions
  .map(
    (p) =>
      `  - **${p.agent}**: ${p.position} (confidence: ${p.confidence})
    Evidence: ${p.evidence}`,
  )
  .join("\n")}${c.resolution ? `\n- Prior resolution: ${c.resolution}` : ""}`,
  )
  .join("\n\n")}`;
    }

    const criticalSignals = memoryBus.readSignals({ priority: "high" });
    if (criticalSignals.length > 0) {
      userPrompt += `

---

## Critical Signals (from MemoryBus)

High-priority and critical inter-agent signals that may indicate important discoveries or warnings:

${criticalSignals
  .map(
    (s) =>
      `- **[${s.priority.toUpperCase()}]** ${s.from} → ${s.to}: ${s.message} (type: ${s.type}, at: ${s.timestamp})`,
  )
  .join("\n")}`;
    }

    const bbSummary = memoryBus.getBlackboardSummary();
    const summaryKeys = Object.keys(bbSummary);
    if (summaryKeys.length > 0) {
      const totalEntries = summaryKeys.reduce((sum, k) => sum + bbSummary[k], 0);
      userPrompt += `

---

## Blackboard Coverage (from MemoryBus)

The shared blackboard accumulated ${totalEntries} entries across these knowledge areas:

${summaryKeys
  .map((k) => `- **${k}**: ${bbSummary[k]} entries`)
  .join("\n")}

Consider whether the synthesis adequately covers all knowledge areas, and note any imbalances in coverage.`;
    }
  }

  userPrompt += `

Call the submit_synthesis tool with your complete synthesis.`;

  const synthStream = client.messages.stream({
    model: MODELS.SYNTHESIZE,
    max_tokens: 32000,
    thinking: EXTENDED_THINKING,
    system: [cachedSystemPrompt(SYNTHESIS_SYSTEM_PROMPT)],
    tools: [
      {
        name: "submit_synthesis",
        description:
          "Submit the completed synthesis with all 5 layers, emergent insights, tension points, and overall confidence. " +
          "You MUST call this tool with the full synthesis object.",
        input_schema:
          getSynthesisResultJsonSchema() as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "auto" as const },
    messages: [{ role: "user", content: userPrompt }],
  });
  const response = await synthStream.finalMessage();
  console.log(`[SYNTHESIZE/directSynthesis] LLM response received. Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

  // Extract synthesis from tool_use response
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use",
  );

  if (!toolUseBlock) {
    const textBlocks = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text.substring(0, 200));
    console.error(`[SYNTHESIZE/directSynthesis] No tool_use block found. Stop: ${response.stop_reason}. Text: ${JSON.stringify(textBlocks)}`);
    throw new Error(
      "SYNTHESIZE phase failed: model did not call submit_synthesis tool. " +
        `Stop reason: ${response.stop_reason}`,
    );
  }

  const rawSynthesis = toolUseBlock.input as Record<string, unknown>;
  console.log(`[SYNTHESIZE/directSynthesis] Tool call received. Layers: ${(rawSynthesis.layers as unknown[])?.length ?? "?"}, parsing with Zod...`);

  // Validate with Zod
  let synthesis: SynthesisResult;
  try {
    synthesis = SynthesisResultSchema.parse(rawSynthesis);
  } catch (zodErr) {
    console.error(`[SYNTHESIZE/directSynthesis] Zod validation failed:`, zodErr);
    throw zodErr;
  }

  // Post-synthesis: resolve MemoryBus conflicts addressed by tension points
  if (memoryBus) {
    const openConflicts = memoryBus.getOpenConflicts();
    for (const conflict of openConflicts) {
      const claimLower = conflict.claim.toLowerCase();
      // Find a tension point whose text overlaps with this conflict's claim
      const matchingTension = synthesis.tensionPoints.find((tp) => {
        const tensionLower = tp.tension.toLowerCase();
        // Check for meaningful word overlap between the claim and tension text
        const claimWords = claimLower.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = claimWords.filter((w) => tensionLower.includes(w)).length;
        return matchCount >= Math.min(2, claimWords.length);
      });

      if (matchingTension && matchingTension.resolution) {
        memoryBus.resolveConflict(
          conflict.id,
          matchingTension.resolution,
          "synthesis_resolution",
        );
        emitEvent({
          type: "memory_conflict_resolved",
          conflictId: conflict.id,
          resolution: matchingTension.resolution,
        });
        console.log(
          `[SYNTHESIZE] Resolved MemoryBus conflict "${conflict.claim}" via tension point resolution.`,
        );
      }
    }
  }

  // Post-validation: apply emergence quality gate
  // Filter out emergent insights that don't meet the 4+ on 3/5 threshold
  const qualifiedInsights = synthesis.emergentInsights.filter((insight) => {
    const scores = insight.qualityScores;
    const scoreValues = [
      scores.novelty,
      scores.grounding,
      scores.actionability,
      scores.depth,
      scores.surprise,
    ];
    return scoreValues.filter((s) => s >= 4).length >= 3;
  });

  if (qualifiedInsights.length < synthesis.emergentInsights.length) {
    const dropped =
      synthesis.emergentInsights.length - qualifiedInsights.length;
    console.warn(
      `[SYNTHESIZE] Dropped ${dropped} emergent insight(s) that failed quality gate (4+ on 3/5 dimensions).`,
    );
  }

  synthesis.emergentInsights = qualifiedInsights;

  return synthesis;
}


// ─── Meta-Synthesis (for EXTENDED+ tiers) ───────────────────

/**
 * Meta-synthesis that integrates sub-syntheses from clustered agent groups.
 * Focuses on cross-cluster emergence that individual sub-synthesizers missed.
 */
async function metaSynthesize(
  subSyntheses: Array<{ clusterName: string; synthesis: SynthesisResult }>,
  blueprint: Blueprint,
  allAgentResults: AgentResult[],
  criticResult: AgentResult | undefined,
  emitEvent: (event: PipelineEvent) => void,
): Promise<SynthesisResult> {
  const client = getAnthropicClient();

  const metaPrompt = `You are performing META-SYNTHESIS for a grouped PRISM analysis.

${subSyntheses.length} sub-synthesis groups have independently analyzed aspects of this question:
"${blueprint.query}"

${subSyntheses
  .map(
    (ss) => `## Cluster: ${ss.clusterName}

### Foundation:
${ss.synthesis.layers.find((l) => l.name === "foundation")?.insights.join("\n") ?? "None"}

### Convergence:
${ss.synthesis.layers.find((l) => l.name === "convergence")?.insights.join("\n") ?? "None"}

### Tensions:
${ss.synthesis.tensionPoints.map((t) => `- ${t.tension} [${t.conflictType}]: ${t.resolution}`).join("\n") || "None"}

### Emergent Insights:
${ss.synthesis.emergentInsights.map((e) => `- ${e.insight} (algorithm: ${e.algorithm}, whyMultiAgent: ${e.whyMultiAgent})`).join("\n") || "None"}

### Gaps:
${ss.synthesis.layers.find((l) => l.name === "gap")?.insights.join("\n") ?? "None"}`,
  )
  .join("\n\n---\n\n")}

${
  criticResult
    ? `\n## FACTUAL GROUND TRUTH (from CRITIC-FACTUAL)\n${criticResult.findings.map((f) => `- ${f.statement} (${f.confidence})`).join("\n")}`
    : ""
}

Now perform CROSS-CLUSTER emergence detection:
1. What themes emerge across clusters that no single cluster identified?
2. What tensions exist BETWEEN clusters (not just within)?
3. What gaps appear across all clusters?
4. What structural patterns repeat across clusters?

Produce the final integrated synthesis with all 5 layers, combining insights from all clusters. The emergence layer should focus on CROSS-CLUSTER emergence -- insights that only become visible when viewing all clusters together.

Call submit_synthesis with the complete result.`;

  emitEvent({
    type: "agent_progress",
    agentName: "meta-synthesizer",
    progress: 70,
    message: "Running cross-cluster meta-synthesis...",
  });

  const metaStream = client.messages.stream({
    model: MODELS.SYNTHESIZE,
    max_tokens: 32000,
    thinking: EXTENDED_THINKING,
    system: [cachedSystemPrompt(SYNTHESIS_SYSTEM_PROMPT)],
    tools: [
      {
        name: "submit_synthesis",
        description:
          "Submit the completed meta-synthesis with all 5 layers, emergent insights, tension points, and overall confidence.",
        input_schema:
          getSynthesisResultJsonSchema() as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "auto" as const },
    messages: [{ role: "user", content: metaPrompt }],
  });
  const response = await metaStream.finalMessage();
  console.log(`[SYNTHESIZE/metaSynthesize] LLM response received. Stop reason: ${response.stop_reason}, content blocks: ${response.content.length}`);

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use",
  );

  if (!toolUseBlock) {
    console.error(`[SYNTHESIZE/metaSynthesize] No tool_use block found. Stop: ${response.stop_reason}`);
    throw new Error(
      "META-SYNTHESIS failed: model did not call submit_synthesis tool.",
    );
  }

  const rawSynthesis = toolUseBlock.input as Record<string, unknown>;
  const synthesis = SynthesisResultSchema.parse(rawSynthesis);

  // Merge qualified emergent insights from sub-syntheses (deduplicated)
  const existingInsights = new Set(
    synthesis.emergentInsights.map((e) =>
      e.insight.toLowerCase().substring(0, 60),
    ),
  );

  for (const sub of subSyntheses) {
    for (const e of sub.synthesis.emergentInsights) {
      const key = e.insight.toLowerCase().substring(0, 60);
      if (!existingInsights.has(key)) {
        synthesis.emergentInsights.push(e);
        existingInsights.add(key);
      }
    }
  }

  // Apply quality gate to all merged insights
  synthesis.emergentInsights = synthesis.emergentInsights.filter((insight) => {
    const scores = insight.qualityScores;
    const scoreValues = [
      scores.novelty,
      scores.grounding,
      scores.actionability,
      scores.depth,
      scores.surprise,
    ];
    return scoreValues.filter((s) => s >= 4).length >= 3;
  });

  return synthesis;
}


// ─── Critic Review ──────────────────────────────────────────

/**
 * Critic review: send synthesis to Opus asking it to identify weaknesses,
 * unsupported claims, and missing connections.
 * Returns a list of revision suggestions.
 */
export async function criticReview(
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
): Promise<string[]> {
  const client = getAnthropicClient();

  const CriticResponseSchema = z.object({
    revisions: z.array(z.string()),
    overallAssessment: z.string(),
  });

  function getCriticJsonSchema(): Record<string, unknown> {
    const schema = z.toJSONSchema(CriticResponseSchema) as Record<string, unknown>;
    delete schema["$schema"];
    return schema;
  }

  const criticPrompt = `Review this PRISM synthesis for quality issues.

## Synthesis Layers
${synthesis.layers.map((l) => `**${l.name}** (${l.insights.length} insights): ${l.description}\n${l.insights.map((i) => `  - ${i}`).join("\n")}`).join("\n\n")}

## Emergent Insights (${synthesis.emergentInsights.length})
${synthesis.emergentInsights.map((e) => `- ${e.insight}\n  Algorithm: ${e.algorithm}\n  Quality: novelty=${e.qualityScores.novelty}, grounding=${e.qualityScores.grounding}, actionability=${e.qualityScores.actionability}, depth=${e.qualityScores.depth}, surprise=${e.qualityScores.surprise}\n  Why multi-agent: ${e.whyMultiAgent}`).join("\n\n")}

## Tension Points (${synthesis.tensionPoints.length})
${synthesis.tensionPoints.map((t) => `- ${t.tension} [${t.conflictType}]\n  Side A: ${t.sideA.position} (agents: ${t.sideA.agents.join(", ")})\n  Side B: ${t.sideB.position} (agents: ${t.sideB.agents.join(", ")})\n  Resolution: ${t.resolution}`).join("\n\n")}

## Source Agent Results (${agentResults.length} agents)
${agentResults.map((r) => `- ${r.agentName} (${r.archetype}): ${r.findings.length} findings, ${r.gaps.length} gaps`).join("\n")}

## Overall Confidence
${synthesis.overallConfidence}

---

As the PRISM Quality Critic, identify:
1. **Unsupported claims**: Are synthesis insights actually backed by agent findings?
2. **False emergence**: Do "emergent" insights genuinely require multi-agent perspective?
3. **Missing connections**: Are there cross-agent patterns the synthesis missed?
4. **Suppressed uncertainty**: Are gaps being hidden or minimized?
5. **Over-confidence**: Is the overall confidence rating honest?
6. **Bias**: Are any agent perspectives systematically over-represented or suppressed?

Return your revisions -- specific, actionable items for improving the synthesis.
Call submit_critic_review with your assessment.`;

  const criticStream = client.messages.stream({
    model: MODELS.CRITIC,
    max_tokens: 8192,
    system: [
      cachedSystemPrompt(
        `You are the PRISM Quality Critic. Your job is adversarial review of a completed synthesis. Be constructively harsh -- it is better to catch issues now than to deliver a flawed brief. Focus on evidence gaps, false emergence, and suppressed uncertainty.`,
      ),
    ],
    tools: [
      {
        name: "submit_critic_review",
        description:
          "Submit your critic review with revision suggestions and overall assessment.",
        input_schema:
          getCriticJsonSchema() as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool" as const, name: "submit_critic_review" },
    messages: [{ role: "user", content: criticPrompt }],
  });
  const response = await criticStream.finalMessage();

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use",
  );

  if (!toolUseBlock) {
    console.warn("[SYNTHESIZE] Critic review did not call submit_critic_review.");
    return [];
  }

  const rawReview = toolUseBlock.input as Record<string, unknown>;

  try {
    const review = CriticResponseSchema.parse(rawReview);
    return review.revisions;
  } catch {
    console.warn("[SYNTHESIZE] Failed to parse critic review response.");
    return [];
  }
}


// ─── Agent Clustering ───────────────────────────────────────

interface AgentCluster {
  name: string;
  agents: AgentResult[];
  dimensions: string[];
}

/**
 * Cluster agents by dimension interconnection proximity.
 * Uses the blueprint's interconnection map to group tightly-coupled
 * dimensions together.
 */
function clusterAgents(
  blueprint: Blueprint,
  agents: AgentResult[],
): AgentCluster[] {
  const dimensions = agents.map((a) => a.dimension);
  const uniqueDimensions = [...new Set(dimensions)];

  // If 4 or fewer unique dimensions, no need to cluster
  if (uniqueDimensions.length <= 4) {
    return [{ name: "All Agents", agents, dimensions: uniqueDimensions }];
  }

  // Build adjacency map from interconnections
  const adjacency: Record<string, Set<string>> = {};
  for (const dim of uniqueDimensions) {
    adjacency[dim] = new Set();
  }

  for (const ic of blueprint.interconnections) {
    if (
      adjacency[ic.dimensionA] &&
      adjacency[ic.dimensionB] &&
      ic.coupling >= 3
    ) {
      adjacency[ic.dimensionA].add(ic.dimensionB);
      adjacency[ic.dimensionB].add(ic.dimensionA);
    }
  }

  // Greedy clustering: group strongly-connected dimensions
  const assigned = new Set<string>();
  const clusters: AgentCluster[] = [];

  for (const dim of uniqueDimensions) {
    if (assigned.has(dim)) continue;

    const cluster: string[] = [dim];
    assigned.add(dim);

    // Add connected dimensions not yet assigned
    for (const connected of adjacency[dim]) {
      if (!assigned.has(connected) && cluster.length < 5) {
        cluster.push(connected);
        assigned.add(connected);
      }
    }

    clusters.push({
      name: cluster.join(" + "),
      agents: agents.filter((a) => cluster.includes(a.dimension)),
      dimensions: cluster,
    });
  }

  return clusters;
}


// ─── Helper: Format Agent Summaries ─────────────────────────

function formatAgentSummaries(results: AgentResult[]): string {
  return results
    .map(
      (r) => `## Agent: ${r.agentName} (${r.archetype}) -- Dimension: ${r.dimension}

### Findings (${r.findings.length}):
${r.findings
  .map(
    (f, i) =>
      `${i + 1}. **${f.statement}**
   - Evidence: ${f.evidence}
   - Confidence: ${f.confidence}
   - Source Tier: ${f.sourceTier}
   - Evidence Type: ${f.evidenceType}
   - Source: ${f.source}
   - Implication: ${f.implication}
   - Tags: ${f.tags.join(", ")}`,
  )
  .join("\n\n")}

### Gaps (what this agent could not find):
${r.gaps.length > 0 ? r.gaps.map((g) => `- ${g}`).join("\n") : "- None reported"}

### Signals for Other Agents:
${r.signals.length > 0 ? r.signals.map((s) => `- ${s}`).join("\n") : "- None"}

### Minority Views:
${r.minorityViews.length > 0 ? r.minorityViews.map((m) => `- ${m}`).join("\n") : "- None"}

### Tools Used: ${r.toolsUsed.join(", ") || "None"}`,
    )
    .join("\n\n---\n\n");
}


// ─── Helper: Pre-Synthesis Metrics ──────────────────────────

function calculatePreSynthesisMetrics(results: AgentResult[]) {
  const allFindings = results.flatMap((r) => r.findings);
  const totalFindings = allFindings.length;
  const sourcedFindings = allFindings.filter(
    (f) => f.source && f.source.trim() !== "",
  ).length;

  return {
    totalFindings,
    sourcedFindings,
    sourceCoveragePercent:
      totalFindings > 0
        ? Math.round((sourcedFindings / totalFindings) * 100)
        : 0,
    confidenceDist: {
      high: allFindings.filter((f) => f.confidence === "HIGH").length,
      medium: allFindings.filter((f) => f.confidence === "MEDIUM").length,
      low: allFindings.filter((f) => f.confidence === "LOW").length,
    },
  };
}

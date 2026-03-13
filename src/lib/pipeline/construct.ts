/**
 * PRISM Pipeline -- Phase 1: CONSTRUCT
 *
 * Agent Prompt Builder.
 *
 * Takes a Blueprint and produces fully-formed ConstructedAgent objects,
 * each tailored to the agent's archetype, dimension, and mandate.
 *
 * Quality controls:
 * - Neutral Framing Protocol applied to ethically-charged mandates AND
 *   archetype bias/lens descriptions in systemPrompt
 * - Source Tier Classification injected into EVERY agent's output requirements
 * - CRITIC-FACTUAL auto-added when blueprint.complexityScore.depth >= 4
 * - Every prompt requires structured output with anti-hallucination directive
 * - Agent color assignment for UI consistency
 * - Auto-forge protocol for novel dimensions with no matching archetype
 * - Data source tool routing from ToolRegistry + web_search from WEB_SEARCH_ARCHETYPES
 */

import type {
  Blueprint,
  AgentRecommendation,
  ConstructedAgent,
  ArchetypeFamily,
} from "./types";
import {
  ARCHETYPE_REGISTRY,
  getArchetype,
  forgeArchetype,
  type ArchetypeProfile,
} from "./archetypes";
import { getSkillRouter } from "./skill-router";
import { AGENT_COLORS } from "../constants";
import {
  WEB_SEARCH_ARCHETYPES,
  getToolRegistry,
} from "@/lib/data-sources/registry";
import { WEB_SEARCH_TOOL } from "@/lib/ai/client";

// Re-export archetype registry for external access
export { ARCHETYPE_REGISTRY } from "./archetypes";


// ─── Neutral Framing Protocol ───────────────────────────────

const ETHICALLY_CHARGED_PATTERNS = [
  /advocate|advocacy/i,
  /adversarial|devil's advocate/i,
  /patient harm|harm to patients/i,
  /denial|deny.*claim/i,
  /argue.*case.*for/i,
  /defend.*position/i,
  /economics of.*harm/i,
  /prior auth.*harm/i,
  /coverage denial/i,
];

/**
 * Apply the Neutral Framing Protocol to an agent mandate.
 * Reframes ethically-charged mandates as neutral research tasks
 * to prevent the documented 60% agent failure rate on sensitive topics.
 */
function applyNeutralFraming(text: string, dimension: string): string {
  const isEthicallyCharged = ETHICALLY_CHARGED_PATTERNS.some((p) =>
    p.test(text),
  );

  if (!isEthicallyCharged) return text;

  // Reframe: advocacy -> research, adversarial -> contrarian analysis
  return (
    text
      .replace(
        /advocate for|argue that|defend the position that/gi,
        "research evidence regarding",
      )
      .replace(/patient harm/gi, "patient outcomes and access metrics")
      .replace(
        /denial economics|economics of denial/gi,
        "utilization management financial impact",
      )
      .replace(/devil's advocate/gi, "contrarian analysis")
      .replace(
        /argue the strongest case for/gi,
        "research the strongest evidence-based counterarguments regarding",
      ) +
    `\n[NOTE: This content has been neutrally framed for the "${dimension}" dimension to ensure thorough, objective research.]`
  );
}


// ─── Source Tier Classification (injected into every agent) ──

const SOURCE_TIER_REQUIREMENTS = `

## Source Tier Classification (REQUIRED)

For each finding, classify source tier:
- **Source Tier:** PRIMARY | SECONDARY | TERTIARY
- If SECONDARY/TERTIARY for regulatory, clinical, or financial claims,
  you MUST attempt to locate the PRIMARY source and verify the claim.

Definitions:
- **PRIMARY**: Original data, official filings, peer-reviewed studies, government databases, first-party disclosures
- **SECONDARY**: Analysis/interpretation of primary sources (trade press, analyst reports, review articles)
- **TERTIARY**: Aggregated summaries, opinion pieces, Wikipedia, blog posts, social media`;


// ─── Output Requirements Template ───────────────────────────

const OUTPUT_REQUIREMENTS = `

## Required Output Structure

You MUST structure your analysis as follows. Every field is required.

### Findings (produce 3-8 findings)
For EACH finding, provide ALL of the following:
1. **Statement**: A clear, specific finding (one sentence)
2. **Evidence**: What supports this -- cite specific data, studies, documents, statistics
3. **Confidence**: HIGH, MEDIUM, or LOW
4. **Confidence Reasoning**: WHY this confidence level -- explain based on evidence quality, source diversity, and corroboration. Not just the label.
5. **Evidence Type**: "direct" (original data/study), "inferred" (analysis/review), "analogical" (parallel from another domain), or "modeled" (projection/forecast)
6. **Source**: Where this came from -- URL, document name, database name. Be specific.
7. **Implication**: So what? Why does this matter for the strategic question?
${SOURCE_TIER_REQUIREMENTS}

### Gaps & Uncertainties
- List what you COULD NOT determine
- For each gap: why is this information missing? (data doesn't exist? proprietary? not yet studied?)

### Signals for Other Agents
- Note observations relevant to OTHER dimensions being analyzed
- These cross-dimensional signals are critical for emergence detection

### Minority Views
- Important counter-perspectives or dissenting evidence
- Do NOT suppress views just because they contradict the majority -- they may be the most insightful finding

### Executive Summary
- One paragraph summarizing the most important takeaways

## Critical Rules
1. **Do NOT fabricate sources.** If you cannot find evidence for something, say "I could not find evidence for this" rather than inventing a citation. Fabricated sources will be detected during verification and will invalidate your findings.
2. **Calibrate confidence honestly.** If a finding is based on a single commentary article, it's LOW confidence even if the claim sounds definitive. If corroborated by 3 independent primary sources, it's HIGH.
3. **Acknowledge uncertainty.** A brief that honestly states what is NOT known is more trustworthy than one that appears to know everything.
4. **Be specific, not generic.** "Healthcare costs are rising" is not a finding. "Medicare Part D spending on GLP-1 agonists increased 47% YoY in Q3 2025 (CMS PUF data)" is a finding.`;


// ─── Tool Resolution ────────────────────────────────────────

/**
 * Resolve the complete tool list for an agent based on its archetype.
 * Combines in-process data source tools from ToolRegistry with
 * web_search from WEB_SEARCH_ARCHETYPES.
 */
function resolveToolsForArchetype(archetype: string): string[] {
  const tools: string[] = [];

  // In-process data source tools from ToolRegistry
  const registry = getToolRegistry();
  const dataSourceTools = registry.getToolNamesForArchetype(archetype as ArchetypeFamily);
  tools.push(...dataSourceTools);

  // Anthropic native web_search
  if (WEB_SEARCH_ARCHETYPES.has(archetype as ArchetypeFamily)) {
    tools.push(WEB_SEARCH_TOOL.name);
  }

  return tools;
}


// ─── Main Function ──────────────────────────────────────────

/**
 * Phase 1: CONSTRUCT -- Build full agent prompts from a Blueprint.
 *
 * For each agent in the blueprint:
 * 1. Look up the archetype profile from the full 25+ registry
 * 2. If no match, auto-forge a custom archetype
 * 3. Apply Neutral Framing Protocol if ethically-charged (mandate AND lens/bias)
 * 4. Compose the full system prompt with output requirements and source tier enforcement
 * 5. Resolve MCP tools + web_search from config
 * 6. Resolve skills from SkillRouter
 * 7. Assign a color for UI display
 *
 * If blueprint.complexityScore.depth >= 4, a CRITIC-FACTUAL agent is appended
 * to verify the top claims from the other agents.
 */
export function construct(input: {
  blueprint: Blueprint;
}): ConstructedAgent[] {
  const { blueprint } = input;
  const agents: ConstructedAgent[] = [];
  const ethicalConcerns = blueprint.ethicalConcerns ?? [];

  for (let i = 0; i < blueprint.agents.length; i++) {
    const agentRec = blueprint.agents[i];
    let profile = getArchetype(agentRec.archetype);

    // Auto-Forge Protocol: create archetype on the fly if not in registry
    if (!profile) {
      profile = forgeArchetype(agentRec.dimension, {
        domain: agentRec.dimension,
        lens: agentRec.lens,
        style:
          "Structured findings with evidence citations and confidence ratings",
        bias: agentRec.bias,
        successMetric: "At least one non-obvious, evidence-backed insight",
      });
    }

    // Check for ethical sensitivity
    const mandateIsEthical = ETHICALLY_CHARGED_PATTERNS.some((p) =>
      p.test(agentRec.mandate),
    );
    const dimensionIsEthical = ethicalConcerns.some(
      (c) =>
        agentRec.dimension.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(agentRec.dimension.toLowerCase()),
    );
    const needsNeutralFraming = mandateIsEthical || dimensionIsEthical;

    // Apply Neutral Framing to mandate
    const framedMandate = needsNeutralFraming
      ? applyNeutralFraming(agentRec.mandate, agentRec.dimension)
      : agentRec.mandate;

    // Apply Neutral Framing to lens and bias descriptions in systemPrompt
    const framedLens = needsNeutralFraming
      ? applyNeutralFraming(profile.lens, agentRec.dimension)
      : profile.lens;
    const framedBias = needsNeutralFraming
      ? applyNeutralFraming(profile.bias, agentRec.dimension)
      : profile.bias;

    // Resolve tools and skills
    const resolvedTools = resolveToolsForArchetype(agentRec.archetype);
    const skillRouter = getSkillRouter();
    const skills = profile.compatibleSkills;
    const skillContext = skillRouter.buildSkillContext(skills);

    // Build prompts
    const systemPrompt = buildAgentSystemPrompt(
      agentRec,
      profile,
      framedMandate,
      framedLens,
      framedBias,
      blueprint,
      resolvedTools,
      skillContext,
    );

    const researchPrompt = buildResearchPrompt(agentRec, blueprint);

    agents.push({
      name: agentRec.name,
      archetype: agentRec.archetype,
      dimension: agentRec.dimension,
      mandate: framedMandate,
      systemPrompt,
      researchPrompt,
      tools: resolvedTools,
      skills,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
      neutralFramingApplied: needsNeutralFraming,
    });
  }

  // ─── CRITIC-FACTUAL injection for high-depth blueprints ────

  if (blueprint.complexityScore.depth >= 4) {
    const criticProfile = getArchetype("CRITIC-FACTUAL");
    if (criticProfile) {
      const criticTools = resolveToolsForArchetype("CRITIC-FACTUAL");
      const criticSkills = criticProfile.compatibleSkills;
      const skillRouter = getSkillRouter();
      const criticSkillContext = skillRouter.buildSkillContext(criticSkills);

      const criticSystemPrompt = `You are CRITIC-FACTUAL, a specialized verification agent in the PRISM multi-agent analysis pipeline.

## Your Role
${criticProfile.description}

## Your Analytical Lens
${criticProfile.lens}

## Your Intentional Bias
${criticProfile.bias}

## Your Mandate
Verify the top claims produced by the other ${blueprint.agents.length} agents in this analysis.
For each high-confidence or high-impact claim:
1. Trace the claim to its PRIMARY source
2. Check whether the evidence actually supports the stated conclusion
3. Look for contradicting evidence from authoritative sources
4. Verify that statistics and citations are accurate
5. Flag any claims that rely solely on SECONDARY or TERTIARY sources for regulatory, clinical, or financial assertions

## Context
You are the verification layer for this strategic question:
"${blueprint.query}"

The following agents produced findings that you must verify:
${blueprint.agents.map((a) => `- ${a.name} (${a.archetype}): ${a.dimension}`).join("\n")}

## Available Tools
${criticTools.map((t) => `- ${t}`).join("\n")}
${criticSkillContext}

${OUTPUT_REQUIREMENTS}`;

      const criticResearchPrompt = `Review and verify the top claims from all agents analyzing: "${blueprint.query}"

Focus on:
1. Claims marked HIGH confidence -- are they actually supported by primary evidence?
2. Financial projections -- are the underlying numbers verified?
3. Regulatory assertions -- do they match current CMS rules and timelines?
4. Clinical claims -- are cited studies real and correctly interpreted?

For each claim you verify or challenge, provide your own source trail.`;

      agents.push({
        name: "Verification Critic",
        archetype: "CRITIC-FACTUAL",
        dimension: "Cross-Cutting Verification",
        mandate:
          "Verify top claims from all agents, trace to primary sources, flag unsupported assertions",
        systemPrompt: criticSystemPrompt,
        researchPrompt: criticResearchPrompt,
        tools: criticTools,
        skills: criticSkills,
        color:
          AGENT_COLORS[blueprint.agents.length % AGENT_COLORS.length],
        neutralFramingApplied: false,
      });
    }
  }

  return agents;
}


// ─── Prompt Builders ─────────────────────────────────────────

function buildAgentSystemPrompt(
  agent: AgentRecommendation,
  profile: ArchetypeProfile,
  mandate: string,
  lens: string,
  bias: string,
  blueprint: Blueprint,
  tools: string[],
  skillContext: string,
): string {
  const description = profile.description;

  // Use the archetype's full prompt template if available, or build from lens/bias
  const roleSection =
    profile.promptTemplate ||
    `You are ${agent.name}, a specialized intelligence agent.

## Your Analytical Lens
${lens}

## Your Intentional Bias
${bias}`;

  // Find this agent's dimension info
  const dimension = blueprint.dimensions.find(
    (d) => d.name === agent.dimension,
  );

  // Find interconnected dimensions
  const interconnected = blueprint.interconnections
    .filter(
      (i) =>
        i.dimensionA === agent.dimension ||
        i.dimensionB === agent.dimension,
    )
    .map((i) => {
      const otherDim =
        i.dimensionA === agent.dimension ? i.dimensionB : i.dimensionA;
      return `${otherDim} (coupling=${i.coupling}: ${i.mechanism})`;
    });

  return `You are ${agent.name}, a specialized intelligence agent in the PRISM multi-agent analysis pipeline.

## Your Role
${description}

${roleSection}

## Your Dimension
**${agent.dimension}**: ${dimension?.description ?? ""}

## Your Mandate
${mandate}

## Context
You are one of ${blueprint.agents.length} agents analyzing this strategic question:
"${blueprint.query}"

You are responsible for the "${agent.dimension}" dimension. Other agents are covering:
${blueprint.agents
    .filter((a) => a.name !== agent.name)
    .map((a) => `- ${a.name} -> ${a.dimension}`)
    .join("\n")}

${
  interconnected.length > 0
    ? `## Interconnected Dimensions
Your dimension has known interconnections with:
${interconnected.map((i) => `- ${i}`).join("\n")}

Pay special attention to findings that connect to these dimensions -- they are critical for emergence detection.`
    : ""
}
${skillContext}

## Available Tools
${tools.map((t) => `- ${t}`).join("\n")}

${OUTPUT_REQUIREMENTS}`;
}

/**
 * Build the research prompt -- the specific task instruction sent as the
 * user message when the agent is deployed.
 */
function buildResearchPrompt(
  agent: AgentRecommendation,
  blueprint: Blueprint,
): string {
  return `Research the following dimension for this strategic question:

Strategic Question: "${blueprint.query}"

Your Dimension: ${agent.dimension}
Your Mandate: ${agent.mandate}

Use your available tools to gather evidence. Produce structured findings per the output requirements in your system prompt. Focus on:
1. Evidence-backed findings with source citations
2. Gaps and uncertainties you could not resolve
3. Cross-dimensional signals for other agents
4. Minority views and counter-perspectives

Be thorough but do not fabricate. If you cannot find evidence, say so.`;
}

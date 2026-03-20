/**
 * Slide Planner
 *
 * Decomposes synthesis data into a SlideManifest via an LLM call.
 * Responsibilities:
 * - Build a structured planner prompt from synthesis + agent results
 * - Call Sonnet to generate a JSON SlideManifest
 * - Validate the response with SlideManifestSchema (Zod)
 * - Retry once on JSON parse / schema validation failures
 *
 * Also exports planSlidesWithData() for data-aware template selection
 * using a DatasetRegistry from the data capture pipeline.
 */

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import { resolveApiKey } from "@/lib/resolve-api-key";
import { ComponentCatalog } from "./component-catalog";
import { getAllTemplates } from "./template-registry";
import { SlideManifestSchema } from "./types";
import type { SlideManifest, PresentInput, PlannerInput, TemplateSlideManifest } from "./types";
import type { SynthesisResult, AgentResult, Blueprint } from "@/lib/pipeline/types";

// Use the specific model version requested for the planner
const PLANNER_MODEL = "claude-sonnet-4-20250514";

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Build the agent roster section: name, archetype, dimension, finding count.
 */
function buildAgentRoster(agentResults: AgentResult[], blueprint: Blueprint): string {
  return agentResults
    .map((ar) => {
      const bpAgent = blueprint.agents.find(
        (a) => a.name === ar.agentName || a.dimension === ar.dimension,
      );
      const lens = bpAgent ? ` | Lens: ${bpAgent.lens}` : "";
      return `- ${ar.agentName} (${ar.archetype}) — Dimension: ${ar.dimension}${lens} | Findings: ${ar.findings.length}`;
    })
    .join("\n");
}

/**
 * Format synthesis layers: name + description + key insights.
 */
function buildSynthesisLayers(synthesis: SynthesisResult): string {
  return synthesis.layers
    .map(
      (layer) =>
        `### ${layer.name.toUpperCase()} Layer\n${layer.description}\n` +
        layer.insights.slice(0, 3).map((ins) => `- ${ins}`).join("\n"),
    )
    .join("\n\n");
}

/**
 * Format emergent insights (or indicate none).
 */
function buildEmergentInsights(synthesis: SynthesisResult): string {
  if (synthesis.emergentInsights.length === 0) {
    return "No emergent insights detected — do NOT include an 'emergence' slide.";
  }

  return synthesis.emergentInsights
    .map(
      (ei, i) =>
        `${i + 1}. **${ei.insight}**\n` +
        `   Algorithm: ${ei.algorithm}\n` +
        `   Supporting agents: ${ei.supportingAgents.join(", ")}\n` +
        `   Why only multi-agent finds this: ${ei.whyMultiAgent}`,
    )
    .join("\n\n");
}

/**
 * Format tension points (or indicate none).
 */
function buildTensionPoints(synthesis: SynthesisResult): string {
  if (synthesis.tensionPoints.length === 0) {
    return "No significant tension points — do NOT include a 'tension' slide.";
  }

  return synthesis.tensionPoints
    .map(
      (tp) =>
        `**${tp.tension}** (${tp.conflictType})\n` +
        `  Side A: ${tp.sideA.position} — agents: ${tp.sideA.agents.join(", ")}\n` +
        `  Side B: ${tp.sideB.position} — agents: ${tp.sideB.agents.join(", ")}\n` +
        `  Resolution: ${tp.resolution}`,
    )
    .join("\n\n");
}

/**
 * Derive appropriate slide count guidance from blueprint tier.
 */
function getSlideCountGuidance(blueprint: Blueprint): string {
  const ranges: Record<string, string> = {
    MICRO: "8-10",
    STANDARD: "10-13",
    EXTENDED: "13-16",
    MEGA: "16-20",
    CAMPAIGN: "16-20",
  };
  const range = ranges[blueprint.tier] ?? "10-13";
  return `${range} slides for ${blueprint.tier} tier with ${blueprint.agents.length} agents`;
}

/**
 * Build the full planner user prompt from synthesis + agent results + blueprint.
 */
export function buildPlannerUserPrompt(
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
  blueprint: Blueprint,
): string {
  const agentRoster = buildAgentRoster(agentResults, blueprint);
  const synthesisLayers = buildSynthesisLayers(synthesis);
  const emergentInsights = buildEmergentInsights(synthesis);
  const tensionPoints = buildTensionPoints(synthesis);
  const slideCountGuidance = getSlideCountGuidance(blueprint);

  const totalFindings = agentResults.reduce((sum, ar) => sum + ar.findings.length, 0);

  return `# Slide Planner Request

## Query
${blueprint.query}

## Swarm Configuration
- Tier: ${blueprint.tier}
- Agent count: ${blueprint.agents.length}
- Total findings: ${totalFindings}
- Overall confidence: ${synthesis.overallConfidence}

## Target Slide Count
${slideCountGuidance}

## Agent Roster
${agentRoster}

## Synthesis Layers
${synthesisLayers}

## Emergent Insights
${emergentInsights}

## Tension Points
${tensionPoints}

## Slide Type Assignment Rules

Use these slide types from the allowed enum:
- "title" — Opening hero slide (always include exactly 1)
- "executive-summary" — Key takeaways (always include exactly 1)
- "dimension-deep-dive" — One per agent/dimension; for rich qualitative analysis; use componentHints: ["finding-card","quote-block","tag"]
- "data-metrics" — For agents with numeric/quantitative findings; use componentHints: ["stat-block","bar-chart","donut-chart","comparison-bars"]
- "emergence" — ONLY if emergent insights exist (use at most 1); componentHints: ["emergence-card","emergent-why"]
- "tension" — ONLY if tension points exist (use at most 1); componentHints: ["grid-2","finding-card"]
- "findings-toc" — Table of contents (include if ${blueprint.agents.length} >= 5)
- "closing" — Final call-to-action slide (always include exactly 1)

## Animation Type Assignment Rules
- "anim" — Default fade-up for most slides
- "anim-scale" — Use for title and closing slides
- "anim-blur" — Use for emergence slides

## Component Hints Rules
- dimension-deep-dive slides → ["finding-card", "confidence-badge", "tag", "quote-block"]
- data-metrics slides → ["stat-block", "stat-number", "bar-chart", "comparison-bars"]
- emergence slides → ["emergence-card", "emergent-why", "emergent-number"]
- tension slides → ["grid-2", "finding-card", "threat-meter"]
- executive-summary slides → ["finding-card", "card-blue", "card-green", "confidence-badge"]
- title slides → ["hero-title", "hero-stats", "agent-chip", "hero-badge"]
- closing slides → ["hero-title", "hero-sub", "tag-cyan"]

## agentSources Field
For each dimension/data-metrics slide, set agentSources to the list of agent names that inform that slide.
For cross-cutting slides (title, summary, closing), set agentSources to all agent names.

## dataPoints Field
Extract 1-3 numeric data points per slide where meaningful. Each dataPoint needs:
- label: descriptive label
- value: a number (integer or float)
- unit: optional unit string (e.g. "%", "M", "B")
- prefix: optional prefix (e.g. "$")
- chartRole: one of "donut-segment", "bar-value", "sparkline-point", "counter-target", "bar-fill-percent", "line-point"

For qualitative slides with no clear metrics, dataPoints may be an empty array [].

## Output Format

Respond with ONLY a valid JSON object matching this schema:
{
  "title": "PRISM Intelligence Brief — <short query summary>",
  "subtitle": "<N>-agent <tier> analysis spanning <dimension names>",
  "totalSlides": <integer>,
  "slides": [
    {
      "slideNumber": 1,
      "title": "Slide Title",
      "type": "<slide type>",
      "purpose": "One-sentence purpose of this slide",
      "agentSources": ["Agent Name 1", "Agent Name 2"],
      "componentHints": ["class-name-1", "class-name-2"],
      "animationType": "anim",
      "dataPoints": [
        { "label": "Label", "value": 42, "unit": "%", "chartRole": "counter-target" }
      ]
    }
  ]
}

The slides array must contain exactly totalSlides entries with sequential slideNumber values starting at 1.
OUTPUT ONLY THE JSON OBJECT. No markdown fences, no explanation text.`;
}

// ─── Main Planner Function ────────────────────────────────────────────────────

/**
 * Plan the slide deck structure from synthesis data.
 *
 * Makes an LLM call to decompose the synthesis result into a SlideManifest —
 * a structured list of slide specs that downstream generators will render.
 * Retries once on JSON or schema validation failures.
 */
export async function planSlides(input: PresentInput): Promise<SlideManifest> {
  const { synthesis, agentResults, blueprint, emitEvent } = input;

  emitEvent?.({
    type: "phase_change",
    phase: "PRESENT_PLANNING",
    message: "Planning slide deck structure...",
  });

  const catalog = new ComponentCatalog();
  const client = getAnthropicClient();
  const systemPrompt = catalog.plannerSystemPrompt();
  const userPrompt = buildPlannerUserPrompt(synthesis, agentResults, blueprint);

  async function attemptPlan(systemOverride?: string, userSuffix?: string): Promise<SlideManifest> {
    const response = await client.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 4000,
      system: systemOverride ?? systemPrompt,
      messages: [
        {
          role: "user",
          content: userSuffix ? userPrompt + userSuffix : userPrompt,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((block) => (block as any).text as string)
      .join("");

    // Strip markdown fences if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in planner response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error(`Planner response is not valid JSON: ${(e as Error).message}`);
    }

    // Validate with Zod schema
    return SlideManifestSchema.parse(parsed);
  }

  try {
    return await attemptPlan();
  } catch (firstError) {
    const errMsg = (firstError as Error).message ?? "";
    const isJsonError = errMsg.includes("No JSON") || errMsg.includes("not valid JSON");
    const isZodError = (firstError as Error).name === "ZodError";

    if (isJsonError || isZodError) {
      console.warn("[PLANNER] First attempt failed, retrying with stricter instruction:", errMsg);

      try {
        return await attemptPlan(
          "You are a JSON generator. Output ONLY a valid JSON object matching the SlideManifest schema. No markdown, no explanation, no code fences.",
          "\n\nOUTPUT VALID JSON ONLY. The JSON must start with { and end with }.",
        );
      } catch (retryError) {
        throw new Error(
          `Slide planner failed after retry: ${(retryError as Error).message}`,
        );
      }
    }

    throw firstError;
  }
}

// ─── Data-Aware Planner (Template-Based) ──────────────────────────────────────

const SlideIntentSchema = z.enum([
  "context", "evidence", "comparison", "trend", "composition",
  "ranking", "process", "recommendation", "summary", "transition",
]);

const NarrativeArcSchema = z.object({
  opening: z.string(),
  development: z.string(),
  climax: z.string(),
  resolution: z.string(),
});

const TemplateSlideSpecSchema = z.object({
  index: z.number(),
  templateId: z.string(),
  slideIntent: SlideIntentSchema,
  narrativePosition: z.string(),
  datasetBindings: z.object({
    chartSlots: z.record(z.string(), z.string()),
    statSources: z.record(z.string(), z.string()),
  }),
  transitionFrom: z.string().nullable(),
  transitionTo: z.string().nullable(),
  slideClass: z.string(),
  accentColor: z.string(),
});

export const TemplateSlideManifestSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  thesis: z.string(),
  narrativeArc: NarrativeArcSchema,
  slides: z.array(TemplateSlideSpecSchema).min(1),
});

/**
 * Data-aware slide planner that uses the DatasetRegistry to select
 * templates based on data shapes, density tiers, and chart-worthiness.
 *
 * This is the new pipeline entry point; the legacy planSlides() is
 * preserved above for backward compatibility.
 */
export async function planSlidesWithData(
  input: PlannerInput,
): Promise<TemplateSlideManifest> {
  const apiKey = await resolveApiKey("anthropic");
  const client = new Anthropic({ apiKey: apiKey ?? undefined });

  // Rank datasets by chart-worthiness
  const rankedDatasets = [...input.datasetRegistry.datasets]
    .sort((a, b) => b.chartWorthiness - a.chartWorthiness);

  // Build template catalog summary
  const templateCatalog = getAllTemplates().map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    dataShapes: t.dataShapes,
    densityRange: t.densityRange,
  }));

  // Compute adaptive slide count
  const strongSlides = rankedDatasets.filter(d => d.chartWorthiness > 40).length;
  const contentSlides = Math.ceil(input.keyInsights.length / 2);
  const recommendedCount = Math.min(
    input.maxSlides,
    Math.max(8, strongSlides + contentSlides + 2),
  );

  const prompt = `You are a presentation architect. Design a ${recommendedCount}-slide deck.

## Brief
${input.brief}

## Thesis
${input.deckThesis}

## Audience
${input.audience}

## Key Insights
${input.keyInsights.map(i => `- ${i}`).join("\n")}

## Available Datasets (ranked by chart-worthiness)
${JSON.stringify(rankedDatasets.map(d => ({
  id: d.id, metricName: d.metricName, dataShape: d.dataShape,
  densityTier: d.densityTier, pointCount: d.values.length,
  chartWorthiness: d.chartWorthiness, sourceLabel: d.sourceLabel,
})), null, 2)}

## Template Catalog
${JSON.stringify(templateCatalog, null, 2)}

## Rules
- First slide must use SF-05 (title)
- Select templates that match dataset data shapes and density ranges
- Bind high chart-worthiness datasets to chart slots
- No template used more than twice
- Adjacent slides must NOT share the same slideClass + accentColor
- Accent colors: cyan, green, purple, orange — distribute evenly
- Slide classes: gradient-dark, gradient-blue, gradient-radial, dark-mesh, dark-particles
- slideIntent must be one of: context, evidence, comparison, trend, composition, ranking, process, recommendation, summary, transition

Return a JSON object matching this schema:
{
  "title": "string",
  "subtitle": "string",
  "thesis": "string",
  "narrativeArc": { "opening": "...", "development": "...", "climax": "...", "resolution": "..." },
  "slides": [{ "index": 0, "templateId": "SF-05", "slideIntent": "transition", "narrativePosition": "...", "datasetBindings": { "chartSlots": {}, "statSources": {} }, "transitionFrom": null, "transitionTo": "...", "slideClass": "...", "accentColor": "..." }, ...]
}`;

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in planner LLM response");
  }

  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const parsed = JSON.parse(jsonStr);
  const validated = TemplateSlideManifestSchema.parse(parsed);

  return validated as TemplateSlideManifest;
}

// ─── Legacy Manifest Normalizer ───────────────────────────────────────────────

/**
 * The canonical spine order for PRISM briefings.
 */
const SLIDE_SPINE_ORDER: SlideManifest["slides"][number]["type"][] = [
  "title",
  "findings-toc",
  "executive-summary",
  "dimension-deep-dive",
  "data-metrics",
  "emergence",
  "tension",
  "closing",
];

/**
 * Extra component hints enriched per slide type during normalization.
 */
const SLIDE_COMPONENT_ENRICHMENTS: Partial<Record<string, string[]>> = {
  "title": ["hero-title", "hero-stats"],
  "findings-toc": ["icon-grid"],
  "executive-summary": ["comparison-bars", "feature-grid"],
  "dimension-deep-dive": ["quote-block"],
  "data-metrics": ["stat-block", "bar-chart"],
  "emergence": ["emergence-card"],
  "tension": ["grid-2"],
  "closing": ["process-flow"],
};

/**
 * Normalizes a legacy SlideManifest from the base planner into the canonical
 * executive spine ordering and enriches component hints and chart roles.
 *
 * - Reorders slides to the canonical spine (title → toc → exec-summary → … → closing)
 * - Sets the title slide's agentSources to the full agent roster
 * - Enriches componentHints with type-specific component families
 * - Remaps dataPoint chartRoles to the appropriate chart role for each slide type
 * - Sets animationType to "stagger-children" for data-metrics slides
 */
export function normalizeLegacyManifest(
  manifest: SlideManifest,
  agents: AgentResult[],
): SlideManifest {
  const allAgentNames = agents.map((a) => a.agentName);

  // Sort slides by canonical spine; preserve relative order within same type.
  // Unknown slide types (indexOf returns -1) are placed just before "closing"
  // (the last entry) so they appear at the end of the body content.
  const BEFORE_CLOSING = SLIDE_SPINE_ORDER.length - 1;
  const sorted = [...manifest.slides].sort((a, b) => {
    const ai = SLIDE_SPINE_ORDER.indexOf(a.type);
    const bi = SLIDE_SPINE_ORDER.indexOf(b.type);
    const aIdx = ai === -1 ? BEFORE_CLOSING : ai;
    const bIdx = bi === -1 ? BEFORE_CLOSING : bi;
    return aIdx - bIdx;
  });

  const normalized = sorted.map((slide, idx) => {
    const enrichments = SLIDE_COMPONENT_ENRICHMENTS[slide.type] ?? [];
    const hints = [...new Set([...slide.componentHints, ...enrichments])];

    // Title slide receives the full agent roster
    const agentSources =
      slide.type === "title" ? allAgentNames : slide.agentSources;

    // Remap chart roles and animation type per slide type
    let dataPoints = slide.dataPoints;
    let animationType = slide.animationType;

    if (slide.type === "executive-summary" && dataPoints.length > 0) {
      dataPoints = dataPoints.map((dp, i) => ({
        ...dp,
        chartRole: i === 0 ? "counter-target" : "bar-fill-percent",
      }));
    }

    if (slide.type === "data-metrics" && dataPoints.length > 0) {
      dataPoints = dataPoints.map((dp, i) => ({
        ...dp,
        chartRole: i === 0 ? "counter-target" : i === 1 ? "line-point" : dp.chartRole,
      }));
      animationType = "stagger-children";
    }

    return {
      ...slide,
      slideNumber: idx + 1,
      agentSources,
      componentHints: hints,
      dataPoints,
      animationType,
    };
  });

  return { ...manifest, slides: normalized, totalSlides: normalized.length };
}

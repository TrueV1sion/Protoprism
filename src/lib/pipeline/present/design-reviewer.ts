/**
 * Design Reviewer
 *
 * Editorial QA module for the PRESENT pipeline.
 * Reviews assembled slide HTML against the component catalog and
 * quality scorecard to produce per-slide feedback and regeneration flags.
 *
 * Returns null on timeout or LLM error — the orchestrator skips review.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ComponentCatalog } from "./component-catalog";
import { DesignReviewSchema } from "./types";
import type {
  DesignReview,
  SlideManifest,
  QualityScorecard,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEWER_MODEL = "claude-sonnet-4-20250514";
const REVIEWER_TIMEOUT_MS = 30_000;

// ─── Input Type ───────────────────────────────────────────────────────────────

export interface DesignReviewInput {
  html: string;
  manifest: SlideManifest;
  scorecard: QualityScorecard;
}

// ─── Anthropic Client ─────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * System prompt for the design reviewer.
 * Includes the component catalog and review criteria.
 */
function buildReviewerSystemPrompt(catalog: ComponentCatalog): string {
  return `You are a PRISM Intelligence editorial design reviewer. Your task is to critically evaluate a rendered slide deck HTML against editorial and design quality criteria.

${catalog.plannerSystemPrompt()}

## Review Criteria

### Component Fit (1–5)
Assess whether each slide uses the correct component types for its declared slide type:
- 5: Perfect component selection; exactly the right pattern for the slide type
- 4: Good fit; minor suboptimal choices
- 3: Adequate; some mismatches between slide type and component usage
- 2: Poor fit; wrong components dominate
- 1: Completely wrong components or missing required structure

### Narrative Flow (1–5)
Assess whether each slide contributes coherently to the overall deck story:
- 5: Slide perfectly advances the narrative; clear purpose in sequence
- 4: Good narrative contribution; minor flow issues
- 3: Slide is adequate but its position in the story is unclear
- 2: Slide disrupts flow or repeats previous content without adding value
- 1: Slide is irrelevant or actively confusing in context

### Regenerate Flag
Set \`regenerate: true\` if the slide has BOTH:
- componentFit < 3 (poor component usage), OR
- narrativeFlow < 3 (breaks narrative flow)
AND the issue cannot be fixed by minor text edits alone.

## Output Format

Respond with ONLY a valid JSON object:
{
  "slides": [
    {
      "slideNumber": 1,
      "componentFit": 4,
      "narrativeFlow": 5,
      "regenerate": false,
      "feedback": "Hero title and hero-stats are well-suited. Agent chips add good context."
    }
  ],
  "overallScore": 8.5,
  "narrative": "One-paragraph summary of the deck's overall editorial quality and story coherence."
}

Rules:
- Include an entry for EVERY slide in the manifest (do not skip any)
- overallScore: 1–10 float; reflects combined component quality and narrative coherence
- narrative: 2–4 sentences max
- OUTPUT ONLY THE JSON OBJECT — no markdown fences, no explanation`;
}

/**
 * User prompt: assembled HTML + manifest summary + scorecard summary.
 */
function buildReviewerUserPrompt(
  html: string,
  manifest: SlideManifest,
  scorecard: QualityScorecard,
): string {
  const parts: string[] = [];

  parts.push(`# Design Review Request`);
  parts.push(``);
  parts.push(`## Deck`);
  parts.push(`- **Title:** ${manifest.title}`);
  parts.push(`- **Subtitle:** ${manifest.subtitle}`);
  parts.push(`- **Total Slides:** ${manifest.totalSlides}`);
  parts.push(``);

  parts.push(`## Slide Manifest Summary`);
  for (const slide of manifest.slides) {
    parts.push(
      `- Slide ${slide.slideNumber}: "${slide.title}" (type: ${slide.type}) — ${slide.purpose}`,
    );
  }
  parts.push(``);

  parts.push(`## Validator Scorecard`);
  parts.push(`- **Overall Score:** ${scorecard.overall.toFixed(1)} / 100 (${scorecard.grade})`);
  parts.push(`- **Class Name Validity:** ${scorecard.metrics.classNameValidity.score.toFixed(0)} — ${scorecard.metrics.classNameValidity.details}`);
  parts.push(`- **Structural Integrity:** ${scorecard.metrics.structuralIntegrity.score.toFixed(0)} — ${scorecard.metrics.structuralIntegrity.details}`);
  parts.push(`- **Chart Adoption:** ${scorecard.metrics.chartAdoption.score.toFixed(0)} — ${scorecard.metrics.chartAdoption.details}`);
  parts.push(`- **Animation Variety:** ${scorecard.metrics.animationVariety.score.toFixed(0)} — ${scorecard.metrics.animationVariety.details}`);

  if (scorecard.perSlideIssues.length > 0) {
    parts.push(``);
    parts.push(`## Per-Slide Validator Issues`);
    const issuesBySlide = new Map<number, typeof scorecard.perSlideIssues>();
    for (const issue of scorecard.perSlideIssues) {
      if (!issuesBySlide.has(issue.slideNumber)) {
        issuesBySlide.set(issue.slideNumber, []);
      }
      issuesBySlide.get(issue.slideNumber)!.push(issue);
    }
    for (const [slideNum, issues] of Array.from(issuesBySlide.entries()).sort(
      (a, b) => a[0] - b[0],
    )) {
      parts.push(`- Slide ${slideNum}: ${issues.map((i) => `[${i.severity}] ${i.message}`).join("; ")}`);
    }
  }

  parts.push(``);
  parts.push(`## Assembled Deck HTML`);
  parts.push(`Review the following HTML for component fit and narrative quality:`);
  parts.push(``);
  // Truncate to avoid token overflow — reviewer needs structure, not every detail
  const truncatedHtml = html.length > 60_000 ? html.slice(0, 60_000) + "\n<!-- [truncated] -->" : html;
  parts.push(truncatedHtml);
  parts.push(``);
  parts.push(`Evaluate every slide and produce the JSON review object.`);

  return parts.join("\n");
}

// ─── Main Reviewer Function ───────────────────────────────────────────────────

/**
 * Reviews the assembled slide deck HTML for component fit and narrative flow.
 *
 * Returns null on timeout or any LLM/parse error — the orchestrator
 * treats null as "skip review" and proceeds without remediation signals.
 */
export async function reviewDesign(
  input: DesignReviewInput,
): Promise<DesignReview | null> {
  const { html, manifest, scorecard } = input;

  const catalog = new ComponentCatalog();
  const client = getAnthropicClient();

  const systemPrompt = buildReviewerSystemPrompt(catalog);
  const userPrompt = buildReviewerUserPrompt(html, manifest, scorecard);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVIEWER_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: REVIEWER_MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const text = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Strip markdown fences if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[design-reviewer] No JSON object found in reviewer response");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn(`[design-reviewer] Reviewer response is not valid JSON: ${(e as Error).message}`);
      return null;
    }

    // Validate with Zod schema
    const result = DesignReviewSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[design-reviewer] Schema validation failed: ${result.error.message}`);
      return null;
    }

    return result.data;
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[design-reviewer] Review failed: ${reason}. Skipping review.`);
    return null;
  }
}

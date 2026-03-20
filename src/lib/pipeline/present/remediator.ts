/**
 * Remediator
 *
 * Targeted slide repair module for the PRESENT pipeline QA loop.
 * Takes slides flagged by the validator and/or design reviewer
 * and re-generates them with focused correction prompts.
 *
 * Runs all remediations in parallel (like slide-generator batch).
 * Returns SlideHTML[] with status "success" (repaired) or "fallback" (original HTML preserved).
 */

import Anthropic from "@anthropic-ai/sdk";
import { ComponentCatalog } from "./component-catalog";
import { generateSlideContent } from "./content-generator";
import { renderSlide } from "./template-renderer";
import type { RemediationInput, SlideHTML, ChartData, ContentGeneratorInput, ContentGeneratorOutput } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const REMEDIATOR_MODEL = "claude-sonnet-4-20250514";
const REMEDIATOR_TIMEOUT_MS = 45_000;

// ─── Anthropic Client ─────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * System prompt for a single slide remediation.
 * Includes exemplar HTML and component reference from the catalog.
 */
function buildRemediatorSystemPrompt(
  exemplarHtml: string,
  componentRef: string,
): string {
  return `You are a PRISM Intelligence slide remediator. Your task is to fix a slide that has been flagged with quality issues.

## Output Rules (CRITICAL)
1. Output ONLY the raw \`<section>\` element — no \`<!DOCTYPE>\`, no \`<html>\`, no \`<head>\`, no surrounding markup.
2. The section MUST open with \`<section class="slide"\` (preserve the existing \`id\` attribute from the original).
3. Every slide MUST contain these three direct children in order:
   - \`<div class="slide-bg-glow" ...>\` — decorative glow (position via inline style)
   - \`<div class="slide-inner">\` — all content goes here
   - \`<div class="slide-footer">\` — three \`<span>\` columns
4. Do NOT add inline \`<style>\` or \`<script>\` tags.
5. Use ONLY the CSS classes listed in the Component Reference below. Never invent class names.
6. Terminate properly with \`</section>\`.
7. Preserve all working content — only fix the listed issues.

${componentRef}

## Exemplar HTML (reference pattern for this slide type)
Study this for correct component structure and class usage:

\`\`\`html
${exemplarHtml}
\`\`\`

## Remediation Approach
- Fix ONLY the issues listed in the user message
- Preserve all working elements (charts, data values, source attributions, text content)
- If chart SVG/HTML fragments are provided, INSERT them directly — do NOT recreate them
- Prefer surgical fixes over full rewrites when possible`;
}

/**
 * User prompt listing the issues to fix and the original HTML.
 */
function buildRemediatorUserPrompt(input: RemediationInput): string {
  const parts: string[] = [];

  parts.push(`# Slide Remediation Request — Slide ${input.slideNumber}`);
  parts.push(``);

  // Validator issues
  if (input.validatorIssues.length > 0) {
    parts.push(`## Validator Issues to Fix`);
    for (const issue of input.validatorIssues) {
      const classNote = issue.className ? ` (class: \`.${issue.className}\`)` : "";
      parts.push(`- [${issue.severity.toUpperCase()}] ${issue.message}${classNote}`);
    }
    parts.push(``);
  }

  // Reviewer feedback
  if (input.reviewerFeedback) {
    parts.push(`## Design Reviewer Feedback`);
    parts.push(input.reviewerFeedback);
    parts.push(``);
  }

  // Chart data fragments for reference
  if ((input.chartData ?? []).length > 0) {
    parts.push(`## Pre-Computed Chart Fragments`);
    parts.push(`INSERT these fragments directly into the repaired slide if they are missing or malformed.`);
    parts.push(``);

    for (let i = 0; i < (input.chartData ?? []).length; i++) {
      const chart = (input.chartData ?? [])[i];
      parts.push(`### Chart ${i + 1} (type: ${chart.type})`);

      if ("svgFragment" in chart) {
        parts.push("```html");
        parts.push((chart as { svgFragment: string }).svgFragment);
        parts.push("```");
      } else if ("htmlFragment" in chart) {
        parts.push("```html");
        parts.push((chart as { htmlFragment: string }).htmlFragment);
        parts.push("```");
      }
      parts.push(``);
    }
  }

  // Original HTML
  parts.push(`## Original Slide HTML`);
  parts.push(`Fix the issues above while preserving all working content:`);
  parts.push(``);
  parts.push("```html");
  parts.push(input.originalHtml);
  parts.push("```");
  parts.push(``);

  parts.push(`## Task`);
  parts.push(
    `Output a single repaired \`<section class="slide">\` element with the issues corrected. ` +
    `OUTPUT ONLY THE \`<section>...</section>\` ELEMENT — nothing else.`,
  );

  return parts.join("\n");
}

// ─── Single Slide Remediator ──────────────────────────────────────────────────

/**
 * Remediates a single slide. Returns the repaired SlideHTML on success,
 * or the original HTML with status "fallback" on any error.
 */
async function remediateSlide(
  input: RemediationInput,
  client: Anthropic,
  catalog: ComponentCatalog,
): Promise<SlideHTML> {
  const exemplarHtml = catalog.exemplarForSlideType("dimension-deep-dive");
  const componentRef = catalog.componentReference([
    "slide", "slide-inner", "slide-bg-glow", "slide-footer",
    "slide-title", "section-intro", "eyebrow",
    "finding-card", "finding-title", "finding-body",
    "confidence-badge", "tag", "stat-block", "stat-number",
    "anim", "anim-scale", "anim-blur", "d1", "d2", "d3", "d4", "d5",
    "grid-2", "grid-3", "chart-container",
  ]);

  const systemPrompt = buildRemediatorSystemPrompt(exemplarHtml, componentRef);
  const userPrompt = buildRemediatorUserPrompt(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMEDIATOR_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: REMEDIATOR_MODEL,
        max_tokens: 8000,
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

    // Extract the <section> HTML
    const sectionMatch = text.match(/<section[\s\S]*?<\/section>/);
    if (!sectionMatch) {
      console.warn(
        `[remediator] Slide ${input.slideNumber}: no <section> found in LLM response, using original`,
      );
      return {
        slideNumber: input.slideNumber,
        html: input.originalHtml,
        tokensUsed: 0,
        status: "fallback",
      };
    }

    return {
      slideNumber: input.slideNumber,
      html: sectionMatch[0],
      tokensUsed: response.usage?.output_tokens ?? 0,
      status: "success",
    };
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[remediator] Slide ${input.slideNumber} error: ${reason}. Preserving original.`,
    );
    return {
      slideNumber: input.slideNumber,
      html: input.originalHtml,
      tokensUsed: 0,
      status: "fallback",
    };
  }
}

// ─── Batch Parallel Remediator ────────────────────────────────────────────────

/**
 * Remediates multiple slides in parallel.
 *
 * For each RemediationInput:
 * - Builds a focused repair prompt (validator issues + reviewer feedback + chart fragments)
 * - Calls the LLM with a 45s timeout
 * - Extracts the <section> element from the response
 * - Falls back to the original HTML if the LLM fails
 *
 * Returns SlideHTML[] sorted by slideNumber with status "success" or "fallback".
 */
export async function remediateSlides(
  inputs: RemediationInput[],
): Promise<SlideHTML[]> {
  if (inputs.length === 0) return [];

  const client = getAnthropicClient();
  const catalog = new ComponentCatalog();

  // Run all remediations in parallel
  const results = await Promise.all(
    inputs.map((input) => remediateSlide(input, client, catalog)),
  );

  // Return sorted by slideNumber
  return results.sort((a, b) => a.slideNumber - b.slideNumber);
}

// ─── Content-Only Remediation (template pipeline) ────────────────────────────

/**
 * Remediates content-level issues by re-running the content generator with
 * issue-aware prompting, then re-rendering through the deterministic template.
 *
 * This is for the template pipeline only — structural issues are impossible
 * since templates are hand-crafted. Only content quality issues need fixing.
 */
export async function remediateContentIssues(
  originalInput: ContentGeneratorInput,
  originalOutput: ContentGeneratorOutput,
  issues: string[],
  chartFragments: Map<string, string>,
): Promise<{ content: ContentGeneratorOutput; html: string }> {
  const remediationInput: ContentGeneratorInput = {
    ...originalInput,
    slideIntent: `${originalInput.slideIntent}\n\nREMEDIATION REQUIRED — fix these issues:\n${issues.map(i => `- ${i}`).join("\n")}`,
  };

  const updatedContent = await generateSlideContent(remediationInput);
  const html = renderSlide(originalInput.templateId, updatedContent, chartFragments);

  return { content: updatedContent, html };
}

// ─── Remediation Context Builder ──────────────────────────────────────────────

/** Return type for the remediation context used in targeted slide repair. */
export interface RemediationContext {
  slideType: string;
  slideLabel: string;
  exemplarHtml: string;
  componentRef: string;
}

/**
 * Canonical component hints per slide type that are always included in the
 * component reference even when absent from the rendered HTML.
 */
const SLIDE_TYPE_CANONICAL_CLASSES: Partial<Record<string, string[]>> = {
  "title": ["hero-title", "hero-sub", "hero-stats", "slide-title"],
  "executive-summary": ["slide-title", "stat-grid", "comparison-bars", "feature-grid"],
  "dimension-deep-dive": ["slide-title", "finding-card", "quote-block", "tag"],
  "data-metrics": ["slide-title", "stat-block", "bar-chart", "donut-chart"],
  "emergence": ["slide-title", "emergence-card", "emergent-why"],
  "tension": ["slide-title", "finding-card", "grid-2"],
  "findings-toc": ["slide-title", "toc-group-header", "toc-item"],
  "closing": ["slide-title", "hero-title"],
};

/**
 * Infers the slide type from the `data-slide-type` attribute in the rendered
 * HTML, falling back to the empty string when the attribute is absent.
 */
function inferSlideTypeFromHtml(html: string): string {
  const match = html.match(/data-slide-type="([^"]+)"/);
  return match ? match[1] : "";
}

/**
 * Extracts unique CSS class names used in the rendered HTML, excluding slot
 * placeholders (`{{…}}`).
 */
function extractHtmlClasses(html: string): string[] {
  const classes = new Set<string>();
  for (const match of html.matchAll(/class="([^"]*?)"/g)) {
    for (const cls of match[1].split(/\s+/)) {
      if (cls && !cls.startsWith("{{")) classes.add(cls);
    }
  }
  return [...classes];
}

/**
 * Builds a structured remediation context for a single slide, used to
 * construct targeted system + user prompts in the repair loop.
 *
 * - Infers `slideType` from the `data-slide-type` attribute when not supplied
 * - Constructs a human-readable `slideLabel`
 * - Populates `exemplarHtml` from the input or the ComponentCatalog
 * - Generates a `componentRef` string listing every relevant CSS class
 */
export function buildRemediationContext(
  input: RemediationInput,
  catalog: ComponentCatalog,
): RemediationContext {
  const slideType =
    input.slideType ?? inferSlideTypeFromHtml(input.originalHtml);
  const templateId = input.templateId ?? "";
  const slideLabel = `${slideType} slide (${templateId})`;

  const exemplarHtml =
    input.exemplarHtml?.trim()
      ? input.exemplarHtml
      : catalog.exemplarForSlideType(slideType);

  // Collect classes from the rendered HTML plus canonical classes for this type
  const htmlClasses = extractHtmlClasses(input.originalHtml);
  const canonicalClasses = SLIDE_TYPE_CANONICAL_CLASSES[slideType] ?? ["slide-title"];
  const allClasses = [...new Set([...htmlClasses, ...canonicalClasses])];

  const componentRef = catalog.componentReference(allClasses);

  return { slideType, slideLabel, exemplarHtml, componentRef };
}

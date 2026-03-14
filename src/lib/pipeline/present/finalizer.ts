/**
 * Presentation Finalizer
 *
 * Post-processes generated HTML (CSS/JS inlining, animation baking, counter baking),
 * writes the deck to disk, and persists quality telemetry to the database.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { prisma } from "@/lib/prisma";
import type { QualityScorecard, PipelineTimings, DesignReview } from "./types";

/**
 * Inline external CSS and JS assets into the HTML so the deck is fully
 * self-contained and shareable without a running server.
 */
function inlineAssets(html: string): string {
  const publicDir = join(process.cwd(), "public");
  const cssPath = join(publicDir, "styles", "presentation.css");
  const jsPath = join(publicDir, "js", "presentation.js");

  let processed = html;

  // Inline CSS if not already present
  if (!processed.includes("presentation.css") && !processed.includes("<style>")) {
    try {
      const css = readFileSync(cssPath, "utf-8");
      if (processed.includes("</head>")) {
        processed = processed.replace(
          "</head>",
          `  <style>\n${css}\n  </style>\n</head>`,
        );
      }
    } catch {
      // Fallback to external link if CSS file not found
      if (processed.includes("</head>")) {
        processed = processed.replace(
          "</head>",
          `  <link rel="stylesheet" href="/styles/presentation.css">\n</head>`,
        );
      }
    }
  }

  // Inline JS if not already present
  if (!processed.includes("presentation.js")) {
    try {
      const js = readFileSync(jsPath, "utf-8");
      if (processed.includes("</body>")) {
        processed = processed.replace(
          "</body>",
          `  <script>\n${js}\n  </script>\n</body>`,
        );
      }
    } catch {
      // Fallback to external script if JS file not found
      if (processed.includes("</body>")) {
        processed = processed.replace(
          "</body>",
          `  <script src="/js/presentation.js" defer></script>\n</body>`,
        );
      }
    }
  }

  return processed;
}

/**
 * Bake animation states into the HTML so animated elements render correctly
 * in standalone decks without a running IntersectionObserver.
 */
function bakeAnimationStates(html: string): string {
  let processed = html;

  // Add 'visible' class to anim/anim-scale/anim-blur elements
  processed = processed.replace(
    /class="([^"]*\b(anim|anim-scale|anim-blur)\b[^"]*)"/g,
    (match, classes) => {
      if (classes.includes("visible")) return match;
      return `class="${classes} visible"`;
    },
  );

  // Add 'animate' class to bar-fill elements
  processed = processed.replace(
    /class="([^"]*\bbar-fill\b[^"]*)"/g,
    (match, classes) => {
      if (classes.includes("animate")) return match;
      return `class="${classes} animate"`;
    },
  );

  // Add 'is-visible' class to chart containers so CSS animations trigger
  processed = processed.replace(
    /class="([^"]*\b(bar-chart|line-chart|donut-chart|sparkline)\b[^"]*)"/g,
    (match, classes) => {
      if (classes.includes("is-visible")) return match;
      return `class="${classes} is-visible"`;
    },
  );

  return processed;
}

/**
 * Bake counter target values directly into text content so they display
 * correctly without the JS counter animation.
 */
function bakeCounterValues(html: string): string {
  let processed = html;

  // Handle data-prefix and data-suffix on counters (formatted with toLocaleString)
  processed = processed.replace(
    /(<span[^>]*class="[^"]*stat-number[^"]*"[^>]*data-target="(\d+)"[^>]*(?:data-prefix="([^"]*)")?[^>]*(?:data-suffix="([^"]*)")?[^>]*>)(\d+)(<\/span>)/g,
    (match, openTag, target, prefix, suffix, _currentText, closeTag) => {
      const val = parseInt(target).toLocaleString();
      return `${openTag}${prefix || ""}${val}${suffix || ""}${closeTag}`;
    },
  );

  // Simpler fallback: bake plain data-target values without prefix/suffix
  processed = processed.replace(
    /(<span[^>]*class="[^"]*stat-number[^"]*"[^>]*data-target="(\d+)"[^>]*>)(\d+)(<\/span>)/g,
    (match, openTag, target, _currentText, closeTag) => {
      return `${openTag}${target}${closeTag}`;
    },
  );

  return processed;
}

/**
 * Close any unclosed <section>, </body>, and </html> tags caused by LLM
 * truncation mid-generation.
 */
function recoverTruncation(html: string): string {
  let processed = html;

  if (!processed.includes("</body>")) {
    const openSections = (processed.match(/<section/g) || []).length;
    const closedSections = (processed.match(/<\/section>/g) || []).length;
    const unclosedSections = openSections - closedSections;
    if (unclosedSections > 0) {
      processed += `\n</div></div></section>`.repeat(unclosedSections);
    }
    processed += `\n</body>\n</html>`;
  }

  return processed;
}

/**
 * Upsert a PresentationQuality record in the database with all quality
 * telemetry from the agentic pipeline run.
 */
async function persistQuality(
  runId: string,
  quality: QualityScorecard,
  review?: DesignReview | null,
  timings?: PipelineTimings,
  remediationRounds?: number,
): Promise<void> {
  const { metrics, overall, grade, perSlideIssues } = quality;

  const data = {
    overall,
    grade,
    classNameValidity: metrics.classNameValidity.score,
    structuralIntegrity: metrics.structuralIntegrity.score,
    chartAdoption: metrics.chartAdoption.score,
    animationVariety: metrics.animationVariety.score,
    counterAdoption: metrics.counterAdoption.score,
    emergenceHierarchy: metrics.emergenceHierarchy.score,
    sourceAttribution: metrics.sourceAttribution.score,
    slideCount: new Set(perSlideIssues.map((i) => i.slideNumber)).size,
    issueCount: perSlideIssues.length,
    reviewScore: review?.overallScore ?? null,
    remediationRounds: remediationRounds ?? 0,
    planMs: timings?.planMs ?? null,
    chartCompileMs: timings?.chartCompileMs ?? null,
    generateMs: timings?.generateMs ?? null,
    assembleMs: timings?.assembleMs ?? null,
    validateMs: timings?.validateMs ?? null,
    reviewMs: timings?.reviewMs ?? null,
    remediateMs: timings?.remediateMs ?? null,
    finalizeMs: timings?.finalizeMs ?? null,
    totalMs: timings?.totalMs ?? null,
  };

  await prisma.presentationQuality.upsert({
    where: { runId },
    create: { runId, ...data },
    update: data,
  });
}

/**
 * Finalize a generated presentation:
 * 1. Inline CSS/JS assets
 * 2. Bake animation states
 * 3. Bake counter values
 * 4. Recover from LLM truncation
 * 5. Write HTML file to disk
 * 6. Persist quality telemetry to the database
 *
 * Returns the relative path to the written HTML file (e.g. `public/decks/<runId>.html`).
 */
export async function finalize(
  html: string,
  runId: string,
  quality: QualityScorecard,
  review?: DesignReview | null,
  timings?: PipelineTimings,
  remediationRounds?: number,
): Promise<string> {
  // 1. CSS/JS inlining
  let processed = html;
  processed = inlineAssets(processed);

  // 2. Animation state baking
  processed = bakeAnimationStates(processed);

  // 3. Counter value baking
  processed = bakeCounterValues(processed);

  // 4. Truncation recovery
  processed = recoverTruncation(processed);

  // 5. Write file
  const htmlPath = `public/decks/${runId}.html`;
  const fullPath = resolve(process.cwd(), htmlPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, processed, "utf-8");

  // 6. Persist quality telemetry
  await persistQuality(runId, quality, review, timings, remediationRounds);

  return htmlPath;
}

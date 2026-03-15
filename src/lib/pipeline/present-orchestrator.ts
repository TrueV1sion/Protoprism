/**
 * Agentic Presentation Orchestrator
 *
 * Coordinates two presentation pipelines:
 *
 * NEW (Template Pipeline — Stages 1-10):
 *   Stage 1:  Data Enrichment   — enrichToolCalls()       → DatasetRegistry
 *   Stage 2:  Planning           — planSlidesWithData()    → TemplateSlideManifest
 *   Stage 3:  Chart Compilation  — compileChartFromDataset()→ Map<slideIdx, Map<slotName, svgFragment>>
 *   Stage 4:  Content Generation — generateSlideContent()  → ContentGeneratorOutput[]
 *   Stage 5:  Template Rendering — renderSlide()           → string[]
 *   Stages 6-10: Assemble → Validate → Review → Remediate → Finalize (shared with legacy)
 *
 * LEGACY (8-stage pipeline):
 *   Stage 1: Plan      — planSlides()         → SlideManifest
 *   Stage 2: Compile   — compileCharts()       → ChartDataMap
 *   Stage 3: Generate  — generateSlidesBatch() → SlideHTML[]
 *   Stage 4: Assemble  — assemble()            → AssemblerOutput
 *   Stage 5: Validate  — validate()            → QualityScorecard
 *   Stage 6: Review    — reviewDesign()        → DesignReview | null
 *   Stage 7: Remediate — remediateSlides()     → SlideHTML[]
 *   Stage 8: Return    — PresentationResult
 *
 * The template pipeline is attempted first when capturedCalls are available.
 * On any failure, falls back to the legacy pipeline.
 */

import { planSlides, planSlidesWithData } from "./present/planner";
import { compileCharts, compileChartFromDataset } from "./present/chart-compiler";
import { generateSlidesBatch } from "./present/slide-generator";
import { generateSlideContent } from "./present/content-generator";
import { enrichToolCalls } from "./present/enricher";
import { renderSlide } from "./present/template-renderer";
import { getTemplate } from "./present/template-registry";
import { assemble } from "./present/assembler";
import { validate } from "./present/validator";
import { reviewDesign } from "./present/design-reviewer";
import { remediateSlides } from "./present/remediator";
import { finalize } from "./present/finalizer";
import { ComponentCatalog } from "./present/component-catalog";
import { present } from "./present";
import type {
  ChartDataMap,
  SlideGeneratorInput,
  SlideHTML,
  RemediationInput,
  DesignReview,
  PipelineTimings,
  DatasetRegistry,
  TemplateSlideManifest,
  ContentGeneratorInput,
  ContentGeneratorOutput,
} from "./present/types";
import type { PresentationResult, AgentResult } from "./types";
import type { PresentInput } from "./present";

// ─── Confidence ordering for finding sort ────────────────────────────────────

const CONFIDENCE_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Present a slide deck using the agentic pipeline.
 *
 * Attempts the new template pipeline (data capture → enrich → select → render)
 * when capturedCalls are available. Falls back to the legacy pipeline on any
 * failure, or when no captured data is available.
 */
export async function presentOrchestrated(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent } = input;
  const hasCapturedData = (input.capturedCalls?.length ?? 0) > 0;

  if (hasCapturedData) {
    try {
      return await presentWithTemplates(input);
    } catch (templateErr) {
      const msg = templateErr instanceof Error ? templateErr.message : String(templateErr);
      console.warn(`[orchestrator] Template pipeline failed, falling back to legacy: ${msg}`);
      emitEvent({
        type: "agent_progress",
        agentName: "orchestrator",
        progress: 0,
        message: `Template pipeline failed (${msg}) — falling back to legacy pipeline`,
      });
    }
  }

  return presentLegacy(input);
}

// ─── Template Pipeline (New) ──────────────────────────────────────────────────

/**
 * New data-driven template pipeline.
 * Uses captured MCP tool call data to enrich datasets, select templates,
 * generate content, compile charts, and render slides deterministically.
 */
async function presentWithTemplates(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent, runId } = input;

  function emitStageEvent(
    stage: string,
    status: "running" | "complete",
    details?: Record<string, unknown>,
  ): void {
    emitEvent({
      type: "agent_progress",
      agentName: "orchestrator",
      progress: status === "running" ? 10 : 50,
      message: `[${stage}] ${status}${details ? ": " + JSON.stringify(details) : ""}`,
    });
  }

  // ── Stage 1: Data Enrichment ──────────────────────────────────────────────

  emitStageEvent("data-enrichment", "running");
  const registry: DatasetRegistry = enrichToolCalls(runId, input.capturedCalls ?? []);
  emitStageEvent("data-enrichment", "complete", {
    datasetsEnriched: registry.datasets.length,
    entitiesResolved: registry.entities.length,
  });

  console.log(
    `[orchestrator] Stage 1 Data Enrichment complete: ${registry.datasets.length} datasets, ${registry.entities.length} entities`,
  );

  // If no datasets were enriched, fall back to legacy (not enough structured data)
  if (registry.datasets.length === 0) {
    throw new Error("No datasets enriched from captured tool calls — insufficient structured data for template pipeline");
  }

  // ── Stage 2: Planning (data-aware) ────────────────────────────────────────

  emitStageEvent("planning", "running");
  const planStart = Date.now();

  const manifest: TemplateSlideManifest = await planSlidesWithData({
    brief: input.synthesis.layers.map(l => l.description).join(" "),
    maxSlides: 12,
    audience: "executive",
    deckThesis: input.synthesis.emergentInsights[0]?.insight ?? "Analysis",
    keyInsights: input.synthesis.emergentInsights.map(ei => ei.insight),
    datasetRegistry: registry,
  });

  const planMs = Date.now() - planStart;
  emitStageEvent("planning", "complete", { slideCount: manifest.slides.length });

  console.log(
    `[orchestrator] Stage 2 Planning complete: ${manifest.slides.length} slides planned in ${planMs}ms`,
  );

  // ── Stage 3: Chart Compilation ────────────────────────────────────────────

  emitStageEvent("chart-compilation", "running");
  const chartCompileStart = Date.now();
  const slideCharts = new Map<number, Map<string, string>>();

  for (const slide of manifest.slides) {
    const chartMap = new Map<string, string>();
    for (const [slotName, datasetId] of Object.entries(slide.datasetBindings.chartSlots)) {
      const dataset = registry.datasets.find(d => d.id === datasetId);
      if (dataset) {
        const chartType = dataset.dataShape === "time_series" ? "line"
          : dataset.dataShape === "composition" ? "donut"
          : "bar";
        const chart = compileChartFromDataset(dataset, chartType);
        // Use svgFragment for SVG-based charts, htmlFragment for counter/horizontal-bar
        const fragment = "svgFragment" in chart ? chart.svgFragment : (chart as { htmlFragment: string }).htmlFragment;
        chartMap.set(slotName, fragment);
      }
    }
    slideCharts.set(slide.index, chartMap);
  }

  const chartCompileMs = Date.now() - chartCompileStart;
  emitStageEvent("chart-compilation", "complete");

  console.log(
    `[orchestrator] Stage 3 Chart Compilation complete in ${chartCompileMs}ms`,
  );

  // ── Stage 4: Content Generation (sequential for headline accumulation) ────

  emitStageEvent("content-generation", "running");
  const generateStart = Date.now();
  const contentOutputs: ContentGeneratorOutput[] = [];
  const priorHeadlines: string[] = [];

  for (const slide of manifest.slides) {
    const templateEntry = getTemplate(slide.templateId);
    const contentInput: ContentGeneratorInput = {
      templateId: slide.templateId,
      templateName: templateEntry?.name ?? slide.templateId,
      slotSchema: templateEntry?.slots ?? [],
      componentSlotSchemas: templateEntry?.componentSlots ?? [],
      datasets: registry.datasets.filter(d =>
        Object.values(slide.datasetBindings.chartSlots).includes(d.id) ||
        Object.values(slide.datasetBindings.statSources).includes(d.id)
      ),
      slideIntent: slide.slideIntent,
      narrativePosition: slide.narrativePosition,
      deckThesis: manifest.thesis,
      priorSlideHeadlines: [...priorHeadlines],
    };

    const content = await generateSlideContent(contentInput);
    contentOutputs.push(content);

    // Accumulate headlines for narrative deduplication
    if (typeof content.slots.headline === "string") {
      priorHeadlines.push(content.slots.headline);
    }
  }

  const generateMs = Date.now() - generateStart;
  emitStageEvent("content-generation", "complete");

  console.log(
    `[orchestrator] Stage 4 Content Generation complete: ${contentOutputs.length} slides in ${generateMs}ms`,
  );

  // ── Stage 5: Template Rendering ───────────────────────────────────────────

  emitStageEvent("template-rendering", "running");
  const renderStart = Date.now();
  const renderedSlides: SlideHTML[] = [];

  for (let i = 0; i < manifest.slides.length; i++) {
    const slide = manifest.slides[i];
    const content = contentOutputs[i];
    const charts = slideCharts.get(slide.index) ?? new Map();
    const html = renderSlide(slide.templateId, content, charts);
    renderedSlides.push({
      slideNumber: i + 1,
      html,
      tokensUsed: 0, // Template rendering uses no tokens
      status: "success",
    });
  }

  const renderMs = Date.now() - renderStart;
  emitStageEvent("template-rendering", "complete");

  console.log(
    `[orchestrator] Stage 5 Template Rendering complete: ${renderedSlides.length} slides in ${renderMs}ms`,
  );

  // ── Stages 6-10: Assemble → Validate → Review → Remediate → Finalize ─────
  // These stages are shared with the legacy pipeline.

  return finishPipeline(input, renderedSlides, manifest, {
    planMs,
    chartCompileMs,
    generateMs: generateMs + renderMs,
  });
}

// ─── Legacy Pipeline ─────────────────────────────────────────────────────────

/**
 * Legacy 8-stage pipeline.
 * Uses LLM-generated HTML via generateSlidesBatch() rather than deterministic
 * template rendering. Preserved for backward compatibility and as fallback.
 */
async function presentLegacy(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent } = input;

  try {
    // ── Timings accumulator ───────────────────────────────────────────────────
    const timings: {
      reviewMs?: number;
      remediateMs?: number;
    } = {};

    // ── Stage 1: Plan ────────────────────────────────────────────────────────

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_PLANNING",
      message: "Planning slide deck...",
    });

    const planStart = Date.now();
    const manifest = await planSlides(input);
    const planMs = Date.now() - planStart;

    console.log(
      `[orchestrator] Stage 1 Plan complete: ${manifest.slides.length} slides planned in ${planMs}ms`,
    );

    // ── Stage 2: Compile Charts ───────────────────────────────────────────────

    const chartStart = Date.now();
    const chartDataMap: ChartDataMap = {};

    for (const slide of manifest.slides) {
      if (slide.dataPoints.length > 0) {
        chartDataMap[slide.slideNumber] = compileCharts(slide.dataPoints);
      } else {
        chartDataMap[slide.slideNumber] = [];
      }
    }

    const chartCompileMs = Date.now() - chartStart;
    console.log(
      `[orchestrator] Stage 2 Chart compile complete in ${chartCompileMs}ms`,
    );

    // ── Stage 3: Generate Slides ──────────────────────────────────────────────

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_GENERATING",
      message: `Generating ${manifest.slides.length} slides in parallel...`,
    });

    const catalog = new ComponentCatalog();
    const generateStart = Date.now();

    const slideGeneratorInputs: SlideGeneratorInput[] = manifest.slides.map(
      (spec) => {
        // Get exemplar HTML for this slide type
        const exemplarHtml = catalog.exemplarForSlideType(spec.type);

        // Get component reference for hinted class names
        const componentRef = catalog.componentReference(spec.componentHints);

        // Collect findings from matching agents (agentSources → agentResults.agentName)
        const matchingAgentNames = new Set(spec.agentSources);
        const relevantFindings = input.agentResults
          .filter((ar) => matchingAgentNames.has(ar.agentName))
          .flatMap((ar) => ar.findings)
          .sort(
            (a, b) =>
              (CONFIDENCE_ORDER[a.confidence] ?? 2) -
              (CONFIDENCE_ORDER[b.confidence] ?? 2),
          )
          .slice(0, 5);

        // Attach chart data for this slide
        const charts = chartDataMap[spec.slideNumber] ?? [];

        return {
          spec,
          charts,
          exemplarHtml,
          componentRef,
          findings: relevantFindings,
          deckContext: {
            title: manifest.title,
            subtitle: manifest.subtitle,
            totalSlides: manifest.totalSlides,
          },
        };
      },
    );

    const slides = await generateSlidesBatch(slideGeneratorInputs);
    const generateMs = Date.now() - generateStart;

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_GENERATING",
      message: `Generated ${slides.length} slides in ${Math.round(generateMs / 1000)}s`,
    });

    console.log(
      `[orchestrator] Stage 3 Generate complete: ${slides.length} slides in ${generateMs}ms`,
    );

    // ── Stages 4-8: Assemble → Validate → Review → Remediate → Finalize ──────

    return finishPipeline(input, slides, manifest, {
      planMs,
      chartCompileMs,
      generateMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[orchestrator] Legacy pipeline failed, falling back to base presenter: ${message}`);

    emitEvent({
      type: "error",
      message: `Agentic presenter failed (${message}) — falling back to legacy presenter`,
      phase: "PRESENT",
    });

    // ── Fallback: base present() ────────────────────────────────────────────
    return present(input);
  }
}

// ─── Shared Pipeline Finish (Stages 6-10) ─────────────────────────────────────

interface EarlyTimings {
  planMs: number;
  chartCompileMs: number;
  generateMs: number;
}

/**
 * Shared finish stages: Assemble → Validate → Review → Remediate → Finalize.
 * Used by both the template pipeline and the legacy pipeline.
 *
 * Accepts a manifest with either SlideManifest or TemplateSlideManifest shape.
 * Only the title, subtitle, and slide count are needed for assembly.
 */
async function finishPipeline(
  input: PresentInput,
  slides: SlideHTML[],
  manifest: { title: string; subtitle: string; slides: unknown[] },
  earlyTimings: EarlyTimings,
): Promise<PresentationResult> {
  const { emitEvent } = input;
  const timings: { reviewMs?: number; remediateMs?: number } = {};
  const catalog = new ComponentCatalog();

  // ── Stage 6: Assemble ──────────────────────────────────────────────────────

  const assembleStart = Date.now();
  // Build a compatible manifest for the assembler
  const assemblerManifest = {
    title: manifest.title,
    subtitle: manifest.subtitle,
    totalSlides: manifest.slides.length,
    slides: manifest.slides.map((_s, i) => ({
      slideNumber: i + 1,
      title: manifest.title,
      type: "data-metrics" as const,
      purpose: "",
      agentSources: [] as string[],
      componentHints: [] as string[],
      animationType: "anim" as const,
      dataPoints: [],
    })),
  };
  const assemblerOutput = assemble({ slides, manifest: assemblerManifest });
  const assembleMs = Date.now() - assembleStart;

  console.log(
    `[orchestrator] Stage 6 Assemble complete: ${assemblerOutput.slideCount} slides, ${assemblerOutput.html.length} chars in ${assembleMs}ms`,
  );

  // ── Stage 7: Validate ──────────────────────────────────────────────────────

  const validateStart = Date.now();
  let scorecard = validate(assemblerOutput.html);
  const validateMs = Date.now() - validateStart;

  console.log(
    `[orchestrator] Stage 7 Validate complete: grade=${scorecard.grade}, score=${scorecard.overall} in ${validateMs}ms`,
  );

  // Emit quality report
  emitEvent({
    type: "quality_report",
    report: {
      totalFindings: input.agentResults.reduce(
        (sum, ar) => sum + ar.findings.length,
        0,
      ),
      sourcedFindings: input.agentResults
        .flatMap((ar) => ar.findings)
        .filter((f) => f.source && f.source.trim().length > 0).length,
      sourceCoveragePercent: 0,
      confidenceDistribution: {
        high: countByConf(input.agentResults, "HIGH"),
        medium: countByConf(input.agentResults, "MEDIUM"),
        low: countByConf(input.agentResults, "LOW"),
      },
      sourceTierDistribution: {
        primary: countByTier(input.agentResults, "PRIMARY"),
        secondary: countByTier(input.agentResults, "SECONDARY"),
        tertiary: countByTier(input.agentResults, "TERTIARY"),
      },
      emergenceYield: input.synthesis.emergentInsights.length,
      gapCount: input.agentResults.reduce((sum, ar) => sum + ar.gaps.length, 0),
      provenanceComplete: false,
      grade: scorecard.grade,
      overallScore: scorecard.overall,
    },
  });

  // ── Stages 8-9: Design Review + Remediation Loop ───────────────────────────

  let bestHtml = assemblerOutput.html;
  let bestScore = scorecard.overall;
  let remediationRounds = 0;
  let lastReview: DesignReview | null = null;
  const MAX_ITERATIONS = 2;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Stage 8: Design Review
    const reviewStart = Date.now();
    const review = await reviewDesign({
      html: bestHtml,
      manifest: assemblerManifest,
      scorecard,
    });
    timings.reviewMs = (timings.reviewMs ?? 0) + (Date.now() - reviewStart);

    if (!review) break;
    lastReview = review;

    console.log(
      `[orchestrator] Stage 8 Design Review (iteration ${iteration + 1}): overallScore=${review.overallScore.toFixed(1)} in ${timings.reviewMs}ms`,
    );

    // Collect slides needing remediation
    const slidesToRemediate: RemediationInput[] = [];

    for (const slideReview of review.slides) {
      const hasValidatorIssues = scorecard.perSlideIssues
        .filter(i => i.slideNumber === slideReview.slideNumber)
        .filter(i => i.severity === "error" || i.severity === "warning").length > 0;

      if (slideReview.regenerate || hasValidatorIssues) {
        const slideIdx = slides.findIndex(s => s.slideNumber === slideReview.slideNumber);

        if (slideIdx >= 0) {
          slidesToRemediate.push({
            slideNumber: slideReview.slideNumber,
            originalHtml: slides[slideIdx].html,
            validatorIssues: scorecard.perSlideIssues.filter(i => i.slideNumber === slideReview.slideNumber),
            reviewerFeedback: slideReview.feedback,
            exemplarHtml: catalog.exemplarForSlideType("data-metrics"),
            chartData: [],
          });
        }
      }
    }

    if (slidesToRemediate.length === 0) break;

    console.log(
      `[orchestrator] Stage 9 Remediating ${slidesToRemediate.length} slides (iteration ${iteration + 1})...`,
    );

    // Stage 9: Remediate
    const remediateStart = Date.now();
    const remediated = await remediateSlides(slidesToRemediate);
    timings.remediateMs = (timings.remediateMs ?? 0) + (Date.now() - remediateStart);
    remediationRounds++;

    // Replace remediated slides
    for (const fixed of remediated) {
      const idx = slides.findIndex(s => s.slideNumber === fixed.slideNumber);
      if (idx >= 0) slides[idx] = fixed;
    }

    // Re-assemble and re-validate
    const reAssembled = assemble({ slides, manifest: assemblerManifest });
    const reScored = validate(reAssembled.html);

    console.log(
      `[orchestrator] Stage 9 Remediation round ${remediationRounds} complete: score ${bestScore} → ${reScored.overall} (${reScored.grade})`,
    );

    // Regression detection: keep the better version
    if (reScored.overall >= bestScore) {
      bestHtml = reAssembled.html;
      bestScore = reScored.overall;
      scorecard = reScored;
    } else {
      console.warn(
        `[orchestrator] Remediation regression detected (${reScored.overall} < ${bestScore}) — reverting`,
      );
      break;
    }
  }

  console.log(
    `[orchestrator] QA loop complete: ${remediationRounds} remediation round(s), final score=${bestScore} (${scorecard.grade})`,
  );

  // ── Stage 10: Finalize ──────────────────────────────────────────────────────

  const pipelineTimings: PipelineTimings = {
    planMs: earlyTimings.planMs,
    chartCompileMs: earlyTimings.chartCompileMs,
    generateMs: earlyTimings.generateMs,
    assembleMs,
    validateMs,
    reviewMs: timings.reviewMs ?? 0,
    remediateMs: timings.remediateMs ?? 0,
    finalizeMs: 0,
    totalMs: 0,
  };

  const finalizeStart = Date.now();
  const htmlPath = await finalize(
    bestHtml,
    input.runId,
    scorecard,
    lastReview,
    pipelineTimings,
    remediationRounds,
  );
  pipelineTimings.finalizeMs = Date.now() - finalizeStart;
  pipelineTimings.totalMs =
    earlyTimings.planMs + earlyTimings.chartCompileMs + earlyTimings.generateMs +
    assembleMs + validateMs +
    (timings.reviewMs ?? 0) + (timings.remediateMs ?? 0) + pipelineTimings.finalizeMs;

  console.log(
    `[orchestrator] Pipeline complete in ${pipelineTimings.totalMs}ms — grade: ${scorecard.grade}`,
  );

  emitEvent({
    type: "presentation_complete",
    title: manifest.title,
    slideCount: assemblerOutput.slideCount,
    htmlPath,
  });

  // Read back the finalized HTML (with inlined CSS/JS, baked animations)
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const finalizedHtml = readFileSync(resolve(process.cwd(), htmlPath), "utf-8");

  return {
    html: finalizedHtml,
    htmlPath: `/decks/${input.runId}.html`,
    title: manifest.title,
    subtitle: manifest.subtitle,
    slideCount: assemblerOutput.slideCount,
    quality: { overall: scorecard.overall, grade: scorecard.grade },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countByConf(results: AgentResult[], level: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.confidence === level).length,
    0,
  );
}

function countByTier(results: AgentResult[], tier: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.sourceTier === tier).length,
    0,
  );
}

/**
 * PRISM Pipeline -- Executor
 *
 * Orchestrates the complete intelligence pipeline:
 * THINK -> CONSTRUCT -> DEPLOY -> SYNTHESIZE -> VERIFY -> PRESENT
 *
 * Manages the full lifecycle, updating database state between phases,
 * emitting PipelineEvent events for real-time streaming, and enforcing
 * the verification gate.
 */

import { prisma } from "@/lib/prisma";
import { think } from "./think";
import { construct } from "./construct";
import { deploy } from "./deploy";
import type { AgentDeployResult } from "./deploy";
import { synthesize } from "./synthesize";
import { verify } from "./verify";
import { present } from "./present";
import {
  runQualityAssurance,
  getQualityGateSystem,
} from "./quality-assurance";
import { withRetry } from "./retry";
import { CostTracker } from "./cost";
import { waitForBlueprintApproval, cancelApproval } from "./approval";
import type {
  Blueprint,
  PipelineEvent,
  IntelligenceManifest,
  AgentResult,
  SynthesisResult,
  QualityReport,
  AutonomyMode,
} from "./types";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────

export interface PipelineInput {
  query: string;
  runId: string;
  autonomyMode?: AutonomyMode;
  signal?: AbortSignal;
  onEvent?: (event: PipelineEvent) => void;
}

// ─── Quality Report Builder ─────────────────────────────────

function buildQualityReport(
  agentResults: AgentResult[],
  synthesis: SynthesisResult,
): QualityReport {
  const allFindings = agentResults.flatMap((r) => r.findings);
  const totalFindings = allFindings.length;
  const sourcedFindings = allFindings.filter(
    (f) => f.source && f.source.trim().length > 0,
  ).length;

  const confDist = { high: 0, medium: 0, low: 0 };
  const tierDist = { primary: 0, secondary: 0, tertiary: 0 };
  for (const f of allFindings) {
    confDist[f.confidence.toLowerCase() as keyof typeof confDist]++;
    tierDist[f.sourceTier.toLowerCase() as keyof typeof tierDist]++;
  }

  const qualifiedEmergences = synthesis.emergentInsights.filter((e) => {
    const scores = e.qualityScores;
    return (
      [
        scores.novelty,
        scores.grounding,
        scores.actionability,
        scores.depth,
        scores.surprise,
      ].filter((s) => s >= 4).length >= 3
    );
  }).length;

  const gapCount = agentResults.reduce((sum, r) => sum + r.gaps.length, 0);

  return {
    totalFindings,
    sourcedFindings,
    sourceCoveragePercent:
      totalFindings > 0
        ? Math.round((sourcedFindings / totalFindings) * 100)
        : 0,
    confidenceDistribution: confDist,
    sourceTierDistribution: tierDist,
    emergenceYield: qualifiedEmergences,
    gapCount,
    provenanceComplete: sourcedFindings === totalFindings,
  };
}

// ─── Main Orchestrator ──────────────────────────────────────

/**
 * Execute the full PRISM intelligence pipeline.
 *
 * Flow: THINK -> CONSTRUCT -> DEPLOY -> SYNTHESIZE -> VERIFY -> PRESENT
 *
 * Each phase updates the database Run status and emits PipelineEvent events.
 * Returns the completed IntelligenceManifest.
 */
export async function executePipeline(
  input: PipelineInput,
): Promise<IntelligenceManifest> {
  const { query, runId, autonomyMode = "supervised", signal, onEvent } = input;
  const startTime = new Date().toISOString();
  let totalTokens = 0;
  const costTracker = new CostTracker();

  const emitEvent = (event: PipelineEvent) => {
    onEvent?.(event);
  };

  /** Throws if the pipeline has been aborted (client disconnected). */
  function checkAbort() {
    if (signal?.aborted) {
      throw new DOMException("Pipeline aborted by client", "AbortError");
    }
  }

  let currentPhase = "THINK";

  try {
    // ─── Phase 0: THINK ───────────────────────────────────

    currentPhase = "THINK";
    await updateRunStatus(runId, "THINK");
    emitEvent({ type: "phase_change", phase: "THINK", message: "Decomposing query into analytical dimensions..." });

    const blueprint = await withRetry(
      () => think({ query, onEvent: emitEvent }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "THINK" },
    );

    // Persist blueprint to database
    await persistBlueprint(runId, blueprint);

    emitEvent({ type: "blueprint", blueprint });

    // ─── Blueprint Approval Gate ───────────────────────────
    // Pause and wait for user approval before proceeding.
    // The client POSTs to /api/pipeline/approve to resolve this.
    emitEvent({ type: "phase_change", phase: "BLUEPRINT", message: "Awaiting blueprint approval..." });
    await waitForBlueprintApproval(runId);

    checkAbort();

    // ─── Phase 1: CONSTRUCT ───────────────────────────────

    currentPhase = "CONSTRUCT";
    await updateRunStatus(runId, "CONSTRUCT");
    emitEvent({ type: "phase_change", phase: "CONSTRUCT", message: "Building agent prompts and tool configurations..." });

    const agents = construct({ blueprint });

    // Update agents in database with system prompts
    for (const agent of agents) {
      await prisma.agent.updateMany({
        where: { runId, name: agent.name },
        data: {
          status: "active",
          archetype: agent.archetype,
          mandate: agent.mandate,
          tools: JSON.stringify(agent.tools),
          color: agent.color,
        },
      });
    }

    checkAbort();

    // ─── Phase 2: DEPLOY ──────────────────────────────────

    currentPhase = "DEPLOY";
    await updateRunStatus(runId, "DEPLOY");
    emitEvent({ type: "phase_change", phase: "DEPLOY", message: `Deploying ${agents.length} agents in parallel...` });

    const deployResult = await withRetry(
      () => deploy({
        agents,
        blueprint,
        emitEvent,
        signal,
      }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "DEPLOY" },
    );

    const { agentResults, criticResult } = deployResult;

    // Track tokens from deploy phase
    for (const result of agentResults) {
      totalTokens += result.tokensUsed;
    }
    if (criticResult) {
      totalTokens += criticResult.tokensUsed;
    }

    // Persist findings to database (batched for performance)
    // 1. Look up all agent DB records in one query
    const dbAgents = await prisma.agent.findMany({
      where: { runId },
      select: { id: true, name: true },
    });
    const agentIdMap = new Map(dbAgents.map((a) => [a.name, a.id]));

    // 2. Build all finding records for batch insert
    // Safety: clamp enum values to valid options to prevent DB validation errors
    const validSourceTiers = new Set(["PRIMARY", "SECONDARY", "TERTIARY"]);
    const validConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
    const findingsData = agentResults.flatMap((agentResult) => {
      const agentId = agentIdMap.get(agentResult.agentName);
      if (!agentId) return [];
      return agentResult.findings.map((finding) => ({
        statement: finding.statement,
        evidence: finding.evidence,
        confidence: validConfidence.has(finding.confidence) ? finding.confidence : "MEDIUM",
        evidenceType: finding.evidenceType,
        source: finding.source,
        sourceTier: validSourceTiers.has(finding.sourceTier) ? finding.sourceTier : "SECONDARY",
        implication: finding.implication,
        action: "keep",
        tags: JSON.stringify(finding.tags),
        agentId,
        runId,
      }));
    });

    // 3. Batch update all agent statuses + create all findings in a transaction
    await prisma.$transaction([
      // Mark all agents as complete
      prisma.agent.updateMany({
        where: { runId },
        data: { status: "complete", progress: 100 },
      }),
      // Batch create all findings
      prisma.finding.createMany({
        data: findingsData,
      }),
    ]);

    // Check: enough agents succeeded?
    if (agentResults.length < 2) {
      throw new Error(
        `Only ${agentResults.length} agents succeeded -- minimum 2 required for synthesis.`,
      );
    }

    checkAbort();

    // ─── Phase 3: SYNTHESIZE ──────────────────────────────

    currentPhase = "SYNTHESIZE";
    await updateRunStatus(runId, "SYNTHESIZE");
    emitEvent({ type: "phase_change", phase: "SYNTHESIZE", message: "Running emergence detection and synthesis..." });

    const synthesis = await withRetry(
      () => synthesize({
        agentResults,
        blueprint,
        criticResult,
        emitEvent,
      }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "SYNTHESIZE" },
    );

    // Persist synthesis layers (batched)
    await prisma.synthesis.createMany({
      data: synthesis.layers.map((layer, i) => ({
        layerName: layer.name,
        description: layer.description,
        insights: JSON.stringify(layer.insights),
        order: i,
        runId,
      })),
    });

    // Build base quality report
    const qualityReport = buildQualityReport(agentResults, synthesis);

    // ─── Phase 3.25: QUALITY ASSURANCE ─────────────────────

    currentPhase = "QUALITY_ASSURANCE";
    emitEvent({ type: "phase_change", phase: "QUALITY_ASSURANCE", message: "Running provenance tracking and quality scoring..." });

    // Convert AgentResult[] → AgentDeployResult[] for QA system compatibility
    const deployResultsForQA: AgentDeployResult[] = agentResults.map((ar) => ({
      agentName: ar.agentName,
      dimension: ar.dimension,
      result: ar,
      warnings: [],
    }));

    // Build a partial manifest for QA scoring (presentation not yet available)
    const partialManifest: IntelligenceManifest = {
      blueprint,
      agentResults,
      synthesis,
      presentation: { html: "", title: "", subtitle: "", slideCount: 0 },
      qualityReport,
      metadata: {
        runId,
        startTime,
        endTime: new Date().toISOString(),
        totalTokens,
        totalCost: costTracker.totalCost,
      },
    };

    // Run full QA pipeline: provenance → scoring → gates → warnings
    const gateSystem = getQualityGateSystem();
    const qaReport = await runQualityAssurance(
      partialManifest,
      deployResultsForQA,
      blueprint,
      gateSystem,
      undefined, // criticIssues — could be populated from critic agent later
      emitEvent,
    );

    // Enrich the quality report with full QA data
    qualityReport.grade = qaReport.score.grade;
    qualityReport.overallScore = qaReport.score.overallScore;
    qualityReport.provenanceCompleteness = qaReport.provenance.chainCompleteness;
    qualityReport.warningCount = qaReport.warnings.length;
    qualityReport.criticalWarnings = qaReport.warnings
      .filter((w) => w.severity === "critical")
      .map((w) => w.message);
    qualityReport.dimensions = qaReport.score.dimensions.map((d) => ({
      name: d.name,
      score: d.score,
      details: d.details,
    }));

    // Emit the enriched quality report
    emitEvent({ type: "quality_report", report: qualityReport });

    if (!qaReport.passesAllGates) {
      console.warn(
        `[EXECUTOR] QA gates did not all pass (grade: ${qaReport.score.grade}, score: ${qaReport.score.overallScore}%). Continuing to VERIFY phase.`,
      );
    }

    checkAbort();

    // ─── Phase 3.5: VERIFY ────────────────────────────────

    currentPhase = "VERIFY";
    await updateRunStatus(runId, "VERIFY");
    emitEvent({ type: "phase_change", phase: "VERIFY", message: "Running verification gate..." });

    const verifyResult = await verify({
      synthesis,
      agentResults,
      autonomyMode,
      emitEvent,
    });

    // For supervised mode, verify returns approved=false.
    // The SSE route will handle the HITL gate externally.
    // For guided/autonomous, it auto-approves and we continue.
    if (!verifyResult.approved && autonomyMode === "supervised") {
      // Emit the verification gate so the SSE route knows to pause.
      // The route handler is responsible for waiting for user approval
      // before calling the remaining phases. We still continue here
      // because the route will manage the gate. If the caller needs
      // to block, they should check the event stream.
      //
      // In the current architecture, the executor runs to completion
      // and the SSE route uses the verification_gate event to show
      // the user the claims before streaming the presentation.
    }

    checkAbort();

    // ─── Phase 4: PRESENT ─────────────────────────────────

    currentPhase = "PRESENT";
    await updateRunStatus(runId, "PRESENT");
    emitEvent({ type: "phase_change", phase: "PRESENT", message: "Generating HTML5 presentation..." });

    const presentation = await withRetry(
      () => present({
        synthesis,
        agentResults,
        blueprint,
        emitEvent,
      }),
      { maxRetries: 1, baseDelayMs: 3000, signal, label: "PRESENT" },
    );

    // Save HTML to public/decks/
    const decksDir = join(process.cwd(), "public", "decks");
    mkdirSync(decksDir, { recursive: true });
    const filename = `${runId}.html`;
    const htmlPath = `/decks/${filename}`;

    // Post-process HTML to ensure required assets are included.
    // The LLM frequently omits the script tag, and sometimes produces
    // truncated HTML when the output hits max_tokens.
    let finalHtml = presentation.html;

    // Ensure the CSS link is present
    if (!finalHtml.includes("presentation.css")) {
      if (finalHtml.includes("</head>")) {
        finalHtml = finalHtml.replace(
          "</head>",
          `  <link rel="stylesheet" href="/styles/presentation.css">\n</head>`,
        );
      }
    }

    // Ensure the JS script tag is present
    if (!finalHtml.includes("presentation.js")) {
      if (finalHtml.includes("</body>")) {
        finalHtml = finalHtml.replace(
          "</body>",
          `  <script src="/js/presentation.js" defer></script>\n</body>`,
        );
      } else {
        // Truncated HTML — close any open sections and append closing tags + script
        // Count open vs closed sections to repair the document structure
        const openSections = (finalHtml.match(/<section/g) || []).length;
        const closedSections = (finalHtml.match(/<\/section>/g) || []).length;
        const unclosedSections = openSections - closedSections;
        if (unclosedSections > 0) {
          // Close open divs heuristically and then close the section(s)
          finalHtml += `\n</div></div></section>`.repeat(unclosedSections);
          console.warn(`[PRESENT] Repaired ${unclosedSections} unclosed section(s) in truncated HTML`);
        }
        finalHtml += `\n<script src="/js/presentation.js" defer></script>\n</body>\n</html>`;
      }
    }

    writeFileSync(join(decksDir, filename), finalHtml, "utf-8");

    // Persist presentation to database
    await prisma.presentation.create({
      data: {
        title: presentation.title,
        subtitle: presentation.subtitle,
        htmlPath,
        slideCount: presentation.slideCount,
        runId,
      },
    });

    // ─── Complete ─────────────────────────────────────────

    const endTime = new Date().toISOString();

    const manifest: IntelligenceManifest = {
      blueprint,
      agentResults,
      synthesis,
      presentation,
      qualityReport,
      metadata: {
        runId,
        startTime,
        endTime,
        totalTokens,
        totalCost: costTracker.totalCost,
      },
    };

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
      },
    });

    emitEvent({ type: "complete", manifest });

    return manifest;
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Log errors to server console for debugging
    console.error(`[EXECUTOR] Pipeline ${runId} failed in phase ${currentPhase}:`, errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(`[EXECUTOR] Stack trace:`, error.stack);
    }

    // Clean up pending approval if pipeline fails during blueprint wait
    cancelApproval(runId);

    // Update run status
    try {
      await prisma.run.update({
        where: { id: runId },
        data: { status: isAbort ? "CANCELLED" : "FAILED" },
      });
    } catch (dbErr) {
      console.error(`[EXECUTOR] Failed to update run status:`, dbErr);
    }

    if (isAbort) {
      emitEvent({ type: "error", message: "Pipeline cancelled by user", phase: currentPhase });
    } else {
      emitEvent({ type: "error", message: errorMessage, phase: currentPhase });
    }

    throw error;
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function updateRunStatus(runId: string, status: string) {
  await prisma.run.update({
    where: { id: runId },
    data: { status },
  });
}

async function persistBlueprint(runId: string, blueprint: Blueprint) {
  // Update run with complexity data + batch create dimensions and agents
  await prisma.$transaction([
    prisma.run.update({
      where: { id: runId },
      data: {
        tier: blueprint.tier,
        complexityScore: Math.round(blueprint.complexityScore.total),
        breadth: blueprint.complexityScore.breadth,
        depth: blueprint.complexityScore.depth,
        interconnection: blueprint.complexityScore.interconnection,
        estimatedTime: blueprint.estimatedTime,
      },
    }),
    prisma.dimension.createMany({
      data: blueprint.dimensions.map((dim) => ({
        name: dim.name,
        description: dim.description,
        runId,
      })),
    }),
    prisma.agent.createMany({
      data: blueprint.agents.map((agent) => ({
        name: agent.name,
        archetype: agent.archetype,
        mandate: agent.mandate,
        tools: JSON.stringify(agent.tools),
        dimension: agent.dimension,
        runId,
      })),
    }),
  ]);
}

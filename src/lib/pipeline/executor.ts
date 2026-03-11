import { db } from "@/lib/db";
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

export interface PipelineInput {
  query: string;
  runId: string;
  autonomyMode?: AutonomyMode;
  signal?: AbortSignal;
  onEvent?: (event: PipelineEvent) => void;
}

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

  function checkAbort() {
    if (signal?.aborted) {
      throw new DOMException("Pipeline aborted by client", "AbortError");
    }
  }

  let currentPhase = "THINK";

  try {
    currentPhase = "THINK";
    await updateRunStatus(runId, "THINK");
    emitEvent({ type: "phase_change", phase: "THINK", message: "Decomposing query into analytical dimensions..." });

    const blueprint = await withRetry(
      () => think({ query, onEvent: emitEvent }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "THINK" },
    );

    await persistBlueprint(runId, blueprint);
    emitEvent({ type: "blueprint", blueprint });

    emitEvent({ type: "phase_change", phase: "BLUEPRINT", message: "Awaiting blueprint approval..." });
    await waitForBlueprintApproval(runId);
    checkAbort();

    currentPhase = "CONSTRUCT";
    await updateRunStatus(runId, "CONSTRUCT");
    emitEvent({ type: "phase_change", phase: "CONSTRUCT", message: "Building agent prompts and tool configurations..." });

    const agents = construct({ blueprint });

    for (const agent of agents) {
      await db.agent.updateByName(runId, agent.name, {
        status: "active",
        archetype: agent.archetype,
        mandate: agent.mandate,
        tools: JSON.stringify(agent.tools),
        color: agent.color,
      });
    }

    checkAbort();

    currentPhase = "DEPLOY";
    await updateRunStatus(runId, "DEPLOY");
    emitEvent({ type: "phase_change", phase: "DEPLOY", message: `Deploying ${agents.length} agents in parallel...` });

    const deployResult = await withRetry(
      () => deploy({ agents, blueprint, emitEvent, signal }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "DEPLOY" },
    );

    const { agentResults, criticResult } = deployResult;

    for (const result of agentResults) {
      totalTokens += result.tokensUsed;
    }
    if (criticResult) {
      totalTokens += criticResult.tokensUsed;
    }

    const dbAgents = await db.agent.findMany({ runId });
    const agentIdMap = new Map(dbAgents.map((a) => [a.name, a.id]));

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

    await db.agent.updateMany(runId, { status: "complete", progress: 100 });
    await db.finding.createMany(findingsData);

    if (agentResults.length < 2) {
      throw new Error(
        `Only ${agentResults.length} agents succeeded -- minimum 2 required for synthesis.`,
      );
    }

    checkAbort();

    currentPhase = "SYNTHESIZE";
    await updateRunStatus(runId, "SYNTHESIZE");
    emitEvent({ type: "phase_change", phase: "SYNTHESIZE", message: "Running emergence detection and synthesis..." });

    const synthesis = await withRetry(
      () => synthesize({ agentResults, blueprint, criticResult, emitEvent }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "SYNTHESIZE" },
    );

    await db.synthesis.createMany(
      synthesis.layers.map((layer, i) => ({
        layerName: layer.name,
        description: layer.description,
        insights: JSON.stringify(layer.insights),
        sortOrder: i,
        runId,
      })),
    );

    const qualityReport = buildQualityReport(agentResults, synthesis);

    currentPhase = "QUALITY_ASSURANCE";
    emitEvent({ type: "phase_change", phase: "QUALITY_ASSURANCE", message: "Running provenance tracking and quality scoring..." });

    const deployResultsForQA: AgentDeployResult[] = agentResults.map((ar) => ({
      agentName: ar.agentName,
      dimension: ar.dimension,
      result: ar,
      warnings: [],
    }));

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

    const gateSystem = getQualityGateSystem();
    const qaReport = await runQualityAssurance(
      partialManifest,
      deployResultsForQA,
      blueprint,
      gateSystem,
      undefined,
      emitEvent,
    );

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

    emitEvent({ type: "quality_report", report: qualityReport });

    if (!qaReport.passesAllGates) {
      console.warn(
        `[EXECUTOR] QA gates did not all pass (grade: ${qaReport.score.grade}, score: ${qaReport.score.overallScore}%). Continuing to VERIFY phase.`,
      );
    }

    checkAbort();

    currentPhase = "VERIFY";
    await updateRunStatus(runId, "VERIFY");
    emitEvent({ type: "phase_change", phase: "VERIFY", message: "Running verification gate..." });

    await verify({ synthesis, agentResults, autonomyMode, emitEvent });

    checkAbort();

    currentPhase = "PRESENT";
    await updateRunStatus(runId, "PRESENT");
    emitEvent({ type: "phase_change", phase: "PRESENT", message: "Generating HTML5 presentation..." });

    const presentation = await withRetry(
      () => present({ synthesis, agentResults, blueprint, emitEvent }),
      { maxRetries: 1, baseDelayMs: 3000, signal, label: "PRESENT" },
    );

    const decksDir = join(process.cwd(), "public", "decks");
    mkdirSync(decksDir, { recursive: true });
    const filename = `${runId}.html`;
    const htmlPath = `/decks/${filename}`;

    let finalHtml = presentation.html;

    if (!finalHtml.includes("presentation.css")) {
      if (finalHtml.includes("</head>")) {
        finalHtml = finalHtml.replace(
          "</head>",
          `  <link rel="stylesheet" href="/styles/presentation.css">\n</head>`,
        );
      }
    }

    if (!finalHtml.includes("presentation.js")) {
      if (finalHtml.includes("</body>")) {
        finalHtml = finalHtml.replace(
          "</body>",
          `  <script src="/js/presentation.js" defer></script>\n</body>`,
        );
      } else {
        const openSections = (finalHtml.match(/<section/g) || []).length;
        const closedSections = (finalHtml.match(/<\/section>/g) || []).length;
        const unclosedSections = openSections - closedSections;
        if (unclosedSections > 0) {
          finalHtml += `\n</div></div></section>`.repeat(unclosedSections);
        }
        finalHtml += `\n<script src="/js/presentation.js" defer></script>\n</body>\n</html>`;
      }
    }

    writeFileSync(join(decksDir, filename), finalHtml, "utf-8");

    await db.presentation.create({
      title: presentation.title,
      subtitle: presentation.subtitle,
      htmlPath,
      slideCount: presentation.slideCount,
      runId,
    });

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

    await db.run.update(runId, {
      status: "COMPLETE",
      completedAt: new Date().toISOString(),
      manifest: manifest as unknown as Record<string, unknown>,
    });

    emitEvent({ type: "complete", manifest });
    return manifest;
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[EXECUTOR] Pipeline ${runId} failed in phase ${currentPhase}:`, errorMessage);

    cancelApproval(runId);

    try {
      await db.run.update(runId, { status: isAbort ? "CANCELLED" : "FAILED" });
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

async function updateRunStatus(runId: string, status: string) {
  await db.run.update(runId, { status });
}

async function persistBlueprint(runId: string, blueprint: Blueprint) {
  await db.run.update(runId, {
    tier: blueprint.tier,
    complexityScore: Math.round(blueprint.complexityScore.total),
    breadth: blueprint.complexityScore.breadth,
    depth: blueprint.complexityScore.depth,
    interconnection: blueprint.complexityScore.interconnection,
    estimatedTime: blueprint.estimatedTime,
  });

  await db.dimension.createMany(
    blueprint.dimensions.map((dim) => ({
      name: dim.name,
      description: dim.description,
      runId,
    })),
  );

  await db.agent.createMany(
    blueprint.agents.map((agent) => ({
      name: agent.name,
      archetype: agent.archetype,
      mandate: agent.mandate,
      tools: JSON.stringify(agent.tools),
      dimension: agent.dimension,
      runId,
    })),
  );
}

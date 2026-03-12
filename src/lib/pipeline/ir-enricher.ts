/**
 * PRISM v2 — IR Enricher
 *
 * Pure functions that project pipeline phase outputs into IR graph entities.
 * Called from executor.ts after each phase completes.
 *
 * Each function mutates the IRGraph in place (the graph lives on the MemoryBus).
 * No side effects, no DB calls, no imports from phase modules.
 */

import type {
  IRGraph,
  IRFinding,
  IRRelationship,
  IRAgent,
  IRSource,
  IRTension,
  IREmergence,
  IRGap,
  IRQuality,
  IRProvenance,
} from "./ir-types";
import { mapSwarmTierToInvestigationTier, deriveSynthesisMode } from "./ir-types";
import type { AgentResult, SwarmTier, SynthesisResult } from "./types";
import type { MemoryBusState } from "./memory-bus";

// ─── Helpers ────────────────────────────────────────────────

function generateIRId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function hashSource(url: string, title: string): string {
  // Simple deterministic hash for dedup
  const input = `${url}|${title}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `src_${Math.abs(hash).toString(36)}`;
}

function confidenceStringToNumber(conf: string): number {
  switch (conf.toUpperCase()) {
    case "HIGH": return 0.9;
    case "MEDIUM": return 0.6;
    case "LOW": return 0.3;
    default: return 0.5;
  }
}

function deriveActionabilityScore(finding: { evidenceType: string; tags: string[] }): number {
  let score = 3;
  if (finding.evidenceType === "direct") score += 1;
  if (finding.evidenceType === "analogical") score -= 1;
  if (finding.tags.some(t => t.toLowerCase().includes("action"))) score += 1;
  return Math.max(1, Math.min(5, score));
}

function deriveNoveltyScore(
  agentName: string,
  value: string,
  allFindings: Array<{ agent: string; value: string }>,
): number {
  // Count how many other agents have similar findings (simple overlap heuristic)
  const words = new Set(value.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  let overlapCount = 0;
  for (const other of allFindings) {
    if (other.agent === agentName) continue;
    const otherWords = new Set(other.value.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const overlap = [...words].filter(w => otherWords.has(w)).length;
    if (words.size > 0 && overlap > words.size * 0.5) overlapCount++;
  }
  // More overlap = less novel
  if (overlapCount === 0) return 5;
  if (overlapCount === 1) return 3;
  return 1;
}

// ─── DEPLOY Enrichment ──────────────────────────────────────

export function enrichAfterDeploy(
  graph: IRGraph,
  agentResults: AgentResult[],
  busState: MemoryBusState,
  swarmTier: SwarmTier,
): void {
  // Set metadata
  graph.metadata.investigationTier = mapSwarmTierToInvestigationTier(swarmTier);
  graph.metadata.agentManifest = agentResults.map(ar => ar.agentName);

  // Collect all blackboard values for novelty scoring
  const allBBValues = busState.blackboard.map(bb => ({
    agent: bb.agent,
    value: bb.value,
  }));

  // Findings — project from blackboard entries (matched with agent results for archetype/dimension)
  let findingIndex = 0;
  const agentLookup = new Map(agentResults.map(ar => [ar.agentName, ar]));

  for (const bb of busState.blackboard) {
    const agentResult = agentLookup.get(bb.agent);
    // EvidenceKind ("direct" | "inferred" | "analogical") is a subset of IRFinding evidenceType
    // so the cast is safe; "modeled" can only appear in IR synthesis enrichment
    const finding: IRFinding = {
      id: bb.id,
      agent: bb.agent,
      agentArchetype: agentResult?.archetype ?? "unknown",
      dimension: agentResult?.dimension ?? "unknown",
      key: bb.key,
      value: bb.value,
      confidence: bb.confidence,
      evidenceType: bb.evidenceType as IRFinding["evidenceType"],
      tags: bb.tags,
      references: bb.references,
      timestamp: bb.timestamp,
      findingIndex,
      actionabilityScore: deriveActionabilityScore(bb),
      noveltyScore: deriveNoveltyScore(bb.agent, bb.value, allBBValues),
    };
    graph.findings.push(finding);
    findingIndex++;
  }

  // Relationships — from bus signals
  for (const sig of busState.signals) {
    const rel: IRRelationship = {
      id: sig.id,
      from: sig.from,
      to: sig.to,
      type: sig.type,
      relationshipType: "discovery",
      priority: sig.priority,
      timestamp: sig.timestamp,
      message: sig.message,
      payload: sig.payload,
    };
    graph.relationships.push(rel);
  }

  // Agents
  for (const ar of agentResults) {
    const agent: IRAgent = {
      id: generateIRId("agent"),
      name: ar.agentName,
      archetype: ar.archetype,
      dimension: ar.dimension,
      findingCount: ar.findings.length,
      gapCount: ar.gaps.length,
      signalCount: ar.signals.length,
      toolsUsed: ar.toolsUsed,
      tokensUsed: ar.tokensUsed,
    };
    graph.agents.push(agent);
  }

  // Sources — extract from finding references, deduplicate
  const sourceMap = new Map<string, IRSource>();
  for (const finding of graph.findings) {
    for (const ref of finding.references) {
      const url = ref;
      const title = ref; // Use URL as title when no title available
      const sourceId = hashSource(url, title);
      if (sourceMap.has(sourceId)) {
        sourceMap.get(sourceId)!.referencedByFindings.push(finding.id);
      } else {
        sourceMap.set(sourceId, {
          id: sourceId,
          title,
          url,
          sourceTier: "SECONDARY",
          referencedByFindings: [finding.id],
        });
      }
    }
  }
  graph.sources.push(...sourceMap.values());

  // Tensions — from bus conflicts
  for (const conflict of busState.conflicts) {
    const tension: IRTension = {
      id: conflict.id,
      registeredBy: conflict.registeredBy,
      timestamp: conflict.timestamp,
      status: conflict.status,
      claim: conflict.claim,
      positions: conflict.positions,
      resolution: conflict.resolution,
      resolutionStrategy: conflict.resolutionStrategy,
    };
    graph.tensions.push(tension);
  }
}

// ─── SYNTHESIZE Enrichment ──────────────────────────────────

export function enrichAfterSynthesize(
  graph: IRGraph,
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
): void {
  // Update metadata
  graph.metadata.pyramidLayersApplied = synthesis.layers.map(l => l.name);
  graph.metadata.synthesisMode = deriveSynthesisMode(synthesis.layers.length);

  // Emergences — from emergentInsights
  for (const ei of synthesis.emergentInsights) {
    // Match constituentFindingIds: find findings from supporting agents
    const constituentFindingIds = graph.findings
      .filter(f => ei.supportingAgents.includes(f.agent))
      .map(f => f.id);

    const emergence: IREmergence = {
      id: generateIRId("emrg"),
      insight: ei.insight,
      algorithm: ei.algorithm,
      supportingAgents: ei.supportingAgents,
      evidenceSources: ei.evidenceSources,
      constituentFindingIds,
      qualityScores: ei.qualityScores,
      whyMultiAgent: ei.whyMultiAgent,
    };
    graph.emergences.push(emergence);
  }

  // Gaps — from gap layer insights (source: synthesis_layer)
  const gapLayer = synthesis.layers.find(l => l.name === "gap");
  if (gapLayer) {
    for (const gapInsight of gapLayer.insights) {
      const gap: IRGap = {
        id: generateIRId("gap"),
        title: gapInsight.slice(0, 80),
        description: gapInsight,
        gapType: "structural",
        source: "synthesis_layer",
        priority: "medium",
        researchable: true,
      };
      graph.gaps.push(gap);
    }
  }

  // Gaps — from agent-reported gaps (source: agent_reported)
  for (const ar of agentResults) {
    for (const gapText of ar.gaps) {
      const gap: IRGap = {
        id: generateIRId("gap"),
        title: gapText.slice(0, 80),
        description: gapText,
        gapType: "researchable",
        source: "agent_reported",
        sourceAgent: ar.agentName,
        priority: "medium",
        researchable: true,
      };
      graph.gaps.push(gap);
    }
  }

  // Enrich tensions with conflictType from tension points
  for (const tp of synthesis.tensionPoints) {
    // Find matching tension by claim text similarity
    const matchingTension = graph.tensions.find(t =>
      t.claim.toLowerCase().includes(tp.tension.toLowerCase().slice(0, 20)) ||
      tp.tension.toLowerCase().includes(t.claim.toLowerCase().slice(0, 20))
    );
    if (matchingTension) {
      matchingTension.conflictType = tp.conflictType;
      matchingTension.resolutionFramework = tp.resolution;
    }
  }

  // Add convergence edges from the convergence layer
  const convergenceLayer = synthesis.layers.find(l => l.name === "convergence");
  if (convergenceLayer) {
    // Create inter-agent convergence relationships for agents that appear in emergences together
    for (const emergence of graph.emergences) {
      const agents = emergence.supportingAgents;
      for (let i = 0; i < agents.length - 1; i++) {
        const rel: IRRelationship = {
          id: generateIRId("rel"),
          from: agents[i],
          to: agents[i + 1],
          type: "discovery",
          relationshipType: "convergence",
          priority: "medium",
          timestamp: new Date().toISOString(),
          message: `Convergence on: ${emergence.insight.slice(0, 60)}`,
        };
        graph.relationships.push(rel);
      }
    }
  }
}

// ─── QA Enrichment ──────────────────────────────────────────

/**
 * Minimal interface for the QA report data we need.
 * Avoids importing the full QA module types.
 */
export interface QAReportForIR {
  score: {
    overallScore: number;
    grade: string;
    dimensions: Array<{
      name: string;
      score: number;
      weight?: number;
      details: string;
    }>;
  };
  provenance: {
    chainCompleteness: number;
    links: Array<{
      claim: string;
      findingStatement?: string;
      agentName: string;
      source: string;
      sourceVerifiable: boolean;
      chainComplete: boolean;
      chainGaps: string[];
    }>;
  };
  warnings: Array<{
    severity: "critical" | "major" | "minor" | "info";
    category: string;
    message: string;
  }>;
  passesAllGates: boolean;
}

export function enrichAfterQA(
  graph: IRGraph,
  qaReport: QAReportForIR,
): void {
  // Quality
  graph.quality = {
    overallScore: qaReport.score.overallScore,
    grade: qaReport.score.grade,
    passesQualityGate: qaReport.passesAllGates,
    dimensions: qaReport.score.dimensions.map(d => ({
      name: d.name,
      score: d.score,
      weight: d.weight ?? 0,
      details: d.details,
    })),
    warnings: qaReport.warnings,
    recommendations: [],
  };

  // Provenance
  const links = qaReport.provenance.links.map(link => {
    // Match to a finding by agent name + claim overlap
    const matchingFinding = graph.findings.find(f =>
      f.agent === link.agentName &&
      (f.value.includes(link.claim.slice(0, 30)) || link.claim.includes(f.value.slice(0, 30)))
    );
    return {
      claim: link.claim,
      findingId: matchingFinding?.id ?? "unmatched",
      agentName: link.agentName,
      source: link.source,
      sourceVerifiable: link.sourceVerifiable,
      chainComplete: link.chainComplete,
      chainGaps: link.chainGaps,
    };
  });

  graph.provenance = {
    totalClaims: links.length,
    verifiableSources: links.filter(l => l.sourceVerifiable).length,
    unverifiableSources: links.filter(l => !l.sourceVerifiable).length,
    chainCompleteness: qaReport.provenance.chainCompleteness,
    links,
  };

  // Stamp findings with provenance data
  for (const link of links) {
    if (link.findingId === "unmatched") continue;
    const finding = graph.findings.find(f => f.id === link.findingId);
    if (finding) {
      finding.sourceVerified = link.sourceVerifiable;
      finding.provenanceComplete = link.chainComplete;
    }
  }
}

// ─── Finalize ───────────────────────────────────────────────

export function finalizeIRMetadata(graph: IRGraph): void {
  graph.metadata.timestamp = new Date().toISOString();
  if (graph.quality) {
    graph.metadata.qualityGrade = graph.quality.grade;
    graph.metadata.overallScore = graph.quality.overallScore;
  }
}

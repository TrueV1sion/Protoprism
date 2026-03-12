/**
 * PRISM Pipeline -- Phase 3.5: VERIFY
 *
 * Pre-presentation verification gate.
 *
 * Extracts the top claims from synthesis, classifies their source tier,
 * and flags unverified claims. Behavior depends on autonomy mode:
 *
 * - supervised: returns approved=false (executor waits for user confirmation)
 * - guided: auto-approves after emitting the verification gate event
 * - autonomous: skips verification entirely (immediate approval)
 *
 * This phase does NOT make API calls to verify claims (that is handled
 * by CRITIC-FACTUAL in Phase 2). It is a classification + gating step.
 */

import type {
  SynthesisResult,
  AgentResult,
  AutonomyMode,
  PipelineEvent,
  VerifiedClaim,
  FindingModification,
  SourceTier,
  AgentFinding,
} from "./types";
import type { MemoryBus } from "./memory-bus";

// ─── Types ──────────────────────────────────────────────────

export interface VerifyInput {
  synthesis: SynthesisResult;
  agentResults: AgentResult[];
  autonomyMode: AutonomyMode;
  emitEvent: (event: PipelineEvent) => void;
  memoryBus?: MemoryBus;
}

export interface VerifyOutput {
  approved: boolean;
  topClaims: VerifiedClaim[];
  modifications: FindingModification[];
}

// ─── Claim Extraction ───────────────────────────────────────

interface RankedClaim {
  claim: string;
  impactScore: number;
  sourceTier: SourceTier;
  sourceAgent: string;
  findingIndex: number;
}

/**
 * Extract candidate claims from synthesis layers. Prioritizes:
 * 1. Stat card candidates (numeric claims from convergence/foundation layers)
 * 2. Key numbers in emergence layer insights
 * 3. Emergent insight headlines
 */
function extractCandidateClaims(
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
  memoryBus?: MemoryBus,
): RankedClaim[] {
  const candidates: RankedClaim[] = [];

  // --- 1. Claims from synthesis layers (foundation + convergence have key stats) ---
  const priorityLayers = ["foundation", "convergence", "emergence"];

  for (const layer of synthesis.layers) {
    const layerPriority = priorityLayers.indexOf(layer.name);
    const baseScore = layerPriority >= 0 ? (3 - layerPriority) * 2 : 0;

    for (const insight of layer.insights) {
      // Higher impact if it contains numbers (stat card candidates)
      const hasNumbers = /\d+[\d,.]*\s*[%$BMK]|\$[\d,.]+|[\d,.]+\s*(billion|million|percent)/i.test(insight);
      const impactScore = baseScore + (hasNumbers ? 3 : 1);

      // Try to trace this claim back to an agent finding
      const tracing = traceClaimToFinding(insight, agentResults);

      candidates.push({
        claim: insight,
        impactScore,
        sourceTier: tracing.sourceTier,
        sourceAgent: tracing.agentName,
        findingIndex: tracing.findingIndex,
      });
    }
  }

  // --- 2. Emergent insights (always high-impact) ---
  for (const emergent of synthesis.emergentInsights) {
    const tracing = traceClaimToFinding(emergent.insight, agentResults);

    candidates.push({
      claim: emergent.insight,
      impactScore: 8, // Emergent insights are inherently high-impact
      sourceTier: tracing.sourceTier,
      sourceAgent: tracing.agentName,
      findingIndex: tracing.findingIndex,
    });
  }

  // --- 3. Tension point claims ---
  for (const tension of synthesis.tensionPoints) {
    const tracingA = traceClaimToFinding(tension.sideA.position, agentResults);

    candidates.push({
      claim: tension.tension,
      impactScore: 5, // Tensions are moderately high impact
      sourceTier: tracingA.sourceTier,
      sourceAgent: tracingA.agentName,
      findingIndex: tracingA.findingIndex,
    });
  }

  // --- 4. Claims from open MemoryBus conflicts ---
  if (memoryBus) {
    for (const conflict of memoryBus.getOpenConflicts()) {
      candidates.push({
        claim: conflict.claim,
        impactScore: 6, // Conflicts are moderately-high impact
        sourceTier: "SECONDARY",
        sourceAgent: conflict.registeredBy,
        findingIndex: -1,
      });
    }
  }

  // Sort by impact score descending and take top 10
  candidates.sort((a, b) => b.impactScore - a.impactScore);
  return candidates.slice(0, 10);
}

/**
 * Trace a synthesis claim back to the most likely source finding.
 * Uses simple text overlap heuristic — the finding whose statement + evidence
 * has the highest keyword overlap with the claim is chosen.
 */
function traceClaimToFinding(
  claim: string,
  agentResults: AgentResult[],
): { sourceTier: SourceTier; agentName: string; findingIndex: number } {
  const claimWords = new Set(
    claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );

  let bestMatch = { sourceTier: "TERTIARY" as SourceTier, agentName: "", findingIndex: -1 };
  let bestOverlap = 0;

  for (const agent of agentResults) {
    for (let i = 0; i < agent.findings.length; i++) {
      const finding = agent.findings[i];
      const findingText = `${finding.statement} ${finding.evidence} ${finding.implication}`.toLowerCase();
      const findingWords = findingText.split(/\s+/).filter((w) => w.length > 3);

      let overlap = 0;
      for (const word of findingWords) {
        if (claimWords.has(word)) overlap++;
      }

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = {
          sourceTier: finding.sourceTier,
          agentName: agent.agentName,
          findingIndex: i,
        };
      }
    }
  }

  return bestMatch;
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Phase 3.5: Verify top claims from synthesis before presentation.
 *
 * Extracts the highest-impact claims, classifies their source tiers,
 * and gates the pipeline based on autonomy mode.
 */
export async function verify(input: VerifyInput): Promise<VerifyOutput> {
  const { synthesis, agentResults, autonomyMode, emitEvent, memoryBus } = input;

  // Autonomous mode: skip verification entirely
  if (autonomyMode === "autonomous") {
    return {
      approved: true,
      topClaims: [],
      modifications: [],
    };
  }

  // --- Extract and rank top claims ---
  const rankedClaims = extractCandidateClaims(synthesis, agentResults, memoryBus);

  // --- Build verified claims list ---
  const topClaims: VerifiedClaim[] = rankedClaims.map((rc) => ({
    claim: rc.claim,
    sourceTier: rc.sourceTier,
    verified: rc.sourceTier === "PRIMARY",
    correction: undefined,
  }));

  // --- Flag modifications for unverified claims ---
  const modifications: FindingModification[] = rankedClaims
    .filter((rc) => rc.sourceTier !== "PRIMARY" && rc.findingIndex >= 0)
    .map((rc) => ({
      findingIndex: rc.findingIndex,
      agentName: rc.sourceAgent,
      action: "flag" as const,
      reason: `Claim sourced from ${rc.sourceTier} tier — primary source not verified`,
    }));

  // --- Emit verification gate event ---
  emitEvent({ type: "verification_gate", claims: topClaims });

  // --- Gate based on autonomy mode ---
  if (autonomyMode === "supervised") {
    // Supervised: do NOT auto-approve — executor must wait for user confirmation
    return {
      approved: false,
      topClaims,
      modifications,
    };
  }

  // Guided: auto-approve after emitting the gate event
  return {
    approved: true,
    topClaims,
    modifications,
  };
}

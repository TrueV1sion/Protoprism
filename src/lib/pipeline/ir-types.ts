/**
 * PRISM v2 — Intermediate Representation Types
 *
 * The IR Graph extends the MemoryBus with typed entities for all
 * v2 delivery vehicles. See: docs/superpowers/specs/2026-03-12-ir-schema-emitter-design.md
 */

import type { SwarmTier } from "./types";

// ─── Investigation Tier (consumer-facing) ───────────────────

export type InvestigationTier = "SIGNAL" | "FOCUSED" | "EXTENDED" | "PERSISTENT";
export type SynthesisMode = "facts_only" | "convergence" | "full_pyramid";

const SWARM_TO_INVESTIGATION: Record<SwarmTier, InvestigationTier> = {
  MICRO: "SIGNAL",
  STANDARD: "FOCUSED",
  EXTENDED: "EXTENDED",
  MEGA: "EXTENDED",
  CAMPAIGN: "EXTENDED",
};

export function mapSwarmTierToInvestigationTier(swarmTier: SwarmTier): InvestigationTier {
  return SWARM_TO_INVESTIGATION[swarmTier];
}

export function deriveSynthesisMode(layerCount: number): SynthesisMode {
  if (layerCount <= 1) return "facts_only";
  if (layerCount === 2) return "convergence";
  return "full_pyramid";
}

// ─── IR Entity Definitions ──────────────────────────────────

export interface IRFinding {
  id: string;
  agent: string;
  agentArchetype: string;
  dimension: string;
  key: string;
  value: string;
  confidence: number;
  evidenceType: "direct" | "inferred" | "analogical" | "modeled";
  tags: string[];
  references: string[];
  timestamp: string;
  findingIndex: number;
  actionabilityScore: number;
  noveltyScore: number;
  sourceVerified?: boolean;
  provenanceComplete?: boolean;
}

export interface IRRelationship {
  id: string;
  from: string;
  to: string;
  type: "discovery" | "warning" | "request" | "redirect";
  relationshipType: "convergence" | "dependency" | "discovery" | "tension_link";
  priority: "low" | "medium" | "high" | "critical";
  timestamp: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface IRTension {
  id: string;
  registeredBy: string;
  timestamp: string;
  status: "open" | "resolved" | "deferred";
  claim: string;
  positions: Array<{
    agent: string;
    position: string;
    evidence: string;
    confidence: number;
  }>;
  resolution: string | null;
  resolutionStrategy?: string;
  conflictType?: "factual" | "interpretive" | "methodological" | "scope" | "predictive" | "values_based";
  resolutionFramework?: string;
}

export interface IREmergence {
  id: string;
  insight: string;
  algorithm:
    | "cross_agent_theme_mining"
    | "tension_point_mapping"
    | "gap_triangulation"
    | "structural_pattern_recognition";
  supportingAgents: string[];
  evidenceSources: string[];
  constituentFindingIds: string[];
  qualityScores: {
    novelty: number;
    grounding: number;
    actionability: number;
    depth: number;
    surprise: number;
  };
  whyMultiAgent: string;
}

export interface IRGap {
  id: string;
  title: string;
  description: string;
  gapType: "structural" | "researchable" | "emerging";
  source: "synthesis_layer" | "agent_reported";
  sourceAgent?: string;
  priority: "low" | "medium" | "high";
  researchable: boolean;
}

export interface IRAgent {
  id: string;
  name: string;
  archetype: string;
  dimension: string;
  findingCount: number;
  gapCount: number;
  signalCount: number;
  toolsUsed: string[];
  tokensUsed: number;
}

export interface IRSource {
  id: string;
  title: string;
  url?: string;
  sourceTier: "PRIMARY" | "SECONDARY" | "TERTIARY";
  accessDate?: string;
  reliabilityNotes?: string;
  referencedByFindings: string[];
}

export interface IRQuality {
  overallScore: number;
  grade: string;
  passesQualityGate: boolean;
  dimensions: Array<{
    name: string;
    score: number;
    weight: number;
    details: string;
  }>;
  warnings: Array<{
    severity: "critical" | "major" | "minor" | "info";
    category: string;
    message: string;
  }>;
  recommendations: string[];
}

export interface IRProvenance {
  totalClaims: number;
  verifiableSources: number;
  unverifiableSources: number;
  chainCompleteness: number;
  links: Array<{
    claim: string;
    findingId: string;
    agentName: string;
    source: string;
    sourceVerifiable: boolean;
    chainComplete: boolean;
    chainGaps: string[];
  }>;
}

// ─── Metadata Envelope ──────────────────────────────────────

export interface IRMetadata {
  version: string;
  investigationTier: InvestigationTier;
  synthesisMode: SynthesisMode;
  entityId?: string;
  runId: string;
  timestamp: string;
  agentManifest: string[];
  pyramidLayersApplied: string[];
  escalationHistory: string[];
  qualityGrade?: string;
  overallScore?: number;
}

// ─── Full IR Graph ──────────────────────────────────────────

export interface IRGraph {
  metadata: IRMetadata;
  findings: IRFinding[];
  relationships: IRRelationship[];
  tensions: IRTension[];
  emergences: IREmergence[];
  gaps: IRGap[];
  agents: IRAgent[];
  sources: IRSource[];
  quality?: IRQuality;
  provenance?: IRProvenance;
}

// ─── Factory ────────────────────────────────────────────────

export function createEmptyIRGraph(runId: string, _query: string): IRGraph {
  return {
    metadata: {
      version: "2.0.0",
      investigationTier: "FOCUSED",
      synthesisMode: "facts_only",
      runId,
      timestamp: new Date().toISOString(),
      agentManifest: [],
      pyramidLayersApplied: [],
      escalationHistory: [],
    },
    findings: [],
    relationships: [],
    tensions: [],
    emergences: [],
    gaps: [],
    agents: [],
    sources: [],
  };
}

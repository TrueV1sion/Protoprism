/**
 * PRISM Pipeline Types
 *
 * Core type definitions for the PRISM intelligence pipeline.
 * All types use Zod schemas for runtime validation and export inferred TypeScript types.
 * Aligned with methodology-core.md and SKILL.md specs.
 */

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────

export const SwarmTierEnum = z.enum(["MICRO", "STANDARD", "EXTENDED", "MEGA", "CAMPAIGN"]);
export type SwarmTier = z.infer<typeof SwarmTierEnum>;


export const ConfidenceLevelEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelEnum>;

export const SourceTierEnum = z.enum(["PRIMARY", "SECONDARY", "TERTIARY"]);
export type SourceTier = z.infer<typeof SourceTierEnum>;

export const EvidenceTypeEnum = z.enum(["direct", "inferred", "analogical", "modeled"]);
export type EvidenceType = z.infer<typeof EvidenceTypeEnum>;

export const FindingActionEnum = z.enum(["keep", "dismiss", "boost", "flag"]);
export type FindingAction = z.infer<typeof FindingActionEnum>;

export const AutonomyModeEnum = z.enum(["supervised", "guided", "autonomous"]);
export type AutonomyMode = z.infer<typeof AutonomyModeEnum>;

export const ConflictTypeEnum = z.enum([
  "factual", "interpretive", "methodological", "predictive", "values_based", "scope",
]);
export type ConflictType = z.infer<typeof ConflictTypeEnum>;

export const NudgeTypeEnum = z.enum(["CORRECT", "DEEPEN", "EXTEND", "MODEL", "TARGET"]);
export type NudgeType = z.infer<typeof NudgeTypeEnum>;

export type AgentStatus = "idle" | "active" | "complete" | "failed";

export type ArchetypeFamily =
  | "RESEARCHER-WEB" | "RESEARCHER-DATA" | "RESEARCHER-DOMAIN" | "RESEARCHER-LATERAL"
  | "ANALYST-FINANCIAL" | "ANALYST-STRATEGIC" | "ANALYST-TECHNICAL" | "ANALYST-RISK" | "ANALYST-QUALITY"
  | "CREATOR-WRITER" | "CREATOR-PRESENTER" | "CREATOR-TECHNICAL" | "CREATOR-PERSUADER"
  | "CRITIC-FACTUAL" | "CRITIC-LOGICAL" | "CRITIC-STRATEGIC" | "CRITIC-EDITORIAL"
  | "SYNTHESIZER" | "ARBITER"
  | "DEVILS-ADVOCATE" | "FUTURIST" | "HISTORIAN" | "RED-TEAM" | "CUSTOMER-PROXY"
  | "LEGISLATIVE-PIPELINE" | "REGULATORY-RADAR" | "MACRO-CONTEXT";


// ─── Phase 0: THINK ──────────────────────────────────────────

export const DimensionAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  justification: z.string(),
  dataSources: z.array(z.string()),
  lens: z.string(),
  signalMatch: z.string(),
});
export type DimensionAnalysis = z.infer<typeof DimensionAnalysisSchema>;

export const InterconnectionSchema = z.object({
  dimensionA: z.string(),
  dimensionB: z.string(),
  coupling: z.number().min(1).max(5),
  mechanism: z.string(),
});
export type Interconnection = z.infer<typeof InterconnectionSchema>;

export const AgentRecommendationSchema = z.object({
  name: z.string(),
  archetype: z.string(),
  dimension: z.string(),
  mandate: z.string(),
  tools: z.array(z.string()),
  lens: z.string(),
  bias: z.string(),
});
export type AgentRecommendation = z.infer<typeof AgentRecommendationSchema>;

export const ComplexityScoreSchema = z.object({
  breadth: z.number().min(1).max(5),
  depth: z.number().min(1).max(5),
  interconnection: z.number().min(1).max(5),
  total: z.number(),
  urgency: z.number().min(0.8).max(1.5).default(1.0),
  adjusted: z.number(),
  reasoning: z.string(),
});
export type ComplexityScore = z.infer<typeof ComplexityScoreSchema>;

export const BlueprintSchema = z.object({
  query: z.string(),
  dimensions: z.array(DimensionAnalysisSchema).min(2).max(15),
  agents: z.array(AgentRecommendationSchema).min(2).max(15),
  interconnections: z.array(InterconnectionSchema),
  complexityScore: ComplexityScoreSchema,
  tier: SwarmTierEnum,
  estimatedTime: z.string(),
  ethicalConcerns: z.array(z.string()),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;


// ─── Phase 1: CONSTRUCT ──────────────────────────────────────

export const ConstructedAgentSchema = z.object({
  name: z.string(),
  archetype: z.string(),
  dimension: z.string(),
  mandate: z.string(),
  systemPrompt: z.string(),
  researchPrompt: z.string(),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  color: z.string(),
  neutralFramingApplied: z.boolean(),
});
export type ConstructedAgent = z.infer<typeof ConstructedAgentSchema>;


// ─── Phase 2: DEPLOY ─────────────────────────────────────────

export const AgentFindingSchema = z.object({
  statement: z.string(),
  evidence: z.string(),
  confidence: ConfidenceLevelEnum,
  sourceTier: SourceTierEnum,
  evidenceType: EvidenceTypeEnum,
  source: z.string(),
  implication: z.string(),
  tags: z.array(z.string()),
});
export type AgentFinding = z.infer<typeof AgentFindingSchema>;

export const AgentResultSchema = z.object({
  agentName: z.string(),
  archetype: z.string(),
  dimension: z.string(),
  findings: z.array(AgentFindingSchema),
  gaps: z.array(z.string()),
  signals: z.array(z.string()),
  minorityViews: z.array(z.string()).default([]),
  toolsUsed: z.array(z.string()),
  tokensUsed: z.number(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;


// ─── Phase 3: SYNTHESIZE ─────────────────────────────────────

export const EmergenceQualitySchema = z.object({
  novelty: z.number().min(1).max(5),
  grounding: z.number().min(1).max(5),
  actionability: z.number().min(1).max(5),
  depth: z.number().min(1).max(5),
  surprise: z.number().min(1).max(5),
});
export type EmergenceQuality = z.infer<typeof EmergenceQualitySchema>;

export const EmergentInsightSchema = z.object({
  insight: z.string(),
  algorithm: z.enum([
    "cross_agent_theme_mining",
    "tension_point_mapping",
    "gap_triangulation",
    "structural_pattern_recognition",
  ]),
  supportingAgents: z.array(z.string()),
  evidenceSources: z.array(z.string()),
  qualityScores: EmergenceQualitySchema,
  whyMultiAgent: z.string(),
});
export type EmergentInsight = z.infer<typeof EmergentInsightSchema>;

export const TensionSideSchema = z.object({
  position: z.string(),
  agents: z.array(z.string()),
  evidence: z.array(z.string()),
});

export const TensionPointSchema = z.object({
  tension: z.string(),
  sideA: TensionSideSchema,
  sideB: TensionSideSchema,
  conflictType: ConflictTypeEnum,
  resolution: z.string(),
});
export type TensionPoint = z.infer<typeof TensionPointSchema>;

export const SynthesisLayerSchema = z.object({
  name: z.enum(["foundation", "convergence", "tension", "emergence", "gap"]),
  insights: z.array(z.string()),
  description: z.string(),
});
export type SynthesisLayer = z.infer<typeof SynthesisLayerSchema>;

export const SynthesisResultSchema = z.object({
  layers: z.array(SynthesisLayerSchema),
  emergentInsights: z.array(EmergentInsightSchema).default([]),
  tensionPoints: z.array(TensionPointSchema).default([]),
  overallConfidence: ConfidenceLevelEnum,
  criticRevisions: z.array(z.string()).default([]),
});
export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;


// ─── Phase 4: PRESENT ────────────────────────────────────────

export const PresentationResultSchema = z.object({
  html: z.string(),
  title: z.string(),
  subtitle: z.string(),
  slideCount: z.number(),
});
export type PresentationResult = z.infer<typeof PresentationResultSchema>;


// ─── Quality Report ──────────────────────────────────────────

export const QualityReportSchema = z.object({
  totalFindings: z.number(),
  sourcedFindings: z.number(),
  sourceCoveragePercent: z.number(),
  confidenceDistribution: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  sourceTierDistribution: z.object({
    primary: z.number(),
    secondary: z.number(),
    tertiary: z.number(),
  }),
  emergenceYield: z.number(),
  gapCount: z.number(),
  provenanceComplete: z.boolean(),
  // ─── Extended QA fields (populated when full QA system is wired) ───
  grade: z.string().optional(),                    // e.g. "A", "B+", "C"
  overallScore: z.number().optional(),             // 0-100 weighted score
  provenanceCompleteness: z.number().optional(),   // 0-100% chain completeness
  warningCount: z.number().optional(),             // total QA warnings
  criticalWarnings: z.array(z.string()).optional(), // critical-severity warning messages
  dimensions: z.array(z.object({
    name: z.string(),
    score: z.number(),
    details: z.string(),
  })).optional(),
});
export type QualityReport = z.infer<typeof QualityReportSchema>;


// ─── Pipeline Events (SSE) ──────────────────────────────────

export type PipelineEvent =
  | { type: "phase_change"; phase: string; message: string }
  | { type: "blueprint"; blueprint: Blueprint }
  | { type: "agent_spawned"; agentName: string; archetype: string; dimension: string }
  | { type: "agent_progress"; agentName: string; progress: number; message: string }
  | { type: "tool_call"; agentName: string; toolName: string; serverName: string }
  | { type: "finding_added"; agentName: string; finding: AgentFinding }
  | { type: "agent_complete"; agentName: string; findingCount: number; tokensUsed: number }
  | { type: "synthesis_started"; agentCount: number }
  | { type: "synthesis_layer"; layer: SynthesisLayer }
  | { type: "emergence_detected"; insight: EmergentInsight }
  | { type: "critic_review"; issue: string; severity: string }
  | { type: "verification_gate"; claims: VerifiedClaim[] }
  | { type: "quality_report"; report: QualityReport }
  | { type: "presentation_started" }
  | { type: "presentation_complete"; title: string; slideCount: number; htmlPath: string }
  | { type: "complete"; manifest: IntelligenceManifest }
  | { type: "error"; message: string; phase?: string }
  | { type: "thinking_token"; token: string };


// ─── Verification Gate (Phase 3.5) ──────────────────────────

export const VerifiedClaimSchema = z.object({
  claim: z.string(),
  sourceTier: SourceTierEnum,
  verified: z.boolean(),
  correction: z.string().optional(),
});
export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>;

export const FindingModificationSchema = z.object({
  findingIndex: z.number(),
  agentName: z.string(),
  action: FindingActionEnum,
  reason: z.string().optional(),
});
export type FindingModification = z.infer<typeof FindingModificationSchema>;


// ─── Intelligence Manifest ──────────────────────────────────

export interface IntelligenceManifest {
  blueprint: Blueprint;
  agentResults: AgentResult[];
  synthesis: SynthesisResult;
  presentation: PresentationResult;
  qualityReport: QualityReport;
  metadata: {
    runId: string;
    startTime: string;
    endTime: string;
    totalTokens: number;
    totalCost: number;
  };
}

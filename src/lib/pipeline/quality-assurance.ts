/**
 * PRISM Phase 4 — Quality Assurance System
 * 
 * Four interlocking components:
 * 
 * 1. ProvenanceTracker — Builds the full chain: claim → finding → agent → evidence → source
 * 2. QualityGates — HITL (Human-in-the-Loop) gates at 3 pipeline stages
 * 3. OutputScorer — Structured scoring rubric for final intelligence quality
 * 4. QualityWarningAggregator — Collects, classifies, and prioritizes all quality signals
 * 
 * These components wire into the existing executor pipeline between
 * SYNTHESIZE and COMPLETE phases.
 */

import type {
    IntelligenceManifest,
    Blueprint,
    AgentResult,
    AgentFinding,
    SynthesisResult,
    EmergentInsight,
    PipelineEvent,
    ConfidenceLevel,
} from "./types";
import type { AgentDeployResult } from "./deploy";
import type { MemoryBus } from "./memory-bus";


// ═══════════════════════════════════════════════════════════════
// 1. PROVENANCE TRACKER
// ═══════════════════════════════════════════════════════════════

/** A single link in the provenance chain */
export interface ProvenanceLink {
    /** Unique ID for this provenance link */
    id: string;
    /** The claim or insight statement */
    claim: string;
    /** The agent finding that supports this claim */
    findingStatement: string;
    /** The agent that produced this finding */
    agentName: string;
    /** The agent's archetype */
    agentArchetype: string;
    /** The evidence cited by the agent */
    evidence: string;
    /** The primary source */
    source: string;
    /** Confidence level from the agent */
    confidence: ConfidenceLevel;
    /** Why the agent assigned this confidence */
    confidenceReasoning: string;
    /** Evidence type classification */
    evidenceType: string;
    /** Dimension this finding belongs to */
    dimension: string;
    /** Whether the source is verifiable (has URL, DOI, or named reference) */
    sourceVerifiable: boolean;
    /** Whether the chain is complete (all fields populated) */
    chainComplete: boolean;
    /** Any chain breaks or gaps */
    chainGaps: string[];
}

/** Full provenance report */
export interface ProvenanceReport {
    links: ProvenanceLink[];
    totalClaims: number;
    verifiableSources: number;
    unverifiableSources: number;
    completeChains: number;
    incompleteChains: number;
    chainCompleteness: number; // 0-100%
    gapSummary: string[];
}

/**
 * Build the full provenance chain from agent deployment results.
 * 
 * Every finding is traced back through:
 * claim → finding → agent → evidence → source
 * 
 * Chain breaks are flagged — a finding without a verifiable source
 * is NOT rejected but IS flagged for human review.
 */
export function buildProvenanceChain(
    agentResults: AgentDeployResult[],
    blueprint: Blueprint,
    memoryBus?: MemoryBus,
): ProvenanceReport {
    const links: ProvenanceLink[] = [];
    let linkId = 0;

    for (const result of agentResults) {
        if (!result.result) continue;

        const agentSpec = blueprint.agents.find(a => a.name === result.agentName);
        const dimension = result.dimension;
        const archetype = agentSpec?.archetype ?? "UNKNOWN";

        for (const finding of result.result.findings) {
            const chainGaps: string[] = [];

            // Check source verifiability
            const sourceVerifiable = isSourceVerifiable(finding.source);
            if (!sourceVerifiable) {
                chainGaps.push("Source is not independently verifiable (no URL, DOI, or named document)");
            }

            // Check evidence quality
            if (!finding.evidence || finding.evidence.trim().length < 10) {
                chainGaps.push("Evidence field is empty or too brief to evaluate");
            }

            // Check evidence detail (proxy for confidence reasoning)
            if (!finding.evidence || finding.evidence.trim().length < 20) {
                chainGaps.push("Evidence is too brief to assess confidence reasoning");
            }

            // Check for circular evidence (agent cites itself or LLM-generated content)
            if (finding.source.toLowerCase().includes("analysis") ||
                finding.source.toLowerCase().includes("assessment") ||
                finding.source.toLowerCase().includes("own observation")) {
                chainGaps.push("Potential circular evidence — source may be self-referential");
            }

            links.push({
                id: `prov-${++linkId}`,
                claim: finding.statement,
                findingStatement: finding.statement,
                agentName: result.agentName,
                agentArchetype: archetype,
                evidence: finding.evidence,
                source: finding.source,
                confidence: finding.confidence as ConfidenceLevel,
                confidenceReasoning: finding.evidence,
                evidenceType: finding.evidenceType,
                dimension,
                sourceVerifiable,
                chainComplete: chainGaps.length === 0,
                chainGaps,
            });
        }
    }

    // ─── Blackboard provenance enrichment ────────────────
    // If a MemoryBus is available, cross-reference each provenance link
    // against blackboard entries. When a blackboard entry's value overlaps
    // with the finding statement, use its `references` array to strengthen
    // the provenance chain (fill source gaps, mark verifiable).
    if (memoryBus) {
        const bbEntries = memoryBus.readBlackboard();
        for (const link of links) {
            // Find matching blackboard entry by text overlap with the claim
            const claimWords = link.claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const matchingEntry = bbEntries.find(entry => {
                const entryValue = entry.value.toLowerCase();
                const overlapCount = claimWords.filter(w => entryValue.includes(w)).length;
                // Require at least 30% of significant words to overlap
                return claimWords.length > 0 && overlapCount / claimWords.length >= 0.3;
            });

            if (matchingEntry && matchingEntry.references.length > 0) {
                // Strengthen provenance: if the original source was not verifiable,
                // check if any blackboard reference is verifiable
                const bbRefsJoined = matchingEntry.references.join("; ");
                if (!link.sourceVerifiable) {
                    const bbRefVerifiable = matchingEntry.references.some(ref => isSourceVerifiable(ref));
                    if (bbRefVerifiable) {
                        link.source = `${link.source} [bus-corroborated: ${bbRefsJoined}]`;
                        link.sourceVerifiable = true;
                        // Remove the gap about unverifiable source if it was the only issue
                        const gapIdx = link.chainGaps.indexOf(
                            "Source is not independently verifiable (no URL, DOI, or named document)"
                        );
                        if (gapIdx !== -1) {
                            link.chainGaps.splice(gapIdx, 1);
                        }
                        link.chainComplete = link.chainGaps.length === 0;
                    }
                } else {
                    // Already verifiable — append bus corroboration for extra provenance depth
                    link.evidence = `${link.evidence} [bus-corroborated: ${bbRefsJoined}]`;
                }
            }
        }
    }

    const verifiable = links.filter(l => l.sourceVerifiable).length;
    const complete = links.filter(l => l.chainComplete).length;

    // Build gap summary
    const gapSummary: string[] = [];
    const unverifiable = links.filter(l => !l.sourceVerifiable);
    if (unverifiable.length > 0) {
        gapSummary.push(`${unverifiable.length} finding(s) lack verifiable sources`);
    }
    const selfReferential = links.filter(l => l.chainGaps.some(g => g.includes("circular")));
    if (selfReferential.length > 0) {
        gapSummary.push(`${selfReferential.length} finding(s) may have circular evidence`);
    }
    const missingReasoning = links.filter(l => l.chainGaps.some(g => g.includes("Confidence reasoning")));
    if (missingReasoning.length > 0) {
        gapSummary.push(`${missingReasoning.length} finding(s) have insufficient confidence reasoning`);
    }

    return {
        links,
        totalClaims: links.length,
        verifiableSources: verifiable,
        unverifiableSources: links.length - verifiable,
        completeChains: complete,
        incompleteChains: links.length - complete,
        chainCompleteness: links.length > 0 ? Math.round((complete / links.length) * 100) : 0,
        gapSummary,
    };
}

/** Check if a source string is independently verifiable */
function isSourceVerifiable(source: string): boolean {
    if (!source || source.trim().length === 0) return false;

    const verifiablePatterns = [
        /https?:\/\//i,          // URL
        /doi:/i,                  // DOI
        /pmid:\s*\d+/i,          // PubMed ID
        /nct\d{8}/i,             // ClinicalTrials.gov NCT number
        /10\.\d{4,}/,            // DOI number format
        /sec\.gov/i,             // SEC filing
        /federalregister\.gov/i, // Federal Register
        /cms\.gov/i,             // CMS
        /fda\.gov/i,             // FDA
        /\d{4}\s+report/i,       // Named report with year
        /annual\s+report/i,      // Annual report
        /press\s+release/i,      // Press release
        /earnings\s+call/i,      // Earnings call
        /10-[kq]/i,              // SEC filing type
        /8-k/i,                  // SEC material event
    ];

    return verifiablePatterns.some(p => p.test(source));
}


// ═══════════════════════════════════════════════════════════════
// 2. HITL QUALITY GATES
// ═══════════════════════════════════════════════════════════════

export type GateStage = "blueprint" | "findings" | "synthesis";
export type GateAction = "approve" | "reject" | "modify" | "flag";

/** A single finding-level action in the HITL triage */
export interface FindingAction {
    findingId: string;
    findingStatement: string;
    action: GateAction;
    reason?: string;
    modifiedContent?: string;
}

/** HITL gate decision */
export interface GateDecision {
    stage: GateStage;
    action: GateAction;
    decidedBy: string;
    decidedAt: string;
    reason?: string;
    findingActions?: FindingAction[];
    autoApproved: boolean;
}

/** Quality gate configuration */
export interface GateConfig {
    /** Whether this gate is enabled */
    enabled: boolean;
    /** Auto-approve if quality score exceeds this threshold (0-100) */
    autoApproveThreshold: number;
    /** Maximum wait time before auto-proceeding (ms) */
    timeoutMs: number;
}

/** Default gate configurations */
export const DEFAULT_GATE_CONFIG: Record<GateStage, GateConfig> = {
    blueprint: {
        enabled: false, // Blueprint approval is optional in automated mode
        autoApproveThreshold: 70,
        timeoutMs: 5 * 60 * 1000, // 5 minutes
    },
    findings: {
        enabled: true,
        autoApproveThreshold: 80,
        timeoutMs: 10 * 60 * 1000, // 10 minutes
    },
    synthesis: {
        enabled: true,
        autoApproveThreshold: 85,
        timeoutMs: 10 * 60 * 1000, // 10 minutes
    },
};

/**
 * HITL Quality Gate System
 * 
 * Three gates in the pipeline:
 * 1. Blueprint Gate — after THINK, before CONSTRUCT (optional)
 * 2. Findings Gate — after DEPLOY, before SYNTHESIZE
 * 3. Synthesis Gate — after SYNTHESIZE, before COMPLETE
 * 
 * Each gate can:
 * - Auto-approve if quality score exceeds threshold
 * - Wait for human decision (with timeout)
 * - Allow per-finding actions (approve, reject, modify, flag)
 */
export class QualityGateSystem {
    private config: Record<GateStage, GateConfig>;
    private decisions: Map<string, GateDecision[]> = new Map();
    private pendingGates: Map<string, {
        stage: GateStage;
        resolve: (decision: GateDecision) => void;
        timeout: ReturnType<typeof setTimeout>;
    }> = new Map();

    constructor(config?: Partial<Record<GateStage, Partial<GateConfig>>>) {
        this.config = { ...DEFAULT_GATE_CONFIG };
        if (config) {
            for (const [stage, overrides] of Object.entries(config)) {
                this.config[stage as GateStage] = {
                    ...this.config[stage as GateStage],
                    ...overrides,
                };
            }
        }
    }

    /**
     * Evaluate whether a gate should auto-approve or wait for human input.
     */
    async evaluateGate(
        runId: string,
        stage: GateStage,
        qualityScore: number,
        onEvent?: (event: PipelineEvent) => void,
    ): Promise<GateDecision> {
        const gateConfig = this.config[stage];

        // Gate disabled — auto-approve immediately
        if (!gateConfig.enabled) {
            return this.recordDecision(runId, {
                stage,
                action: "approve",
                decidedBy: "system",
                decidedAt: new Date().toISOString(),
                reason: "Gate disabled in configuration",
                autoApproved: true,
            });
        }

        // Quality score exceeds threshold — auto-approve
        if (qualityScore >= gateConfig.autoApproveThreshold) {
            return this.recordDecision(runId, {
                stage,
                action: "approve",
                decidedBy: "system",
                decidedAt: new Date().toISOString(),
                reason: `Quality score ${qualityScore} exceeds threshold ${gateConfig.autoApproveThreshold}`,
                autoApproved: true,
            });
        }

        // Below threshold — wait for human or timeout
        return new Promise<GateDecision>((resolve) => {
            const timeout = setTimeout(() => {
                const decision = this.recordDecision(runId, {
                    stage,
                    action: "approve",
                    decidedBy: "system (timeout)",
                    decidedAt: new Date().toISOString(),
                    reason: `Gate timed out after ${gateConfig.timeoutMs}ms — auto-proceeding with warnings`,
                    autoApproved: true,
                });
                this.pendingGates.delete(`${runId}:${stage}`);
                resolve(decision);
            }, gateConfig.timeoutMs);

            this.pendingGates.set(`${runId}:${stage}`, { stage, resolve, timeout });
        });
    }

    /**
     * Submit a human decision for a pending gate.
     */
    submitDecision(runId: string, stage: GateStage, decision: Omit<GateDecision, "stage" | "autoApproved">): GateDecision {
        const key = `${runId}:${stage}`;
        const pending = this.pendingGates.get(key);

        const fullDecision: GateDecision = {
            ...decision,
            stage,
            autoApproved: false,
        };

        this.recordDecision(runId, fullDecision);

        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(fullDecision);
            this.pendingGates.delete(key);
        }

        return fullDecision;
    }

    /**
     * Get all decisions for a run.
     */
    getDecisions(runId: string): GateDecision[] {
        return this.decisions.get(runId) ?? [];
    }

    private recordDecision(runId: string, decision: GateDecision): GateDecision {
        const existing = this.decisions.get(runId) ?? [];
        existing.push(decision);
        this.decisions.set(runId, existing);
        return decision;
    }
}


// ═══════════════════════════════════════════════════════════════
// 3. OUTPUT QUALITY SCORING RUBRIC
// ═══════════════════════════════════════════════════════════════

/** Individual rubric dimension score */
export interface RubricDimension {
    name: string;
    description: string;
    score: number; // 0-100
    weight: number; // 0-1
    details: string;
}

/** Complete output quality report */
export interface QualityScoreReport {
    overallScore: number; // 0-100 weighted average
    grade: "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D" | "F";
    dimensions: RubricDimension[];
    passesQualityGate: boolean;
    recommendations: string[];
}

/**
 * Score the final intelligence output against a structured quality rubric.
 * 
 * 7 dimensions, each weighted by importance:
 * 1. Source Coverage (20%) — % of findings with verifiable sources
 * 2. Provenance Completeness (15%) — % of provenance chains fully intact
 * 3. Emergence Yield (15%) — qualified emergent insights per 3 agents
 * 4. Confidence Calibration (15%) — distribution aligns with evidence strength
 * 5. Gap Acknowledgement (10%) — explicit gaps identified (shows intellectual honesty)
 * 6. Conflict Resolution (10%) — tensions identified and resolved/preserved
 * 7. Dimensionality (15%) — coverage of blueprint dimensions by findings
 */
export function scoreOutput(
    manifest: IntelligenceManifest,
    provenanceReport: ProvenanceReport,
    memoryBus?: MemoryBus,
): QualityScoreReport {
    const dimensions: RubricDimension[] = [];

    // 1. Source Coverage (20%)
    const totalFindings = manifest.qualityReport.totalFindings;
    const sourcedFindings = provenanceReport.verifiableSources;
    const sourceCoverage = totalFindings > 0 ? (sourcedFindings / totalFindings) * 100 : 0;
    dimensions.push({
        name: "Source Coverage",
        description: "Percentage of findings with independently verifiable sources",
        score: Math.min(100, sourceCoverage),
        weight: 0.20,
        details: `${sourcedFindings}/${totalFindings} findings have verifiable sources (${Math.round(sourceCoverage)}%)`,
    });

    // 2. Provenance Completeness (15%)
    dimensions.push({
        name: "Provenance Completeness",
        description: "Percentage of provenance chains fully intact (claim → evidence → source)",
        score: provenanceReport.chainCompleteness,
        weight: 0.15,
        details: `${provenanceReport.completeChains}/${provenanceReport.totalClaims} chains complete (${provenanceReport.chainCompleteness}%)`,
    });

    // 3. Emergence Yield (15%)
    const qualifiedEmergences = manifest.synthesis.emergentInsights.filter(e => {
        const scores = [e.qualityScores.novelty, e.qualityScores.grounding, e.qualityScores.actionability, e.qualityScores.depth, e.qualityScores.surprise];
        return scores.filter(s => s >= 4).length >= 3;
    }).length;
    const agentCount = manifest.agentResults.length;
    const expectedEmergence = agentCount / 3;
    const emergenceYield = expectedEmergence > 0 ? Math.min(100, (qualifiedEmergences / expectedEmergence) * 100) : 0;
    dimensions.push({
        name: "Emergence Yield",
        description: "Qualified emergent insights relative to agent count (target: 1 per 3 agents)",
        score: emergenceYield,
        weight: 0.15,
        details: `${qualifiedEmergences} qualified emergences from ${agentCount} agents (yield: ${Math.round(emergenceYield)}%)`,
    });

    // 4. Confidence Calibration (15%)
    const confDist = manifest.qualityReport.confidenceDistribution;
    const totalConf = confDist.high + confDist.medium + confDist.low;
    let calibrationScore = 50; // default
    if (totalConf > 0) {
        const highPct = confDist.high / totalConf;
        const medPct = confDist.medium / totalConf;
        const lowPct = confDist.low / totalConf;
        // Well-calibrated: not all HIGH (overconfident) and not all LOW (underconfident)
        // Ideal: ~30% HIGH, ~50% MEDIUM, ~20% LOW
        const overconfidencePenalty = highPct > 0.7 ? (highPct - 0.7) * 200 : 0;
        const underconfidencePenalty = lowPct > 0.5 ? (lowPct - 0.5) * 200 : 0;
        const hasMixture = highPct > 0 && medPct > 0 ? 20 : 0;
        calibrationScore = Math.max(0, Math.min(100, 80 + hasMixture - overconfidencePenalty - underconfidencePenalty));
    }
    dimensions.push({
        name: "Confidence Calibration",
        description: "Distribution of confidence levels suggests honest self-assessment",
        score: calibrationScore,
        weight: 0.15,
        details: `Distribution: HIGH=${confDist.high}, MEDIUM=${confDist.medium}, LOW=${confDist.low}`,
    });

    // 5. Gap Acknowledgement (10%)
    const totalGaps = manifest.qualityReport.gapCount;
    const gapScore = totalGaps > 0 ? Math.min(100, totalGaps * 25) : 10; // Penalize NO gaps (suspiciously complete)
    dimensions.push({
        name: "Gap Acknowledgement",
        description: "Explicit gaps identified shows intellectual honesty",
        score: gapScore,
        weight: 0.10,
        details: `${totalGaps} gaps acknowledged — ${totalGaps === 0 ? "SUSPICIOUS: no gaps in any dimension" : "shows appropriate epistemic humility"}`,
    });

    // 6. Conflict Resolution (10%)
    const tensionCount = manifest.synthesis.tensionPoints.length;
    const resolvedTensions = manifest.synthesis.tensionPoints.filter(t => t.resolution && t.resolution.length > 0).length;
    const preservedTensions = 0; // tensionPoints don't have preservedAsComplexity in the new schema
    let conflictScore = 50;
    if (tensionCount > 0) {
        const handledPct = (resolvedTensions + preservedTensions) / tensionCount;
        conflictScore = Math.round(handledPct * 100);
    } else if (agentCount > 4) {
        // No tensions with >4 agents is suspicious
        conflictScore = 30;
    }

    // If memoryBus is available, enrich with actual bus conflict data
    let conflictDetails = `${tensionCount} tensions: ${resolvedTensions} resolved, ${preservedTensions} preserved as complexity`;
    if (memoryBus) {
        const busStatus = memoryBus.getStatus();
        const totalBusConflicts = busStatus.openConflicts + busStatus.resolvedConflicts;
        const busConflictScore = totalBusConflicts > 0
            ? Math.round((busStatus.resolvedConflicts / totalBusConflicts) * 100)
            : 100;
        // Blend the synthesis-based score with the bus-based score:
        // bus data is the ground truth, so weight it more heavily
        conflictScore = totalBusConflicts > 0
            ? Math.round(conflictScore * 0.3 + busConflictScore * 0.7)
            : conflictScore;
        conflictDetails += ` | bus conflicts: ${busStatus.resolvedConflicts} resolved, ${busStatus.openConflicts} open`;
    }

    dimensions.push({
        name: "Conflict Resolution",
        description: "Tensions between agents identified and handled",
        score: conflictScore,
        weight: 0.10,
        details: conflictDetails,
    });

    // 7. Dimensionality (15%)
    const blueprintDimensions = manifest.blueprint.dimensions.length;
    const coveredDimensions = new Set(
        manifest.agentResults
            .filter(r => r.findings.length > 0)
            .map(r => r.dimension)
    ).size;
    const dimensionality = blueprintDimensions > 0 ? (coveredDimensions / blueprintDimensions) * 100 : 0;
    dimensions.push({
        name: "Dimensionality",
        description: "Coverage of blueprint dimensions by actual findings",
        score: dimensionality,
        weight: 0.15,
        details: `${coveredDimensions}/${blueprintDimensions} dimensions produced findings (${Math.round(dimensionality)}%)`,
    });

    // Calculate weighted overall score
    const overallScore = Math.round(
        dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
    );

    // Grade assignment
    const grade = overallScore >= 95 ? "A" :
        overallScore >= 90 ? "A-" :
            overallScore >= 85 ? "B+" :
                overallScore >= 80 ? "B" :
                    overallScore >= 75 ? "B-" :
                        overallScore >= 70 ? "C+" :
                            overallScore >= 60 ? "C" :
                                overallScore >= 50 ? "D" : "F";

    // Build recommendations
    const recommendations: string[] = [];
    for (const dim of dimensions) {
        if (dim.score < 60) {
            recommendations.push(`⚠️ ${dim.name} is weak (${Math.round(dim.score)}%): ${dim.details}`);
        }
    }
    if (overallScore < 70) {
        recommendations.push("Consider re-running with more targeted query or additional agents");
    }

    return {
        overallScore,
        grade,
        dimensions,
        passesQualityGate: overallScore >= 60,
        recommendations,
    };
}


// ═══════════════════════════════════════════════════════════════
// 4. QUALITY WARNING AGGREGATOR
// ═══════════════════════════════════════════════════════════════

export type WarningSeverity = "critical" | "major" | "minor" | "info";
export type WarningCategory =
    | "source_quality"
    | "provenance"
    | "confidence"
    | "emergence"
    | "conflict"
    | "coverage"
    | "hallucination_risk"
    | "gate_decision";

export interface QualityWarning {
    id: string;
    severity: WarningSeverity;
    category: WarningCategory;
    message: string;
    affectedItems?: string[];
    recommendation?: string;
}

/**
 * Aggregate and classify all quality signals from the pipeline.
 * 
 * Collects warnings from:
 * - Provenance chain analysis
 * - Critic review
 * - Quality scoring rubric
 * - HITL gate decisions
 * - Source verification
 */
export function aggregateWarnings(
    provenanceReport: ProvenanceReport,
    qualityScore: QualityScoreReport,
    gateDecisions: GateDecision[],
    criticIssues?: Array<{ severity: string; description: string; recommendation: string }>,
): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    let warnId = 0;

    // ─── Provenance warnings ─────────────────────────

    if (provenanceReport.unverifiableSources > 0) {
        const severity: WarningSeverity = provenanceReport.unverifiableSources > provenanceReport.totalClaims * 0.3
            ? "critical" : "major";
        warnings.push({
            id: `warn-${++warnId}`,
            severity,
            category: "source_quality",
            message: `${provenanceReport.unverifiableSources} of ${provenanceReport.totalClaims} findings lack verifiable sources`,
            affectedItems: provenanceReport.links
                .filter(l => !l.sourceVerifiable)
                .map(l => l.findingStatement.substring(0, 80)),
            recommendation: "Review flagged findings for potential hallucination or add source citations",
        });
    }

    if (provenanceReport.chainCompleteness < 70) {
        warnings.push({
            id: `warn-${++warnId}`,
            severity: "major",
            category: "provenance",
            message: `Provenance chain completeness is ${provenanceReport.chainCompleteness}% (target: >80%)`,
            recommendation: "Strengthen evidence chains by ensuring agents provide detailed sources and reasoning",
        });
    }

    // Self-referential evidence
    const circularLinks = provenanceReport.links.filter(
        l => l.chainGaps.some(g => g.includes("circular"))
    );
    if (circularLinks.length > 0) {
        warnings.push({
            id: `warn-${++warnId}`,
            severity: "major",
            category: "hallucination_risk",
            message: `${circularLinks.length} finding(s) may have circular/self-referential evidence`,
            affectedItems: circularLinks.map(l => l.findingStatement.substring(0, 80)),
            recommendation: "These findings may reflect model reasoning rather than external evidence — verify independently",
        });
    }

    // ─── Quality score warnings ──────────────────────

    for (const dim of qualityScore.dimensions) {
        if (dim.score < 40) {
            warnings.push({
                id: `warn-${++warnId}`,
                severity: "critical",
                category: dim.name.toLowerCase().includes("source") ? "source_quality" :
                    dim.name.toLowerCase().includes("provenance") ? "provenance" :
                        dim.name.toLowerCase().includes("emergence") ? "emergence" :
                            dim.name.toLowerCase().includes("conflict") ? "conflict" : "coverage",
                message: `${dim.name} scored ${Math.round(dim.score)}% — critically below standard`,
                recommendation: dim.details,
            });
        }
    }

    if (!qualityScore.passesQualityGate) {
        warnings.push({
            id: `warn-${++warnId}`,
            severity: "critical",
            category: "coverage",
            message: `Overall quality score ${qualityScore.overallScore}% (${qualityScore.grade}) fails quality gate (minimum: 60%)`,
            recommendation: "Consider re-running the analysis with a refined query or additional agents",
        });
    }

    // ─── Critic issue warnings ───────────────────────

    if (criticIssues) {
        for (const issue of criticIssues) {
            warnings.push({
                id: `warn-${++warnId}`,
                severity: issue.severity === "critical" ? "critical" : issue.severity === "major" ? "major" : "minor",
                category: "source_quality",
                message: `Critic: ${issue.description}`,
                recommendation: issue.recommendation,
            });
        }
    }

    // ─── Gate decision warnings ──────────────────────

    for (const decision of gateDecisions) {
        if (decision.action === "flag" || decision.action === "reject") {
            warnings.push({
                id: `warn-${++warnId}`,
                severity: decision.action === "reject" ? "critical" : "major",
                category: "gate_decision",
                message: `${decision.stage} gate: ${decision.action} by ${decision.decidedBy}`,
                recommendation: decision.reason ?? undefined,
            });
        }
        if (decision.autoApproved && decision.reason?.includes("timeout")) {
            warnings.push({
                id: `warn-${++warnId}`,
                severity: "minor",
                category: "gate_decision",
                message: `${decision.stage} gate auto-approved on timeout — no human review`,
            });
        }
    }

    // Sort by severity
    const severityOrder: Record<WarningSeverity, number> = {
        critical: 0, major: 1, minor: 2, info: 3,
    };
    warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return warnings;
}


// ═══════════════════════════════════════════════════════════════
// 5. QUALITY ASSURANCE PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════

/** Complete QA report attached to the intelligence manifest */
export interface QualityAssuranceReport {
    provenance: ProvenanceReport;
    score: QualityScoreReport;
    warnings: QualityWarning[];
    gateDecisions: GateDecision[];
    passesAllGates: boolean;
    timestamp: string;
}

/**
 * Run the complete quality assurance pipeline.
 * 
 * Called between SYNTHESIZE and COMPLETE in the executor.
 * Returns a full QA report that gets attached to the IntelligenceManifest.
 */
export async function runQualityAssurance(
    manifest: IntelligenceManifest,
    agentResults: AgentDeployResult[],
    blueprint: Blueprint,
    gateSystem: QualityGateSystem,
    criticIssues?: Array<{ severity: string; description: string; recommendation: string }>,
    onEvent?: (event: PipelineEvent) => void,
    memoryBus?: MemoryBus,
): Promise<QualityAssuranceReport> {

    // 1. Build provenance chain (enriched with blackboard data if memoryBus available)
    const provenance = buildProvenanceChain(agentResults, blueprint, memoryBus);

    // 2. Score the output (enriched with bus conflict data if memoryBus available)
    const score = scoreOutput(manifest, provenance, memoryBus);

    // 3. Evaluate synthesis gate
    const synthGateDecision = await gateSystem.evaluateGate(
        manifest.metadata.runId,
        "synthesis",
        score.overallScore,
        onEvent,
    );

    // 4. Aggregate all warnings
    const gateDecisions = gateSystem.getDecisions(manifest.metadata.runId);
    const warnings = aggregateWarnings(provenance, score, gateDecisions, criticIssues);

    // 5. Emit quality events
    for (const warning of warnings.filter(w => w.severity === "critical")) {
        onEvent?.({
            type: "critic_review",
            issue: warning.message,
            severity: warning.severity,
        });
    }

    return {
        provenance,
        score,
        warnings,
        gateDecisions,
        passesAllGates: gateDecisions.every(d => d.action === "approve"),
        timestamp: new Date().toISOString(),
    };
}

// ─── Singleton Gate System ──────────────────────────────────

let _gateSystem: QualityGateSystem | null = null;

export function getQualityGateSystem(): QualityGateSystem {
    if (!_gateSystem) {
        _gateSystem = new QualityGateSystem();
    }
    return _gateSystem;
}

/**
 * Unit tests for PRISM Pipeline Zod schemas (src/lib/pipeline/types.ts)
 *
 * Tests validate:
 * - Enum schemas accept valid values and reject invalid ones
 * - Object schemas enforce required fields, constraints, and defaults
 * - Blueprint constraints (min 2 dimensions, min 2 agents)
 * - ComplexityScore range constraints (breadth/depth/interconnection 1-5, urgency 0.8-1.5)
 * - AgentFinding required field enforcement
 * - All major pipeline result schemas (AgentResult, SynthesisResult, PresentationResult, QualityReport)
 */

import { describe, it, expect } from "vitest";
import {
  // Enums
  SwarmTierEnum,
  ConfidenceLevelEnum,
  SourceTierEnum,
  EvidenceTypeEnum,
  FindingActionEnum,
  AutonomyModeEnum,
  ConflictTypeEnum,
  NudgeTypeEnum,
  // Object schemas
  ComplexityScoreSchema,
  DimensionAnalysisSchema,
  AgentRecommendationSchema,
  InterconnectionSchema,
  AgentFindingSchema,
  BlueprintSchema,
  AgentResultSchema,
  SynthesisResultSchema,
  SynthesisLayerSchema,
  EmergentInsightSchema,
  EmergenceQualitySchema,
  TensionPointSchema,
  TensionSideSchema,
  PresentationResultSchema,
  QualityReportSchema,
  ConstructedAgentSchema,
  VerifiedClaimSchema,
  FindingModificationSchema,
} from "@/lib/pipeline/types";

// ─── Shared test fixtures (healthcare domain) ──────────────────

function makeDimension(overrides: Record<string, unknown> = {}) {
  return {
    name: "Regulatory Landscape",
    description: "FDA approval pathways and compliance requirements for GLP-1 receptor agonists",
    justification: "Critical for market entry timing and competitive positioning",
    dataSources: ["FDA.gov", "ClinicalTrials.gov", "EMA regulatory filings"],
    lens: "regulatory",
    signalMatch: "high",
    ...overrides,
  };
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    name: "Regulatory Analyst",
    archetype: "ANALYST-RISK",
    dimension: "Regulatory Landscape",
    mandate: "Analyze FDA approval timelines and regulatory hurdles for GLP-1 agonists",
    tools: ["web_search", "document_analysis"],
    lens: "risk-assessment",
    bias: "conservative",
    ...overrides,
  };
}

function makeInterconnection(overrides: Record<string, unknown> = {}) {
  return {
    dimensionA: "Regulatory Landscape",
    dimensionB: "Market Dynamics",
    coupling: 4,
    mechanism: "FDA approval timing directly impacts market entry and competitive positioning",
    ...overrides,
  };
}

function makeComplexityScore(overrides: Record<string, unknown> = {}) {
  return {
    breadth: 3,
    depth: 4,
    interconnection: 3,
    total: 10,
    urgency: 1.0,
    adjusted: 10,
    reasoning: "Multi-dimensional healthcare analysis requiring cross-domain synthesis",
    ...overrides,
  };
}

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    statement: "FDA fast-track designation granted for semaglutide in NASH indication",
    evidence: "FDA press release dated 2024-03-15 confirming breakthrough therapy designation",
    confidence: "HIGH" as const,
    sourceTier: "PRIMARY" as const,
    evidenceType: "direct" as const,
    source: "FDA.gov/breakthrough-therapy-designations",
    implication: "Accelerated approval pathway reduces time-to-market by 12-18 months",
    tags: ["FDA", "fast-track", "semaglutide", "NASH"],
    ...overrides,
  };
}

function makeAgentResult(overrides: Record<string, unknown> = {}) {
  return {
    agentName: "Regulatory Analyst",
    archetype: "ANALYST-RISK",
    dimension: "Regulatory Landscape",
    findings: [makeFinding()],
    gaps: ["No data on EU regulatory timeline"],
    signals: ["Increased FDA engagement with GLP-1 manufacturers"],
    minorityViews: [],
    toolsUsed: ["web_search"],
    tokensUsed: 4500,
    ...overrides,
  };
}

function makeBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    query: "Analyze the competitive landscape for GLP-1 receptor agonists in obesity treatment",
    dimensions: [
      makeDimension(),
      makeDimension({ name: "Market Dynamics", description: "Competitive analysis of GLP-1 market" }),
    ],
    agents: [
      makeAgent(),
      makeAgent({ name: "Market Analyst", archetype: "ANALYST-STRATEGIC", dimension: "Market Dynamics" }),
    ],
    interconnections: [makeInterconnection()],
    complexityScore: makeComplexityScore(),
    tier: "STANDARD" as const,
    estimatedTime: "15 minutes",
    ethicalConcerns: ["Patient data privacy in clinical trial analysis"],
    ...overrides,
  };
}

// ─── Enum Tests ──────────────────────────────────────────────

describe("Enum schemas", () => {
  describe("SwarmTierEnum", () => {
    it.each(["MICRO", "STANDARD", "EXTENDED", "MEGA", "CAMPAIGN"])("accepts valid tier: %s", (tier) => {
      expect(SwarmTierEnum.parse(tier)).toBe(tier);
    });

    it("rejects invalid tier value", () => {
      expect(() => SwarmTierEnum.parse("INVALID")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => SwarmTierEnum.parse("")).toThrow();
    });

    it("rejects lowercase variant", () => {
      expect(() => SwarmTierEnum.parse("micro")).toThrow();
    });
  });

  describe("ConfidenceLevelEnum", () => {
    it.each(["HIGH", "MEDIUM", "LOW"])("accepts valid level: %s", (level) => {
      expect(ConfidenceLevelEnum.parse(level)).toBe(level);
    });

    it("rejects invalid confidence level", () => {
      expect(() => ConfidenceLevelEnum.parse("VERY_HIGH")).toThrow();
    });
  });

  describe("SourceTierEnum", () => {
    it.each(["PRIMARY", "SECONDARY", "TERTIARY"])("accepts valid source tier: %s", (tier) => {
      expect(SourceTierEnum.parse(tier)).toBe(tier);
    });

    it("rejects invalid source tier", () => {
      expect(() => SourceTierEnum.parse("QUATERNARY")).toThrow();
    });
  });

  describe("EvidenceTypeEnum", () => {
    it.each(["direct", "inferred", "analogical", "modeled"])("accepts valid evidence type: %s", (type) => {
      expect(EvidenceTypeEnum.parse(type)).toBe(type);
    });

    it("rejects uppercase variant", () => {
      expect(() => EvidenceTypeEnum.parse("DIRECT")).toThrow();
    });

    it("rejects invalid evidence type", () => {
      expect(() => EvidenceTypeEnum.parse("speculative")).toThrow();
    });
  });

  describe("FindingActionEnum", () => {
    it.each(["keep", "dismiss", "boost", "flag"])("accepts valid action: %s", (action) => {
      expect(FindingActionEnum.parse(action)).toBe(action);
    });

    it("rejects invalid action", () => {
      expect(() => FindingActionEnum.parse("delete")).toThrow();
    });
  });

  describe("AutonomyModeEnum", () => {
    it.each(["supervised", "guided", "autonomous"])("accepts valid mode: %s", (mode) => {
      expect(AutonomyModeEnum.parse(mode)).toBe(mode);
    });

    it("rejects invalid autonomy mode", () => {
      expect(() => AutonomyModeEnum.parse("manual")).toThrow();
    });
  });

  describe("ConflictTypeEnum", () => {
    it.each(["factual", "interpretive", "methodological", "predictive", "values_based", "scope"])(
      "accepts valid conflict type: %s",
      (type) => {
        expect(ConflictTypeEnum.parse(type)).toBe(type);
      },
    );

    it("rejects invalid conflict type", () => {
      expect(() => ConflictTypeEnum.parse("personal")).toThrow();
    });
  });

  describe("NudgeTypeEnum", () => {
    it.each(["CORRECT", "DEEPEN", "EXTEND", "MODEL", "TARGET"])("accepts valid nudge type: %s", (type) => {
      expect(NudgeTypeEnum.parse(type)).toBe(type);
    });

    it("rejects invalid nudge type", () => {
      expect(() => NudgeTypeEnum.parse("IGNORE")).toThrow();
    });
  });
});

// ─── ComplexityScoreSchema Tests ─────────────────────────────

describe("ComplexityScoreSchema", () => {
  it("accepts a valid complexity score", () => {
    const score = makeComplexityScore();
    const result = ComplexityScoreSchema.parse(score);
    expect(result.breadth).toBe(3);
    expect(result.depth).toBe(4);
    expect(result.interconnection).toBe(3);
    expect(result.total).toBe(10);
    expect(result.urgency).toBe(1.0);
    expect(result.adjusted).toBe(10);
  });

  it("applies default urgency of 1.0 when omitted", () => {
    const { urgency, ...withoutUrgency } = makeComplexityScore();
    const result = ComplexityScoreSchema.parse(withoutUrgency);
    expect(result.urgency).toBe(1.0);
  });

  it("rejects breadth below 1", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ breadth: 0 }))).toThrow();
  });

  it("rejects breadth above 5", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ breadth: 6 }))).toThrow();
  });

  it("rejects depth below 1", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ depth: 0 }))).toThrow();
  });

  it("rejects depth above 5", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ depth: 6 }))).toThrow();
  });

  it("rejects interconnection below 1", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ interconnection: 0 }))).toThrow();
  });

  it("rejects interconnection above 5", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ interconnection: 6 }))).toThrow();
  });

  it("rejects urgency below 0.8", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ urgency: 0.5 }))).toThrow();
  });

  it("rejects urgency above 1.5", () => {
    expect(() => ComplexityScoreSchema.parse(makeComplexityScore({ urgency: 2.0 }))).toThrow();
  });

  it("accepts boundary values (all min)", () => {
    const result = ComplexityScoreSchema.parse(
      makeComplexityScore({ breadth: 1, depth: 1, interconnection: 1, urgency: 0.8 }),
    );
    expect(result.breadth).toBe(1);
    expect(result.urgency).toBe(0.8);
  });

  it("accepts boundary values (all max)", () => {
    const result = ComplexityScoreSchema.parse(
      makeComplexityScore({ breadth: 5, depth: 5, interconnection: 5, urgency: 1.5 }),
    );
    expect(result.breadth).toBe(5);
    expect(result.urgency).toBe(1.5);
  });

  it("rejects missing reasoning field", () => {
    const { reasoning, ...withoutReasoning } = makeComplexityScore();
    expect(() => ComplexityScoreSchema.parse(withoutReasoning)).toThrow();
  });
});

// ─── DimensionAnalysisSchema Tests ───────────────────────────

describe("DimensionAnalysisSchema", () => {
  it("accepts a valid dimension", () => {
    const result = DimensionAnalysisSchema.parse(makeDimension());
    expect(result.name).toBe("Regulatory Landscape");
    expect(result.dataSources).toHaveLength(3);
  });

  it("rejects missing required field (name)", () => {
    const { name, ...without } = makeDimension();
    expect(() => DimensionAnalysisSchema.parse(without)).toThrow();
  });

  it("rejects missing dataSources", () => {
    const { dataSources, ...without } = makeDimension();
    expect(() => DimensionAnalysisSchema.parse(without)).toThrow();
  });

  it("accepts empty dataSources array", () => {
    const result = DimensionAnalysisSchema.parse(makeDimension({ dataSources: [] }));
    expect(result.dataSources).toHaveLength(0);
  });
});

// ─── InterconnectionSchema Tests ─────────────────────────────

describe("InterconnectionSchema", () => {
  it("accepts a valid interconnection", () => {
    const result = InterconnectionSchema.parse(makeInterconnection());
    expect(result.coupling).toBe(4);
  });

  it("rejects coupling below 1", () => {
    expect(() => InterconnectionSchema.parse(makeInterconnection({ coupling: 0 }))).toThrow();
  });

  it("rejects coupling above 5", () => {
    expect(() => InterconnectionSchema.parse(makeInterconnection({ coupling: 6 }))).toThrow();
  });

  it("accepts coupling at boundary values (1 and 5)", () => {
    expect(InterconnectionSchema.parse(makeInterconnection({ coupling: 1 })).coupling).toBe(1);
    expect(InterconnectionSchema.parse(makeInterconnection({ coupling: 5 })).coupling).toBe(5);
  });
});

// ─── AgentFindingSchema Tests ────────────────────────────────

describe("AgentFindingSchema", () => {
  it("accepts a valid finding with healthcare domain data", () => {
    const result = AgentFindingSchema.parse(makeFinding());
    expect(result.statement).toContain("semaglutide");
    expect(result.confidence).toBe("HIGH");
    expect(result.sourceTier).toBe("PRIMARY");
    expect(result.evidenceType).toBe("direct");
    expect(result.tags).toHaveLength(4);
  });

  it("rejects missing statement", () => {
    const { statement, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing evidence", () => {
    const { evidence, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing confidence", () => {
    const { confidence, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing sourceTier", () => {
    const { sourceTier, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing evidenceType", () => {
    const { evidenceType, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing source", () => {
    const { source, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing implication", () => {
    const { implication, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects missing tags", () => {
    const { tags, ...without } = makeFinding();
    expect(() => AgentFindingSchema.parse(without)).toThrow();
  });

  it("rejects invalid confidence value in finding", () => {
    expect(() => AgentFindingSchema.parse(makeFinding({ confidence: "VERY_HIGH" }))).toThrow();
  });

  it("rejects invalid sourceTier value in finding", () => {
    expect(() => AgentFindingSchema.parse(makeFinding({ sourceTier: "UNKNOWN" }))).toThrow();
  });

  it("rejects invalid evidenceType value in finding", () => {
    expect(() => AgentFindingSchema.parse(makeFinding({ evidenceType: "speculative" }))).toThrow();
  });

  it("accepts empty tags array", () => {
    const result = AgentFindingSchema.parse(makeFinding({ tags: [] }));
    expect(result.tags).toHaveLength(0);
  });
});

// ─── BlueprintSchema Tests ───────────────────────────────────

describe("BlueprintSchema", () => {
  it("accepts a valid minimal blueprint (2 dimensions, 2 agents)", () => {
    const result = BlueprintSchema.parse(makeBlueprint());
    expect(result.query).toContain("GLP-1");
    expect(result.dimensions).toHaveLength(2);
    expect(result.agents).toHaveLength(2);
    expect(result.tier).toBe("STANDARD");
  });

  it("rejects blueprint with fewer than 2 dimensions", () => {
    expect(() =>
      BlueprintSchema.parse(makeBlueprint({ dimensions: [makeDimension()] })),
    ).toThrow();
  });

  it("rejects blueprint with 0 dimensions", () => {
    expect(() => BlueprintSchema.parse(makeBlueprint({ dimensions: [] }))).toThrow();
  });

  it("rejects blueprint with fewer than 2 agents", () => {
    expect(() =>
      BlueprintSchema.parse(makeBlueprint({ agents: [makeAgent()] })),
    ).toThrow();
  });

  it("rejects blueprint with 0 agents", () => {
    expect(() => BlueprintSchema.parse(makeBlueprint({ agents: [] }))).toThrow();
  });

  it("accepts blueprint with maximum dimensions (15)", () => {
    const dims = Array.from({ length: 15 }, (_, i) => makeDimension({ name: `Dim-${i}` }));
    const result = BlueprintSchema.parse(makeBlueprint({ dimensions: dims }));
    expect(result.dimensions).toHaveLength(15);
  });

  it("rejects blueprint with more than 15 dimensions", () => {
    const dims = Array.from({ length: 16 }, (_, i) => makeDimension({ name: `Dim-${i}` }));
    expect(() => BlueprintSchema.parse(makeBlueprint({ dimensions: dims }))).toThrow();
  });

  it("accepts blueprint with maximum agents (15)", () => {
    const agents = Array.from({ length: 15 }, (_, i) => makeAgent({ name: `Agent-${i}` }));
    const result = BlueprintSchema.parse(makeBlueprint({ agents }));
    expect(result.agents).toHaveLength(15);
  });

  it("rejects blueprint with more than 15 agents", () => {
    const agents = Array.from({ length: 16 }, (_, i) => makeAgent({ name: `Agent-${i}` }));
    expect(() => BlueprintSchema.parse(makeBlueprint({ agents }))).toThrow();
  });

  it("rejects blueprint with invalid tier", () => {
    expect(() => BlueprintSchema.parse(makeBlueprint({ tier: "HUGE" }))).toThrow();
  });

  it("accepts empty interconnections array", () => {
    const result = BlueprintSchema.parse(makeBlueprint({ interconnections: [] }));
    expect(result.interconnections).toHaveLength(0);
  });

  it("accepts empty ethicalConcerns array", () => {
    const result = BlueprintSchema.parse(makeBlueprint({ ethicalConcerns: [] }));
    expect(result.ethicalConcerns).toHaveLength(0);
  });

  it("rejects missing query", () => {
    const { query, ...without } = makeBlueprint();
    expect(() => BlueprintSchema.parse(without)).toThrow();
  });
});

// ─── AgentResultSchema Tests ─────────────────────────────────

describe("AgentResultSchema", () => {
  it("accepts a valid agent result", () => {
    const result = AgentResultSchema.parse(makeAgentResult());
    expect(result.agentName).toBe("Regulatory Analyst");
    expect(result.findings).toHaveLength(1);
    expect(result.tokensUsed).toBe(4500);
  });

  it("applies default empty array for minorityViews when omitted", () => {
    const { minorityViews, ...without } = makeAgentResult();
    const result = AgentResultSchema.parse(without);
    expect(result.minorityViews).toEqual([]);
  });

  it("accepts agent result with multiple findings", () => {
    const result = AgentResultSchema.parse(
      makeAgentResult({
        findings: [
          makeFinding(),
          makeFinding({ statement: "Competitor filing detected", confidence: "MEDIUM" }),
          makeFinding({ statement: "Patent expiry in 2029", sourceTier: "SECONDARY", evidenceType: "inferred" }),
        ],
      }),
    );
    expect(result.findings).toHaveLength(3);
  });

  it("accepts agent result with empty findings", () => {
    const result = AgentResultSchema.parse(makeAgentResult({ findings: [] }));
    expect(result.findings).toHaveLength(0);
  });

  it("rejects missing agentName", () => {
    const { agentName, ...without } = makeAgentResult();
    expect(() => AgentResultSchema.parse(without)).toThrow();
  });

  it("rejects missing tokensUsed", () => {
    const { tokensUsed, ...without } = makeAgentResult();
    expect(() => AgentResultSchema.parse(without)).toThrow();
  });

  it("rejects invalid finding nested inside agent result", () => {
    expect(() =>
      AgentResultSchema.parse(
        makeAgentResult({
          findings: [{ statement: "incomplete finding" }],
        }),
      ),
    ).toThrow();
  });
});

// ─── ConstructedAgentSchema Tests ────────────────────────────

describe("ConstructedAgentSchema", () => {
  it("accepts a valid constructed agent", () => {
    const agent = {
      name: "Regulatory Analyst",
      archetype: "ANALYST-RISK",
      dimension: "Regulatory Landscape",
      mandate: "Analyze FDA approval pathways",
      systemPrompt: "You are a regulatory analysis agent specializing in FDA processes.",
      researchPrompt: "Research current FDA fast-track designations for GLP-1 agonists.",
      tools: ["web_search", "document_analysis"],
      skills: ["regulatory_analysis", "timeline_estimation"],
      color: "#FF6B35",
      neutralFramingApplied: true,
    };
    const result = ConstructedAgentSchema.parse(agent);
    expect(result.name).toBe("Regulatory Analyst");
    expect(result.neutralFramingApplied).toBe(true);
  });

  it("rejects missing systemPrompt", () => {
    const agent = {
      name: "Test",
      archetype: "ANALYST-RISK",
      dimension: "Test",
      mandate: "Test",
      researchPrompt: "Test",
      tools: [],
      skills: [],
      color: "#000",
      neutralFramingApplied: false,
    };
    expect(() => ConstructedAgentSchema.parse(agent)).toThrow();
  });
});

// ─── SynthesisResultSchema Tests ─────────────────────────────

describe("SynthesisResultSchema", () => {
  function makeSynthesisResult(overrides: Record<string, unknown> = {}) {
    return {
      layers: [
        {
          name: "foundation" as const,
          insights: ["GLP-1 agonists show strong efficacy in obesity treatment"],
          description: "Core findings from all agent analyses",
        },
        {
          name: "convergence" as const,
          insights: ["Multiple agents confirm regulatory tailwinds"],
          description: "Points of agreement across agents",
        },
      ],
      emergentInsights: [
        {
          insight: "Combination therapy approach may unlock new market segments",
          algorithm: "cross_agent_theme_mining" as const,
          supportingAgents: ["Regulatory Analyst", "Market Analyst"],
          evidenceSources: ["FDA.gov", "PubMed"],
          qualityScores: {
            novelty: 4,
            grounding: 3,
            actionability: 5,
            depth: 3,
            surprise: 4,
          },
          whyMultiAgent: "Neither agent alone would have identified the regulatory-market convergence",
        },
      ],
      tensionPoints: [
        {
          tension: "Speed vs. safety in accelerated approval pathways",
          sideA: {
            position: "Fast-track designations enable faster patient access",
            agents: ["Regulatory Analyst"],
            evidence: ["FDA breakthrough therapy data"],
          },
          sideB: {
            position: "Accelerated timelines may miss long-term safety signals",
            agents: ["Risk Analyst"],
            evidence: ["Post-market surveillance reports"],
          },
          conflictType: "values_based" as const,
          resolution: "Phased rollout with mandatory post-market studies",
        },
      ],
      overallConfidence: "HIGH" as const,
      criticRevisions: ["Strengthened evidence chain for combination therapy insight"],
      ...overrides,
    };
  }

  it("accepts a valid synthesis result", () => {
    const result = SynthesisResultSchema.parse(makeSynthesisResult());
    expect(result.layers).toHaveLength(2);
    expect(result.emergentInsights).toHaveLength(1);
    expect(result.tensionPoints).toHaveLength(1);
    expect(result.overallConfidence).toBe("HIGH");
  });

  it("accepts synthesis with empty arrays", () => {
    const result = SynthesisResultSchema.parse(
      makeSynthesisResult({
        layers: [],
        emergentInsights: [],
        tensionPoints: [],
        criticRevisions: [],
      }),
    );
    expect(result.layers).toHaveLength(0);
  });

  it("rejects invalid overallConfidence", () => {
    expect(() =>
      SynthesisResultSchema.parse(makeSynthesisResult({ overallConfidence: "VERY_HIGH" })),
    ).toThrow();
  });

  it("rejects missing overallConfidence", () => {
    const { overallConfidence, ...without } = makeSynthesisResult();
    expect(() => SynthesisResultSchema.parse(without)).toThrow();
  });
});

// ─── SynthesisLayerSchema Tests ──────────────────────────────

describe("SynthesisLayerSchema", () => {
  it.each(["foundation", "convergence", "tension", "emergence", "gap"] as const)(
    "accepts valid layer name: %s",
    (name) => {
      const result = SynthesisLayerSchema.parse({
        name,
        insights: ["Test insight"],
        description: "Test description",
      });
      expect(result.name).toBe(name);
    },
  );

  it("rejects invalid layer name", () => {
    expect(() =>
      SynthesisLayerSchema.parse({
        name: "invalid_layer",
        insights: [],
        description: "Test",
      }),
    ).toThrow();
  });
});

// ─── EmergenceQualitySchema Tests ────────────────────────────

describe("EmergenceQualitySchema", () => {
  it("accepts valid quality scores", () => {
    const result = EmergenceQualitySchema.parse({
      novelty: 4,
      grounding: 3,
      actionability: 5,
      depth: 3,
      surprise: 4,
    });
    expect(result.novelty).toBe(4);
  });

  it("accepts boundary min values (all 1)", () => {
    const result = EmergenceQualitySchema.parse({
      novelty: 1,
      grounding: 1,
      actionability: 1,
      depth: 1,
      surprise: 1,
    });
    expect(result.novelty).toBe(1);
  });

  it("accepts boundary max values (all 5)", () => {
    const result = EmergenceQualitySchema.parse({
      novelty: 5,
      grounding: 5,
      actionability: 5,
      depth: 5,
      surprise: 5,
    });
    expect(result.surprise).toBe(5);
  });

  it("rejects novelty above 5", () => {
    expect(() =>
      EmergenceQualitySchema.parse({
        novelty: 6,
        grounding: 3,
        actionability: 3,
        depth: 3,
        surprise: 3,
      }),
    ).toThrow();
  });

  it("rejects grounding below 1", () => {
    expect(() =>
      EmergenceQualitySchema.parse({
        novelty: 3,
        grounding: 0,
        actionability: 3,
        depth: 3,
        surprise: 3,
      }),
    ).toThrow();
  });
});

// ─── EmergentInsightSchema Tests ─────────────────────────────

describe("EmergentInsightSchema", () => {
  it.each([
    "cross_agent_theme_mining",
    "tension_point_mapping",
    "gap_triangulation",
    "structural_pattern_recognition",
  ] as const)("accepts valid algorithm: %s", (algorithm) => {
    const result = EmergentInsightSchema.parse({
      insight: "Test insight",
      algorithm,
      supportingAgents: ["Agent A"],
      evidenceSources: ["Source 1"],
      qualityScores: { novelty: 3, grounding: 3, actionability: 3, depth: 3, surprise: 3 },
      whyMultiAgent: "Required multiple perspectives",
    });
    expect(result.algorithm).toBe(algorithm);
  });

  it("rejects invalid algorithm", () => {
    expect(() =>
      EmergentInsightSchema.parse({
        insight: "Test",
        algorithm: "invalid_algorithm",
        supportingAgents: [],
        evidenceSources: [],
        qualityScores: { novelty: 3, grounding: 3, actionability: 3, depth: 3, surprise: 3 },
        whyMultiAgent: "Test",
      }),
    ).toThrow();
  });
});

// ─── TensionPointSchema Tests ────────────────────────────────

describe("TensionPointSchema", () => {
  it("accepts a valid tension point", () => {
    const result = TensionPointSchema.parse({
      tension: "Cost vs. access",
      sideA: { position: "High prices", agents: ["A1"], evidence: ["E1"] },
      sideB: { position: "R&D recovery", agents: ["A2"], evidence: ["E2"] },
      conflictType: "factual",
      resolution: "Tiered pricing model",
    });
    expect(result.conflictType).toBe("factual");
  });

  it("rejects invalid conflictType", () => {
    expect(() =>
      TensionPointSchema.parse({
        tension: "Test",
        sideA: { position: "A", agents: [], evidence: [] },
        sideB: { position: "B", agents: [], evidence: [] },
        conflictType: "personal",
        resolution: "None",
      }),
    ).toThrow();
  });
});

// ─── PresentationResultSchema Tests ──────────────────────────

describe("PresentationResultSchema", () => {
  it("accepts a valid presentation result", () => {
    const result = PresentationResultSchema.parse({
      html: "<div class='presentation'><h1>GLP-1 Competitive Landscape</h1></div>",
      title: "GLP-1 Receptor Agonist Competitive Analysis",
      subtitle: "Obesity Treatment Market Intelligence Report",
      slideCount: 12,
    });
    expect(result.title).toContain("GLP-1");
    expect(result.slideCount).toBe(12);
  });

  it("rejects missing html", () => {
    expect(() =>
      PresentationResultSchema.parse({
        title: "Test",
        subtitle: "Test",
        slideCount: 5,
      }),
    ).toThrow();
  });

  it("rejects missing title", () => {
    expect(() =>
      PresentationResultSchema.parse({
        html: "<div></div>",
        subtitle: "Test",
        slideCount: 5,
      }),
    ).toThrow();
  });

  it("rejects missing slideCount", () => {
    expect(() =>
      PresentationResultSchema.parse({
        html: "<div></div>",
        title: "Test",
        subtitle: "Test",
      }),
    ).toThrow();
  });
});

// ─── QualityReportSchema Tests ───────────────────────────────

describe("QualityReportSchema", () => {
  function makeQualityReport(overrides: Record<string, unknown> = {}) {
    return {
      totalFindings: 24,
      sourcedFindings: 20,
      sourceCoveragePercent: 83.3,
      confidenceDistribution: { high: 10, medium: 8, low: 6 },
      sourceTierDistribution: { primary: 12, secondary: 6, tertiary: 6 },
      emergenceYield: 3,
      gapCount: 4,
      provenanceComplete: true,
      ...overrides,
    };
  }

  it("accepts a valid minimal quality report (required fields only)", () => {
    const result = QualityReportSchema.parse(makeQualityReport());
    expect(result.totalFindings).toBe(24);
    expect(result.sourceCoveragePercent).toBe(83.3);
    expect(result.provenanceComplete).toBe(true);
    expect(result.confidenceDistribution.high).toBe(10);
    expect(result.sourceTierDistribution.primary).toBe(12);
  });

  it("accepts quality report with all optional extended QA fields", () => {
    const result = QualityReportSchema.parse(
      makeQualityReport({
        grade: "A",
        overallScore: 92,
        provenanceCompleteness: 95,
        warningCount: 2,
        criticalWarnings: ["Missing source for claim #7"],
        dimensions: [
          { name: "accuracy", score: 95, details: "High factual accuracy across findings" },
          { name: "completeness", score: 88, details: "Some gaps in EU regulatory data" },
        ],
      }),
    );
    expect(result.grade).toBe("A");
    expect(result.overallScore).toBe(92);
    expect(result.criticalWarnings).toHaveLength(1);
    expect(result.dimensions).toHaveLength(2);
  });

  it("accepts quality report without optional fields", () => {
    const result = QualityReportSchema.parse(makeQualityReport());
    expect(result.grade).toBeUndefined();
    expect(result.overallScore).toBeUndefined();
    expect(result.provenanceCompleteness).toBeUndefined();
    expect(result.warningCount).toBeUndefined();
    expect(result.criticalWarnings).toBeUndefined();
    expect(result.dimensions).toBeUndefined();
  });

  it("rejects missing totalFindings", () => {
    const { totalFindings, ...without } = makeQualityReport();
    expect(() => QualityReportSchema.parse(without)).toThrow();
  });

  it("rejects missing confidenceDistribution", () => {
    const { confidenceDistribution, ...without } = makeQualityReport();
    expect(() => QualityReportSchema.parse(without)).toThrow();
  });

  it("rejects missing sourceTierDistribution", () => {
    const { sourceTierDistribution, ...without } = makeQualityReport();
    expect(() => QualityReportSchema.parse(without)).toThrow();
  });

  it("rejects malformed confidenceDistribution (missing field)", () => {
    expect(() =>
      QualityReportSchema.parse(
        makeQualityReport({
          confidenceDistribution: { high: 10, medium: 8 },
        }),
      ),
    ).toThrow();
  });

  it("rejects malformed sourceTierDistribution (missing field)", () => {
    expect(() =>
      QualityReportSchema.parse(
        makeQualityReport({
          sourceTierDistribution: { primary: 12, secondary: 6 },
        }),
      ),
    ).toThrow();
  });

  it("rejects missing provenanceComplete", () => {
    const { provenanceComplete, ...without } = makeQualityReport();
    expect(() => QualityReportSchema.parse(without)).toThrow();
  });
});

// ─── VerifiedClaimSchema Tests ───────────────────────────────

describe("VerifiedClaimSchema", () => {
  it("accepts a valid verified claim", () => {
    const result = VerifiedClaimSchema.parse({
      claim: "Semaglutide received FDA breakthrough designation for NASH",
      sourceTier: "PRIMARY",
      verified: true,
    });
    expect(result.verified).toBe(true);
    expect(result.correction).toBeUndefined();
  });

  it("accepts verified claim with optional correction", () => {
    const result = VerifiedClaimSchema.parse({
      claim: "Approval date was Q1 2024",
      sourceTier: "SECONDARY",
      verified: false,
      correction: "Approval date was Q2 2024, not Q1",
    });
    expect(result.verified).toBe(false);
    expect(result.correction).toContain("Q2 2024");
  });

  it("rejects missing claim", () => {
    expect(() =>
      VerifiedClaimSchema.parse({ sourceTier: "PRIMARY", verified: true }),
    ).toThrow();
  });

  it("rejects invalid sourceTier", () => {
    expect(() =>
      VerifiedClaimSchema.parse({ claim: "Test", sourceTier: "UNKNOWN", verified: true }),
    ).toThrow();
  });
});

// ─── FindingModificationSchema Tests ─────────────────────────

describe("FindingModificationSchema", () => {
  it("accepts a valid finding modification", () => {
    const result = FindingModificationSchema.parse({
      findingIndex: 0,
      agentName: "Regulatory Analyst",
      action: "boost",
      reason: "Strong primary source evidence",
    });
    expect(result.action).toBe("boost");
  });

  it("accepts finding modification without optional reason", () => {
    const result = FindingModificationSchema.parse({
      findingIndex: 3,
      agentName: "Market Analyst",
      action: "dismiss",
    });
    expect(result.reason).toBeUndefined();
  });

  it("rejects invalid action", () => {
    expect(() =>
      FindingModificationSchema.parse({
        findingIndex: 0,
        agentName: "Test",
        action: "delete",
      }),
    ).toThrow();
  });

  it("rejects missing findingIndex", () => {
    expect(() =>
      FindingModificationSchema.parse({
        agentName: "Test",
        action: "keep",
      }),
    ).toThrow();
  });
});

// ─── AgentRecommendationSchema Tests ─────────────────────────

describe("AgentRecommendationSchema", () => {
  it("accepts a valid agent recommendation", () => {
    const result = AgentRecommendationSchema.parse(makeAgent());
    expect(result.name).toBe("Regulatory Analyst");
    expect(result.tools).toHaveLength(2);
  });

  it("rejects missing mandate", () => {
    const { mandate, ...without } = makeAgent();
    expect(() => AgentRecommendationSchema.parse(without)).toThrow();
  });

  it("accepts empty tools array", () => {
    const result = AgentRecommendationSchema.parse(makeAgent({ tools: [] }));
    expect(result.tools).toHaveLength(0);
  });
});

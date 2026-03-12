import { describe, it, expect } from "vitest";
import { enrichAfterDeploy, enrichAfterSynthesize, enrichAfterQA, finalizeIRMetadata } from "../ir-enricher";
import { createEmptyIRGraph } from "../ir-types";
import type { IRGraph } from "../ir-types";
import type { AgentResult, SynthesisResult } from "../types";
import type { MemoryBusState } from "../memory-bus";

function makeAgentResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    agentName: "market-analyst",
    archetype: "ANALYST-FINANCIAL",
    dimension: "Market Dynamics",
    findings: [
      {
        statement: "Market is $5B TAM",
        evidence: "Industry report 2025",
        confidence: "HIGH",
        sourceTier: "PRIMARY",
        evidenceType: "direct",
        source: "https://example.com/report",
        implication: "Large addressable market",
        tags: ["market", "tam"],
      },
    ],
    gaps: ["No APAC data"],
    signals: ["Found regulatory concern"],
    minorityViews: [],
    toolsUsed: ["web_search", "financial_data"],
    tokensUsed: 15000,
    ...overrides,
  };
}

function makeBusState(): MemoryBusState {
  return {
    version: 1,
    created: new Date().toISOString(),
    task: "test",
    blackboard: [
      {
        id: "bb-1",
        agent: "market-analyst",
        timestamp: new Date().toISOString(),
        key: "market-dynamics/direct",
        value: "Market is $5B TAM",
        confidence: 0.9,
        evidenceType: "direct",
        tags: ["market dynamics", "high"],
        references: ["https://example.com/report"],
      },
    ],
    signals: [
      {
        id: "sig-1",
        from: "market-analyst",
        to: "all",
        type: "discovery",
        priority: "medium",
        timestamp: new Date().toISOString(),
        message: "Found regulatory concern",
      },
    ],
    conflicts: [],
  };
}

describe("IR Enricher — DEPLOY phase", () => {
  it("populates findings from agent results", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    const agents = [makeAgentResult()];
    const busState = makeBusState();

    enrichAfterDeploy(graph, agents, busState, "STANDARD");

    expect(graph.findings).toHaveLength(1);
    expect(graph.findings[0].agent).toBe("market-analyst");
    expect(graph.findings[0].agentArchetype).toBe("ANALYST-FINANCIAL");
    expect(graph.findings[0].dimension).toBe("Market Dynamics");
    expect(graph.findings[0].confidence).toBe(0.9);
    expect(graph.findings[0].findingIndex).toBe(0);
    expect(graph.findings[0].actionabilityScore).toBeGreaterThanOrEqual(1);
    expect(graph.findings[0].actionabilityScore).toBeLessThanOrEqual(5);
    expect(graph.findings[0].noveltyScore).toBeGreaterThanOrEqual(1);
    expect(graph.findings[0].noveltyScore).toBeLessThanOrEqual(5);
  });

  it("populates relationships from bus signals", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    enrichAfterDeploy(graph, [makeAgentResult()], makeBusState(), "STANDARD");

    expect(graph.relationships.length).toBeGreaterThanOrEqual(1);
    const rel = graph.relationships[0];
    expect(rel.from).toBe("market-analyst");
    expect(rel.type).toBe("discovery");
  });

  it("populates agents from agent results", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    enrichAfterDeploy(graph, [makeAgentResult()], makeBusState(), "STANDARD");

    expect(graph.agents).toHaveLength(1);
    expect(graph.agents[0].name).toBe("market-analyst");
    expect(graph.agents[0].archetype).toBe("ANALYST-FINANCIAL");
    expect(graph.agents[0].findingCount).toBe(1);
    expect(graph.agents[0].gapCount).toBe(1);
    expect(graph.agents[0].signalCount).toBe(1);
    expect(graph.agents[0].toolsUsed).toEqual(["web_search", "financial_data"]);
    expect(graph.agents[0].tokensUsed).toBe(15000);
  });

  it("populates sources from finding references", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    enrichAfterDeploy(graph, [makeAgentResult()], makeBusState(), "STANDARD");

    expect(graph.sources.length).toBeGreaterThanOrEqual(1);
    expect(graph.sources[0].url).toBe("https://example.com/report");
  });

  it("sets metadata tier and agent manifest", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    enrichAfterDeploy(graph, [makeAgentResult()], makeBusState(), "STANDARD");

    expect(graph.metadata.investigationTier).toBe("FOCUSED");
    expect(graph.metadata.agentManifest).toContain("market-analyst");
  });

  it("assigns sequential findingIndex across multiple agents", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    const agent1 = makeAgentResult({ agentName: "agent-a" });
    const agent2 = makeAgentResult({ agentName: "agent-b" });
    const busState = makeBusState();
    busState.blackboard.push({
      ...busState.blackboard[0],
      id: "bb-2",
      agent: "agent-b",
    });

    enrichAfterDeploy(graph, [agent1, agent2], busState, "STANDARD");

    expect(graph.findings[0].findingIndex).toBe(0);
    expect(graph.findings[1].findingIndex).toBe(1);
  });
});

function makeSynthesisResult(): SynthesisResult {
  return {
    layers: [
      { name: "foundation", insights: ["Insight 1"], description: "Foundation layer" },
      { name: "convergence", insights: ["Convergence 1"], description: "Convergence layer" },
      { name: "tension", insights: ["Tension 1"], description: "Tension layer" },
      { name: "emergence", insights: ["Emergence 1"], description: "Emergence layer" },
      { name: "gap", insights: ["Gap 1: Missing APAC data"], description: "Gap layer" },
    ],
    emergentInsights: [
      {
        insight: "Cross-sector convergence in health data",
        algorithm: "cross_agent_theme_mining",
        supportingAgents: ["market-analyst", "regulatory-specialist"],
        evidenceSources: ["source-a", "source-b"],
        qualityScores: { novelty: 4, grounding: 3, actionability: 5, depth: 3, surprise: 4 },
        whyMultiAgent: "Required both market and regulatory perspectives",
      },
    ],
    tensionPoints: [
      {
        tension: "Market growth vs regulatory headwinds",
        sideA: { position: "Growth", agents: ["market-analyst"], evidence: ["Data shows growth"] },
        sideB: { position: "Headwinds", agents: ["regulatory-specialist"], evidence: ["New regulations"] },
        conflictType: "interpretive",
        resolution: "Growth with regulatory risk premium",
      },
    ],
    overallConfidence: "HIGH",
    criticRevisions: [],
  };
}

describe("IR Enricher — SYNTHESIZE phase", () => {
  it("populates emergences from synthesis emergent insights", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    // Pre-populate with a finding to test constituentFindingIds matching
    graph.findings.push({
      id: "f-1",
      agent: "market-analyst",
      agentArchetype: "ANALYST-FINANCIAL",
      dimension: "Market",
      key: "market/direct",
      value: "Market is $5B",
      confidence: 0.9,
      evidenceType: "direct",
      tags: [],
      references: [],
      timestamp: new Date().toISOString(),
      findingIndex: 0,
      actionabilityScore: 3,
      noveltyScore: 4,
    });

    const synthesis = makeSynthesisResult();
    enrichAfterSynthesize(graph, synthesis, [makeAgentResult()]);

    expect(graph.emergences).toHaveLength(1);
    expect(graph.emergences[0].insight).toBe("Cross-sector convergence in health data");
    expect(graph.emergences[0].algorithm).toBe("cross_agent_theme_mining");
    expect(graph.emergences[0].supportingAgents).toContain("market-analyst");
  });

  it("populates gaps from gap layer insights and agent-reported gaps", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    const synthesis = makeSynthesisResult();
    const agents = [makeAgentResult()];

    enrichAfterSynthesize(graph, synthesis, agents);

    // At least 1 from gap layer + 1 from agent.gaps
    expect(graph.gaps.length).toBeGreaterThanOrEqual(2);
    const synthGap = graph.gaps.find(g => g.source === "synthesis_layer");
    const agentGap = graph.gaps.find(g => g.source === "agent_reported");
    expect(synthGap).toBeDefined();
    expect(agentGap).toBeDefined();
    expect(agentGap!.sourceAgent).toBe("market-analyst");
  });

  it("enriches tensions with conflictType from tension points", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    // Add a pre-existing tension (from DEPLOY enrichment)
    graph.tensions.push({
      id: "t-1",
      registeredBy: "market-analyst",
      timestamp: new Date().toISOString(),
      status: "open",
      claim: "Market growth vs regulatory headwinds",
      positions: [],
      resolution: null,
    });

    const synthesis = makeSynthesisResult();
    enrichAfterSynthesize(graph, synthesis, [makeAgentResult()]);

    // Should have enriched the existing tension
    const enriched = graph.tensions.find(t => t.id === "t-1");
    expect(enriched?.conflictType).toBe("interpretive");
  });

  it("sets pyramidLayersApplied in metadata", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    const synthesis = makeSynthesisResult();

    enrichAfterSynthesize(graph, synthesis, [makeAgentResult()]);

    expect(graph.metadata.pyramidLayersApplied).toEqual([
      "foundation", "convergence", "tension", "emergence", "gap",
    ]);
    expect(graph.metadata.synthesisMode).toBe("full_pyramid");
  });
});

describe("IR Enricher — QA phase", () => {
  it("populates quality from QA report", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    const qaReport = {
      score: {
        overallScore: 82,
        grade: "B+",
        dimensions: [
          { name: "Source Quality", score: 85, weight: 0.3, details: "Good" },
        ],
      },
      provenance: {
        chainCompleteness: 75,
        links: [
          {
            claim: "Market is $5B",
            findingStatement: "Market is $5B",
            agentName: "market-analyst",
            source: "report",
            sourceVerifiable: true,
            chainComplete: true,
            chainGaps: [],
          },
        ],
      },
      warnings: [
        { severity: "minor" as const, category: "coverage", message: "Low APAC coverage" },
      ],
      passesAllGates: true,
    };

    enrichAfterQA(graph, qaReport);

    expect(graph.quality).toBeDefined();
    expect(graph.quality!.overallScore).toBe(82);
    expect(graph.quality!.grade).toBe("B+");
    expect(graph.quality!.passesQualityGate).toBe(true);
    expect(graph.quality!.warnings).toHaveLength(1);
  });

  it("populates provenance from QA report", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    graph.findings.push({
      id: "f-1",
      agent: "market-analyst",
      agentArchetype: "ANALYST-FINANCIAL",
      dimension: "Market",
      key: "market/direct",
      value: "Market is $5B",
      confidence: 0.9,
      evidenceType: "direct",
      tags: [],
      references: [],
      timestamp: new Date().toISOString(),
      findingIndex: 0,
      actionabilityScore: 3,
      noveltyScore: 4,
    });

    const qaReport = {
      score: { overallScore: 80, grade: "B", dimensions: [] },
      provenance: {
        chainCompleteness: 90,
        links: [
          {
            claim: "Market is $5B",
            findingStatement: "Market is $5B",
            agentName: "market-analyst",
            source: "report",
            sourceVerifiable: true,
            chainComplete: true,
            chainGaps: [],
          },
        ],
      },
      warnings: [],
      passesAllGates: true,
    };

    enrichAfterQA(graph, qaReport);

    expect(graph.provenance).toBeDefined();
    expect(graph.provenance!.chainCompleteness).toBe(90);
    expect(graph.provenance!.links).toHaveLength(1);
  });
});

describe("IR Enricher — finalize", () => {
  it("sets final metadata timestamp and quality grade", () => {
    const graph = createEmptyIRGraph("run-1", "test");
    graph.quality = {
      overallScore: 85,
      grade: "B+",
      passesQualityGate: true,
      dimensions: [],
      warnings: [],
      recommendations: [],
    };

    finalizeIRMetadata(graph);

    expect(graph.metadata.qualityGrade).toBe("B+");
    expect(graph.metadata.overallScore).toBe(85);
    expect(graph.metadata.timestamp).toBeDefined();
  });
});

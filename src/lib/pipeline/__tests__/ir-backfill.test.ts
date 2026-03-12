import { describe, it, expect } from "vitest";
import { MemoryBus } from "../memory-bus";
import { enrichAfterDeploy, enrichAfterSynthesize, enrichAfterQA, finalizeIRMetadata } from "../ir-enricher";
import { validateIRGraph } from "../ir-validator";
import type { AgentResult, SynthesisResult } from "../types";

describe("IR Backfill Integration", () => {
  it("builds a complete IR graph through all enrichment phases", () => {
    // Setup
    const bus = new MemoryBus("What is the competitive landscape for AI in healthcare?");
    bus.initIR("backfill-run-1");

    // Simulate DEPLOY: populate bus + create agent results
    const agentResults: AgentResult[] = [
      {
        agentName: "market-analyst",
        archetype: "ANALYST-FINANCIAL",
        dimension: "Market Dynamics",
        findings: [
          {
            statement: "AI healthcare market valued at $15B in 2025",
            evidence: "Grand View Research report",
            confidence: "HIGH",
            sourceTier: "PRIMARY",
            evidenceType: "direct",
            source: "https://grandviewresearch.com/ai-health",
            implication: "Large and growing market",
            tags: ["market", "tam", "growth"],
          },
          {
            statement: "NLP segment growing at 25% CAGR",
            evidence: "McKinsey analysis",
            confidence: "MEDIUM",
            sourceTier: "SECONDARY",
            evidenceType: "inferred",
            source: "https://mckinsey.com/nlp",
            implication: "NLP is a high-growth subsegment",
            tags: ["nlp", "growth"],
          },
        ],
        gaps: ["No Latin America market data"],
        signals: ["Regulatory landscape shifting rapidly"],
        minorityViews: [],
        toolsUsed: ["web_search", "financial_data"],
        tokensUsed: 18000,
      },
      {
        agentName: "regulatory-specialist",
        archetype: "RESEARCHER-DOMAIN",
        dimension: "Regulatory Landscape",
        findings: [
          {
            statement: "FDA AI/ML framework finalized in 2025",
            evidence: "FDA.gov announcement",
            confidence: "HIGH",
            sourceTier: "PRIMARY",
            evidenceType: "direct",
            source: "https://fda.gov/ai-ml",
            implication: "Clear regulatory pathway now exists",
            tags: ["regulatory", "fda", "framework"],
          },
        ],
        gaps: ["EU AI Act enforcement timeline unclear"],
        signals: [],
        minorityViews: [],
        toolsUsed: ["web_search"],
        tokensUsed: 12000,
      },
    ];

    // Populate bus as deploy.ts would
    for (const ar of agentResults) {
      for (const f of ar.findings) {
        const conf = f.confidence === "HIGH" ? 0.9 : f.confidence === "MEDIUM" ? 0.6 : 0.3;
        bus.writeToBlackboard({
          agent: ar.agentName,
          key: `${ar.dimension.toLowerCase().replace(/\s+/g, "-")}/${f.evidenceType}`,
          value: f.statement,
          confidence: conf,
          evidenceType: f.evidenceType === "direct" ? "direct" : f.evidenceType === "inferred" ? "inferred" : "analogical",
          tags: [ar.dimension.toLowerCase(), f.confidence.toLowerCase()],
          references: [f.source],
        });
      }
      for (const signal of ar.signals) {
        bus.sendSignal({
          from: ar.agentName,
          to: "all",
          type: "discovery",
          priority: "medium",
          message: signal,
        });
      }
    }

    // DEPLOY enrichment
    const graph = bus.getIRGraph()!;
    enrichAfterDeploy(graph, agentResults, bus.getState(), "EXTENDED");

    expect(graph.findings).toHaveLength(3); // 3 blackboard entries
    expect(graph.agents).toHaveLength(2);
    expect(graph.sources.length).toBeGreaterThanOrEqual(3);
    expect(graph.metadata.investigationTier).toBe("EXTENDED");

    // Simulate SYNTHESIZE
    const synthesis: SynthesisResult = {
      layers: [
        { name: "foundation", insights: ["AI healthcare is a $15B market with regulatory clarity"], description: "Foundation" },
        { name: "convergence", insights: ["Market growth aligns with regulatory enablement"], description: "Convergence" },
        { name: "tension", insights: ["Growth vs regulatory overhead"], description: "Tension" },
        { name: "emergence", insights: ["Convergence of FDA framework with market opportunity"], description: "Emergence" },
        { name: "gap", insights: ["Missing: LATAM market data", "Missing: EU AI Act timeline"], description: "Gaps" },
      ],
      emergentInsights: [
        {
          insight: "FDA framework clarity creates a 12-18 month first-mover window for AI health companies",
          algorithm: "cross_agent_theme_mining",
          supportingAgents: ["market-analyst", "regulatory-specialist"],
          evidenceSources: ["Grand View", "FDA"],
          qualityScores: { novelty: 5, grounding: 4, actionability: 5, depth: 4, surprise: 4 },
          whyMultiAgent: "Required both market sizing + regulatory analysis to identify the window",
        },
      ],
      tensionPoints: [
        {
          tension: "Market growth rate vs regulatory compliance cost",
          sideA: { position: "Growth outpaces cost", agents: ["market-analyst"], evidence: ["25% CAGR"] },
          sideB: { position: "Compliance burden slows adoption", agents: ["regulatory-specialist"], evidence: ["FDA requirements"] },
          conflictType: "interpretive",
          resolution: "Net positive: compliance costs are front-loaded, growth is sustained",
        },
      ],
      overallConfidence: "HIGH",
      criticRevisions: [],
    };

    enrichAfterSynthesize(graph, synthesis, agentResults);

    expect(graph.emergences).toHaveLength(1);
    expect(graph.gaps.length).toBeGreaterThanOrEqual(4); // 2 synthesis + 2 agent-reported
    expect(graph.metadata.synthesisMode).toBe("full_pyramid");
    expect(graph.metadata.pyramidLayersApplied).toHaveLength(5);

    // Simulate QA
    const qaReport = {
      score: {
        overallScore: 88,
        grade: "B+",
        dimensions: [
          { name: "Source Quality", score: 90, weight: 0.3, details: "Strong primary sources" },
          { name: "Coverage", score: 85, weight: 0.3, details: "Good across dimensions" },
        ],
      },
      provenance: {
        chainCompleteness: 85,
        links: [
          {
            claim: "AI healthcare market valued at $15B",
            findingStatement: "AI healthcare market valued at $15B in 2025",
            agentName: "market-analyst",
            source: "Grand View Research",
            sourceVerifiable: true,
            chainComplete: true,
            chainGaps: [],
          },
        ],
      },
      warnings: [
        { severity: "minor" as const, category: "coverage", message: "Missing LATAM data" },
      ],
      passesAllGates: true,
    };

    enrichAfterQA(graph, qaReport);

    expect(graph.quality).toBeDefined();
    expect(graph.quality!.overallScore).toBe(88);
    expect(graph.provenance).toBeDefined();
    expect(graph.provenance!.chainCompleteness).toBe(85);

    // Finalize
    finalizeIRMetadata(graph);
    expect(graph.metadata.qualityGrade).toBe("B+");
    expect(graph.metadata.overallScore).toBe(88);

    // Validate
    const validation = validateIRGraph(graph);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    // Round-trip
    const serialized = JSON.stringify(graph);
    const deserialized = JSON.parse(serialized);
    const roundTripValidation = validateIRGraph(deserialized);
    expect(roundTripValidation.valid).toBe(true);

    // Verify entity count consistency
    expect(graph.findings.length).toBe(bus.getStatus().entries);
    expect(graph.agents.length).toBe(agentResults.length);
  });
});

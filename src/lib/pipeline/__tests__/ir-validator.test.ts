import { describe, it, expect } from "vitest";
import { validateIRGraph } from "../ir-validator";
import { createEmptyIRGraph } from "../ir-types";
import type { IRGraph } from "../ir-types";

function makePopulatedGraph(): IRGraph {
  const graph = createEmptyIRGraph("run-1", "test");
  graph.metadata.investigationTier = "FOCUSED";
  graph.metadata.agentManifest = ["agent-a"];
  graph.metadata.pyramidLayersApplied = ["foundation", "convergence"];
  graph.metadata.synthesisMode = "convergence";

  graph.findings.push({
    id: "f-1",
    agent: "agent-a",
    agentArchetype: "ANALYST-FINANCIAL",
    dimension: "Market",
    key: "market/direct",
    value: "Finding value",
    confidence: 0.9,
    evidenceType: "direct",
    tags: [],
    references: ["https://example.com"],
    timestamp: new Date().toISOString(),
    findingIndex: 0,
    actionabilityScore: 3,
    noveltyScore: 4,
  });

  graph.agents.push({
    id: "agent-a-id",
    name: "agent-a",
    archetype: "ANALYST-FINANCIAL",
    dimension: "Market",
    findingCount: 1,
    gapCount: 0,
    signalCount: 0,
    toolsUsed: ["web_search"],
    tokensUsed: 10000,
  });

  graph.sources.push({
    id: "src-1",
    title: "Example Source",
    url: "https://example.com",
    sourceTier: "PRIMARY",
    referencedByFindings: ["f-1"],
  });

  return graph;
}

describe("IR Validator", () => {
  it("passes for a valid populated graph", () => {
    const graph = makePopulatedGraph();
    const result = validateIRGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails if metadata.version is missing", () => {
    const graph = makePopulatedGraph();
    (graph.metadata as unknown as Record<string, unknown>).version = undefined;
    const result = validateIRGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("version"))).toBe(true);
  });

  it("fails if metadata.runId is missing", () => {
    const graph = makePopulatedGraph();
    (graph.metadata as unknown as Record<string, unknown>).runId = "";
    const result = validateIRGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("runId"))).toBe(true);
  });

  it("fails for invalid investigationTier", () => {
    const graph = makePopulatedGraph();
    (graph.metadata as unknown as Record<string, unknown>).investigationTier = "INVALID";
    const result = validateIRGraph(graph);
    expect(result.valid).toBe(false);
  });

  it("detects broken emergence → finding references", () => {
    const graph = makePopulatedGraph();
    graph.emergences.push({
      id: "emrg-1",
      insight: "Test emergence",
      algorithm: "cross_agent_theme_mining",
      supportingAgents: ["agent-a"],
      evidenceSources: [],
      constituentFindingIds: ["f-nonexistent"],
      qualityScores: { novelty: 3, grounding: 3, actionability: 3, depth: 3, surprise: 3 },
      whyMultiAgent: "test",
    });

    const result = validateIRGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("f-nonexistent"))).toBe(true);
  });

  it("detects broken source → finding references", () => {
    const graph = makePopulatedGraph();
    graph.sources[0].referencedByFindings = ["f-nonexistent"];

    const result = validateIRGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("f-nonexistent"))).toBe(true);
  });

  it("round-trip: serialize → deserialize → validate", () => {
    const graph = makePopulatedGraph();
    const json = JSON.stringify(graph);
    const restored: IRGraph = JSON.parse(json);
    const result = validateIRGraph(restored);
    expect(result.valid).toBe(true);
  });
});

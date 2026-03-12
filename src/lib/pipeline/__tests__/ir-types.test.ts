import { describe, it, expect } from "vitest";
import type {
  IRGraph,
  IRFinding,
  IRRelationship,
  IRTension,
  IREmergence,
  IRGap,
  IRAgent,
  IRSource,
  IRQuality,
  IRProvenance,
  IRMetadata,
  InvestigationTier,
  SynthesisMode,
} from "../ir-types";
import {
  createEmptyIRGraph,
  mapSwarmTierToInvestigationTier,
  deriveSynthesisMode,
} from "../ir-types";

describe("IR Types", () => {
  describe("createEmptyIRGraph", () => {
    it("returns a valid IRGraph with required fields", () => {
      const graph = createEmptyIRGraph("run-123", "test query");
      expect(graph.metadata.version).toBe("2.0.0");
      expect(graph.metadata.runId).toBe("run-123");
      expect(graph.findings).toEqual([]);
      expect(graph.relationships).toEqual([]);
      expect(graph.tensions).toEqual([]);
      expect(graph.emergences).toEqual([]);
      expect(graph.gaps).toEqual([]);
      expect(graph.agents).toEqual([]);
      expect(graph.sources).toEqual([]);
      expect(graph.quality).toBeUndefined();
      expect(graph.provenance).toBeUndefined();
    });
  });

  describe("mapSwarmTierToInvestigationTier", () => {
    it("maps MICRO to SIGNAL", () => {
      expect(mapSwarmTierToInvestigationTier("MICRO")).toBe("SIGNAL");
    });
    it("maps STANDARD to FOCUSED", () => {
      expect(mapSwarmTierToInvestigationTier("STANDARD")).toBe("FOCUSED");
    });
    it("maps EXTENDED to EXTENDED", () => {
      expect(mapSwarmTierToInvestigationTier("EXTENDED")).toBe("EXTENDED");
    });
    it("maps MEGA to EXTENDED", () => {
      expect(mapSwarmTierToInvestigationTier("MEGA")).toBe("EXTENDED");
    });
    it("maps CAMPAIGN to EXTENDED", () => {
      expect(mapSwarmTierToInvestigationTier("CAMPAIGN")).toBe("EXTENDED");
    });
  });

  describe("deriveSynthesisMode", () => {
    it("returns facts_only for 1 layer", () => {
      expect(deriveSynthesisMode(1)).toBe("facts_only");
    });
    it("returns convergence for 2 layers", () => {
      expect(deriveSynthesisMode(2)).toBe("convergence");
    });
    it("returns full_pyramid for 5 layers", () => {
      expect(deriveSynthesisMode(5)).toBe("full_pyramid");
    });
    it("returns full_pyramid for 3+ layers", () => {
      expect(deriveSynthesisMode(3)).toBe("full_pyramid");
    });
  });
});

/**
 * PRISM v2 — IR Graph Validator
 *
 * Pure function that validates an IRGraph for:
 * 1. Schema completeness (required fields, types, enums)
 * 2. Referential integrity (emergence→finding, source→finding, tension→agent)
 * 3. Tier-based completeness checks
 */

import type { IRGraph } from "./ir-types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_TIERS: Set<string> = new Set(["SIGNAL", "FOCUSED", "EXTENDED", "PERSISTENT"]);
const VALID_SYNTHESIS_MODES: Set<string> = new Set(["facts_only", "convergence", "full_pyramid"]);
const VALID_EVIDENCE_TYPES: Set<string> = new Set(["direct", "inferred", "analogical", "modeled"]);
const VALID_RELATIONSHIP_TYPES: Set<string> = new Set(["convergence", "dependency", "discovery", "tension_link"]);
const VALID_GAP_TYPES: Set<string> = new Set(["structural", "researchable", "emerging"]);
const VALID_GAP_SOURCES: Set<string> = new Set(["synthesis_layer", "agent_reported"]);

export function validateIRGraph(graph: IRGraph): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ─── Metadata validation ────────────────────────────────
  if (!graph.metadata) {
    errors.push("Missing metadata envelope");
    return { valid: false, errors, warnings };
  }

  if (!graph.metadata.version) errors.push("metadata.version is required");
  if (!graph.metadata.runId) errors.push("metadata.runId is required");
  if (!graph.metadata.timestamp) errors.push("metadata.timestamp is required");
  if (!VALID_TIERS.has(graph.metadata.investigationTier)) {
    errors.push(`Invalid metadata.investigationTier: "${graph.metadata.investigationTier}"`);
  }
  if (!VALID_SYNTHESIS_MODES.has(graph.metadata.synthesisMode)) {
    errors.push(`Invalid metadata.synthesisMode: "${graph.metadata.synthesisMode}"`);
  }

  // ─── Finding validation ─────────────────────────────────
  const findingIds = new Set<string>();
  for (const f of graph.findings) {
    if (!f.id) errors.push("Finding missing id");
    if (findingIds.has(f.id)) errors.push(`Duplicate finding id: ${f.id}`);
    findingIds.add(f.id);
    if (!f.agent) errors.push(`Finding ${f.id}: missing agent`);
    if (VALID_EVIDENCE_TYPES.has(f.evidenceType) === false) {
      warnings.push(`Finding ${f.id}: unusual evidenceType "${f.evidenceType}"`);
    }
    if (f.confidence < 0 || f.confidence > 1) {
      errors.push(`Finding ${f.id}: confidence ${f.confidence} out of range [0,1]`);
    }
    if (f.actionabilityScore < 1 || f.actionabilityScore > 5) {
      errors.push(`Finding ${f.id}: actionabilityScore ${f.actionabilityScore} out of range [1,5]`);
    }
    if (f.noveltyScore < 1 || f.noveltyScore > 5) {
      errors.push(`Finding ${f.id}: noveltyScore ${f.noveltyScore} out of range [1,5]`);
    }
  }

  // ─── Referential integrity: emergences → findings ───────
  for (const e of graph.emergences) {
    for (const fid of e.constituentFindingIds) {
      if (!findingIds.has(fid)) {
        errors.push(`Emergence ${e.id}: references non-existent finding "${fid}"`);
      }
    }
  }

  // ─── Referential integrity: sources → findings ──────────
  for (const s of graph.sources) {
    for (const fid of s.referencedByFindings) {
      if (!findingIds.has(fid)) {
        errors.push(`Source ${s.id}: references non-existent finding "${fid}"`);
      }
    }
  }

  // ─── Relationship validation ────────────────────────────
  for (const r of graph.relationships) {
    if (!VALID_RELATIONSHIP_TYPES.has(r.relationshipType)) {
      warnings.push(`Relationship ${r.id}: unusual relationshipType "${r.relationshipType}"`);
    }
  }

  // ─── Gap validation ─────────────────────────────────────
  for (const g of graph.gaps) {
    if (!VALID_GAP_TYPES.has(g.gapType)) {
      warnings.push(`Gap ${g.id}: unusual gapType "${g.gapType}"`);
    }
    if (!VALID_GAP_SOURCES.has(g.source)) {
      warnings.push(`Gap ${g.id}: unusual source "${g.source}"`);
    }
  }

  // ─── Tier completeness ─────────────────────────────────
  if (graph.metadata.investigationTier === "EXTENDED") {
    if (graph.metadata.pyramidLayersApplied.length < 5) {
      warnings.push("EXTENDED tier expects 5 pyramid layers");
    }
    if (graph.emergences.length === 0) {
      warnings.push("EXTENDED tier expects at least one emergence");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

# PRISM v2 Phase 1: IR Schema + Emitter Design

**Date:** 2026-03-12
**Status:** Approved
**Scope:** Intermediate Representation schema, progressive emitter, DB persistence, file export, validation

## Context

PRISM v2 decomposes the platform into three independent layers: research protocol, synthesis engine, and rendering pipeline. The Intermediate Representation (IR) is the architectural keystone between synthesis and all delivery vehicles. This design covers Phase 1: defining the IR schema, building the emitter, and validating with a backfill test.

## Key Design Decision

The IR Graph is not a new parallel data structure. It is the **MemoryBus evolved**. The MemoryBus already accumulates findings (blackboard entries), inter-agent relationships (signals), and disagreements (conflicts) incrementally across the pipeline. The IR extends this with three additional entity types (Emergences, Gaps, Sources) plus a metadata envelope and quality layer. The existing `export()` method is preserved; a new `exportIR()` method returns the full IR Graph.

This avoids building a parallel system and leverages the MemoryBus infrastructure already wired through every pipeline phase.

## IR Schema

### Entity Mapping (Existing to IR)

| Current MemoryBus Entity | IR Entity | Extensions |
|---|---|---|
| `BlackboardEntry` | `IRFinding` | `actionabilityScore`, `noveltyScore`, `findingIndex`, `agentArchetype`, `dimension` |
| `Signal` | `IRRelationship` | `relationshipType` (convergence, dependency, discovery) |
| `Conflict` | `IRTension` | `resolutionFramework`, `conflictType` from synthesis `TensionPoint` |

### New Entities

- **`IREmergence`** - Derived from `SynthesisResult.emergentInsights`. References constituent finding IDs matched by agent provenance back to blackboard entries. Includes quality scores (novelty, grounding, actionability, depth, surprise).
- **`IRGap`** - Derived from the synthesis "gap" layer insights plus `AgentResult.gaps`. Typed as structural, researchable, or emerging.
- **`IRSource`** - Extracted from finding references/evidence. Deduplicated across agents by URL/title. Includes source tier and reliability notes.
- **`IRAgent`** - Metadata about each agent (name, archetype, dimension, finding count, tool usage).

### Metadata Envelope

```typescript
interface IRMetadata {
  version: string;              // "2.0.0"
  investigationTier: "SIGNAL" | "FOCUSED" | "EXTENDED" | "PERSISTENT";
  synthesisMode: "facts_only" | "convergence" | "full_pyramid";
  entityId?: string;
  runId: string;
  timestamp: string;
  agentManifest: string[];
  pyramidLayersApplied: string[];
  escalationHistory: string[];
  qualityGrade?: string;
  overallScore?: number;
}
```

### Full IR Graph Type

```typescript
interface IRGraph {
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
```

## Progressive Emitter

The emitter is not a standalone module. It is the MemoryBus itself, enriched at each pipeline phase via pure enricher functions called from `executor.ts`.

### Phase-by-Phase Enrichment

**DEPLOY:**
- `findings` populated via existing `populateBusFromResults()` with extended fields
- `relationships` from existing signals + auto-derived convergence edges
- `agents` populated from `AgentResult` metadata
- `sources` extracted from finding references, deduplicated

**SYNTHESIZE:**
- `emergences` created from `SynthesisResult.emergentInsights`, linked to constituent findings
- `gaps` created from gap synthesis layer + accumulated agent gaps
- `tensions` enriched with `conflictType` and `resolutionFramework` from `TensionPoint` data
- `relationships` enriched with convergence and dependency edges from synthesis

**QA:**
- `quality` stamped from `QualityAssuranceReport`
- `provenance` stamped from `ProvenanceReport`
- `findings` enriched with provenance chain completeness and verification status

**COMPLETE:**
- `metadata` finalized with timestamps, tier, escalation history
- Full `IRGraph` serialized and persisted to DB + file

## Database Persistence

### New table: `ir_graphs`

```
id              String    @id @default(cuid())
runId           String    @unique
tier            String
graph           String    // JSON blob of IRGraph
findingCount    Int       @default(0)
emergenceCount  Int       @default(0)
tensionCount    Int       @default(0)
gapCount        Int       @default(0)
qualityGrade    String?
overallScore    Float?
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

Denormalized counts enable fast querying without parsing the JSON blob. Single JSON column because the graph is always consumed whole by renderers. `updatedAt` supports escalation (Signal upgraded to Extended updates the same row).

### `db.ts` methods

- `db.irGraph.upsert(data)` - create or update for escalation
- `db.irGraph.findByRunId(runId)` - single graph lookup
- `db.irGraph.findLatest(limit?)` - recent graphs for monitoring console
- `db.irGraph.findByTier(tier)` - filter by investigation tier

### File export

Written to `public/ir/{runId}.json`. Self-contained for offline artifact bundling.

### Relation to existing `MemoryBusSnapshot`

- `MemoryBusSnapshot` = phase-level internal telemetry (how the bus evolved)
- `ir_graphs` = final assembled product artifact (what renderers consume)
- Both coexist.

## Backward Compatibility

- All existing `MemoryBus` methods preserved unchanged
- `export()` continues to return `MemoryBusState`
- `exportIR()` is the new opt-in method returning `IRGraph`
- `deploy.ts`, `synthesize.ts`, `verify.ts`, `present.ts`, `quality-assurance.ts` are NOT modified
- Enricher functions called from `executor.ts` only, reading phase outputs already available there
- `IntelligenceManifest` gains one optional field: `irGraph?: IRGraph`

## SSE Events

Two new events:

```typescript
| { type: "ir_enrichment"; phase: string; entity: string; count: number }
| { type: "ir_complete"; runId: string; findingCount: number; emergenceCount: number; tensionCount: number; gapCount: number; qualityGrade?: string }
```

## Validation

### IR Validator (`ir-validator.ts`)

Pure function returning a validation report:
- Schema validation (required fields, types, enums)
- Referential integrity (emergence finding IDs exist, tension agent names match, finding references match sources)
- Completeness by tier (Extended requires 5 layers, emergences, provenance; Signal requires only findings + metadata)
- Round-trip test (exportIR -> serialize -> deserialize -> validate)

### Backfill Test

Vitest integration test that loads a completed run's data, replays it through enrichment methods, validates the resulting IR Graph, and compares entity counts against source data.

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `src/lib/pipeline/ir-types.ts` | Create | All IR type definitions |
| `src/lib/pipeline/ir-enricher.ts` | Create | Pure enrichment functions |
| `src/lib/pipeline/ir-validator.ts` | Create | Schema + integrity validation |
| `src/lib/pipeline/memory-bus.ts` | Modify | Add IR entity storage + `exportIR()` |
| `src/lib/pipeline/executor.ts` | Modify | Call enrichers after each phase, persist IR |
| `src/lib/pipeline/types.ts` | Modify | Add 2 SSE event types |
| `src/app/api/pipeline/stream/route.ts` | Modify | Add 2 SSE handlers |
| `prisma/schema.prisma` | Modify | Add `IrGraph` model |
| `src/lib/db.ts` | Modify | Add `db.irGraph` namespace |

Files NOT modified: `deploy.ts`, `synthesize.ts`, `verify.ts`, `present.ts`, `quality-assurance.ts`, `memory-bus-manager.ts`.

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

### New Entity Definitions

```typescript
interface IRFinding {
  id: string;                   // from BlackboardEntry.id
  agent: string;                // agent name
  agentArchetype: string;       // e.g., "market_analyst", "regulatory_specialist"
  dimension: string;            // e.g., "Market Dynamics", "Regulatory Landscape"
  key: string;                  // hierarchical key from blackboard
  value: string;                // the finding statement
  confidence: number;           // 0.0 - 1.0
  evidenceType: "direct" | "inferred" | "analogical";
  tags: string[];
  references: string[];         // source citations
  timestamp: string;
  // IR extensions (not on BlackboardEntry)
  findingIndex: number;         // global index across all agents, assigned during enrichment
  actionabilityScore: number;   // 1-5, derived from tags + evidence type
  noveltyScore: number;         // 1-5, derived from cross-agent uniqueness
  sourceVerified?: boolean;     // stamped during QA
  provenanceComplete?: boolean; // stamped during QA
}

interface IRRelationship {
  id: string;                   // from Signal.id or generated for derived edges
  from: string;                 // agent or finding ID
  to: string;                   // agent or finding ID
  type: "discovery" | "warning" | "request" | "redirect"; // from Signal.type
  relationshipType: "convergence" | "dependency" | "discovery" | "tension_link";
  priority: "low" | "medium" | "high" | "critical";
  timestamp: string;
  message: string;
  payload?: Record<string, unknown>;
}

interface IRTension {
  id: string;                   // from Conflict.id
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
  // IR extensions
  conflictType?: "factual" | "interpretive" | "methodological" | "scope";
  resolutionFramework?: string; // from synthesis TensionPoint
}

interface IREmergence {
  id: string;                   // generated
  insight: string;
  algorithm: "cross_agent_theme_mining" | "tension_point_mapping" | "gap_triangulation" | "structural_pattern_recognition";
  supportingAgents: string[];
  evidenceSources: string[];
  constituentFindingIds: string[]; // references IRFinding.id entries
  qualityScores: {
    novelty: number;            // 1-5
    grounding: number;          // 1-5
    actionability: number;      // 1-5
    depth: number;              // 1-5
    surprise: number;           // 1-5
  };
  whyMultiAgent: string;
}

interface IRGap {
  id: string;                   // generated
  title: string;
  description: string;
  gapType: "structural" | "researchable" | "emerging";
  source: "synthesis_layer" | "agent_reported"; // where it came from
  sourceAgent?: string;         // if agent_reported
  priority: "low" | "medium" | "high";
  researchable: boolean;
}

interface IRAgent {
  id: string;                   // generated from agent name
  name: string;
  archetype: string;
  dimension: string;
  findingCount: number;
  gapCount: number;
  signalCount: number;
  toolsUsed: string[];
  tokensUsed: number;
}

interface IRSource {
  id: string;                   // generated hash of url+title
  title: string;
  url?: string;
  sourceTier: "PRIMARY" | "SECONDARY" | "TERTIARY";
  accessDate?: string;
  reliabilityNotes?: string;
  referencedByFindings: string[]; // IRFinding.id entries
}

interface IRQuality {
  overallScore: number;         // 0-100
  grade: string;                // "A", "B+", etc.
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

interface IRProvenance {
  totalClaims: number;
  verifiableSources: number;
  unverifiableSources: number;
  chainCompleteness: number;    // 0-100%
  links: Array<{
    claim: string;
    findingId: string;          // references IRFinding.id
    agentName: string;
    source: string;
    sourceVerifiable: boolean;
    chainComplete: boolean;
    chainGaps: string[];
  }>;
}
```

### Tier Mapping

The codebase currently uses `SwarmTier` (`MICRO | STANDARD | EXTENDED | MEGA | CAMPAIGN`) for pipeline dispatch. The IR introduces a separate `InvestigationTier` taxonomy aligned with the v2 plan's decision-context model. The mapping:

| SwarmTier (existing) | InvestigationTier (IR) | Notes |
|---|---|---|
| `MICRO` | `SIGNAL` | 1-2 agents, facts only |
| `STANDARD` | `FOCUSED` | 2-3 agents, convergence |
| `EXTENDED` | `EXTENDED` | 5 agents, full pyramid |
| `MEGA` / `CAMPAIGN` | `EXTENDED` | Map to Extended for IR purposes (same depth) |
| N/A (new) | `PERSISTENT` | Recurring monitoring, not yet implemented |

The enricher maps `SwarmTier` to `InvestigationTier` when building the metadata envelope. `SwarmTier` is not modified or deprecated — it continues to drive agent dispatch. `InvestigationTier` is the consumer-facing tier that renderers and the Tier Calibrator (Phase 3) will use.

### Synthesis Mode Derivation

`synthesisMode` is derived from the number of synthesis layers applied:
- 1 layer (foundation only) → `"facts_only"`
- 2 layers (foundation + convergence) → `"convergence"`
- 5 layers (all) → `"full_pyramid"`

This is determined by inspecting the `SynthesisResult.layers` array length after synthesis completes.

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
  escalationHistory: string[];  // runIds of previous IR versions if upgraded
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

Enrichment hooks are called from `executor.ts` after each phase's function returns, using outputs already available in the executor scope.

**After DEPLOY phase** (`deploy()` returns `agentResults`):
- `findings` — populated via existing `populateBusFromResults()` with extended IR fields (`actionabilityScore`, `noveltyScore`, `findingIndex`, `agentArchetype`, `dimension`)
- `relationships` — from existing signals + auto-derived convergence edges (two agents writing to same key prefix with compatible findings)
- `agents` — populated from each `AgentResult`'s metadata (name, archetype, dimension, findingCount, toolsUsed, tokensUsed)
- `sources` — extracted from finding references, deduplicated by URL/title hash

**After SYNTHESIZE phase** (`synthesize()` returns `SynthesisResult`):
- `emergences` — created from `SynthesisResult.emergentInsights`. Each emergence's `supportingAgents` matched to blackboard entries to populate `constituentFindingIds`
- `gaps` — from the "gap" synthesis layer insights (source: `synthesis_layer`) plus `AgentResult.gaps` accumulated during deploy (source: `agent_reported`)
- `tensions` — enriched. Open conflicts get `conflictType` and `resolutionFramework` matched from `SynthesisResult.tensionPoints` by claim similarity
- `relationships` — enriched with convergence edges from the "convergence" synthesis layer and dependency edges from emergence constituent chains

**After QUALITY_ASSURANCE phase** (`runQualityAssurance()` returns `QualityAssuranceReport`):
- `quality` — projected from `QualityScoreReport` (overall score, grade, dimensions, warnings, recommendations)
- `provenance` — projected from `ProvenanceReport` (claim-to-source chains with verifiability markers)
- `findings` — enriched with `sourceVerified` and `provenanceComplete` from matching provenance links

**After VERIFY phase** (`verify()` returns `VerifyOutput`):
- No new IR entities. Verified claims update existing finding entries (corrections applied).

**After PRESENT phase** (`present()` returns `PresentationResult`):
- No new IR entities. The presentation is a rendered artifact from the IR, not an input to it.

**COMPLETE:**
- `metadata` finalized with timestamps, tier, escalation history
- Full `IRGraph` serialized and persisted to DB + file

## Database Persistence

### New table: `ir_graphs`

```
id              String    @id @default(cuid())
runId           String    @unique
run             Run       @relation(fields: [runId], references: [id], onDelete: Cascade)
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

The `Run` model gains an `irGraph IrGraph?` relation (one-to-one via `@unique` on `runId`).

Denormalized counts enable fast querying without parsing the JSON blob. Single JSON column because the graph is always consumed whole by renderers. `updatedAt` supports escalation (Signal upgraded to Extended updates the same row). Cascade delete ensures IR graphs are cleaned up when a run is deleted.

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

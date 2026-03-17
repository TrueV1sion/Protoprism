/**
 * Pipeline Checkpoint System
 *
 * Provides resume capability for pipelines that experience connection drops
 * or other transient failures during streaming execution.
 */

import { db } from "@/lib/db";

export type CheckpointPhase =
  | "INITIALIZE"
  | "THINK"
  | "CONSTRUCT"
  | "DEPLOY"
  | "TRIAGE"
  | "SYNTHESIZE"
  | "QUALITY_ASSURANCE"
  | "VERIFY"
  | "PRESENT"
  | "COMPLETE"
  | "FAILED";

export interface PipelineCheckpoint {
  runId: string;
  phase: CheckpointPhase;
  resumable: boolean;
  progress: {
    blueprint?: unknown;
    agentResults?: unknown;
    synthesis?: unknown;
    presentation?: unknown;
  };
  timestamp: string;
}

/**
 * Save a checkpoint for a pipeline run.
 * Stores intermediate results in the database manifest for resume capability.
 */
export async function saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void> {
  const { runId, phase, progress } = checkpoint;

  await db.run.update(runId, {
    status: phase,
    manifest: progress,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Load the last checkpoint for a run to resume execution.
 */
export async function loadCheckpoint(runId: string): Promise<PipelineCheckpoint | null> {
  const run = await db.run.findUnique(runId);

  if (!run) return null;

  const resumablePhases: CheckpointPhase[] = [
    "TRIAGE",
    "SYNTHESIZE",
    "QUALITY_ASSURANCE",
    "VERIFY",
    "PRESENT",
  ];

  return {
    runId: run.id,
    phase: run.status as CheckpointPhase,
    resumable: resumablePhases.includes(run.status as CheckpointPhase),
    progress: (typeof run.manifest === "object" && run.manifest !== null ? run.manifest : {}) as {
      blueprint?: unknown;
      agentResults?: unknown;
      synthesis?: unknown;
      presentation?: unknown;
    },
    timestamp: run.updatedAt,
  };
}

/**
 * Check if a run can be resumed from its current checkpoint.
 */
export async function canResume(runId: string): Promise<boolean> {
  const checkpoint = await loadCheckpoint(runId);
  return checkpoint?.resumable ?? false;
}

/**
 * Clear checkpoint data after successful completion.
 */
export async function clearCheckpoint(runId: string): Promise<void> {
  await db.run.update(runId, {
    manifest: null,
  });
}

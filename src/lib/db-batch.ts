/**
 * Database Batch Utilities
 *
 * Provides efficient batching for large bulk inserts to prevent
 * query size limits and improve performance.
 */

import { db } from "./db";

const DEFAULT_BATCH_SIZE = 100;

/**
 * Batch insert findings in chunks to prevent query size limits.
 */
export async function batchInsertFindings(
  findings: Array<{
    statement: string;
    evidence: string;
    confidence: string;
    evidenceType: string;
    source: string;
    sourceTier?: string;
    implication: string;
    action?: string;
    tags: string;
    agentId: string;
    runId: string;
  }>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<void> {
  if (findings.length === 0) return;

  for (let i = 0; i < findings.length; i += batchSize) {
    const batch = findings.slice(i, i + batchSize);
    await db.finding.createMany(batch);
  }
}

/**
 * Batch insert synthesis layers.
 */
export async function batchInsertSynthesis(
  layers: Array<{
    layerName: string;
    description: string;
    insights: string;
    sortOrder: number;
    runId: string;
  }>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<void> {
  if (layers.length === 0) return;

  for (let i = 0; i < layers.length; i += batchSize) {
    const batch = layers.slice(i, i + batchSize);
    await db.synthesis.createMany(batch);
  }
}

/**
 * Generic batch processor for any async operation.
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await processor(batch);
    results.push(result);
  }

  return results;
}

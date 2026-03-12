/**
 * Per-Run MemoryBus Manager
 *
 * Manages MemoryBus instances keyed by pipeline runId.
 * Each pipeline run gets its own MemoryBus so agents within a run share
 * a blackboard, signals, and conflicts without cross-run contamination.
 *
 * Uses globalThis to ensure all routes (stream, approval, status, etc.)
 * share the same in-memory map, even when the Next.js dev server (turbopack)
 * loads each route as a separate module instance.
 */

import { MemoryBus } from "./memory-bus";

// Use globalThis to survive module reloading in dev and share across routes
const globalKey = "__prism_memory_bus_registry__";

function getRegistry(): Map<string, MemoryBus> {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) {
    g[globalKey] = new Map<string, MemoryBus>();
  }
  return g[globalKey] as Map<string, MemoryBus>;
}

/**
 * Get an existing MemoryBus for a run, or create one if it doesn't exist.
 * If creating, initializes the bus with the given task description.
 */
export function getOrCreateBus(runId: string, task: string): MemoryBus {
  const registry = getRegistry();
  let bus = registry.get(runId);
  if (!bus) {
    bus = new MemoryBus(task);
    registry.set(runId, bus);
  }
  return bus;
}

/**
 * Get an existing MemoryBus for a run, or undefined if none exists.
 */
export function getBus(runId: string): MemoryBus | undefined {
  return getRegistry().get(runId);
}

/**
 * Remove a MemoryBus for a completed run to prevent memory leaks.
 * Call this after the pipeline finishes or is aborted.
 */
export function removeBus(runId: string): void {
  getRegistry().delete(runId);
}

/**
 * Check whether a MemoryBus exists for a given run.
 */
export function hasBus(runId: string): boolean {
  return getRegistry().has(runId);
}

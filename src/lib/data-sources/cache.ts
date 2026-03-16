/**
 * Per-Pipeline-Run Result Cache
 *
 * Caches tool results keyed by (toolName, inputHash). Uses promise coalescing
 * to prevent redundant API calls when parallel agents request the same data.
 *
 * Scoped to a single pipeline run — call clear() between runs.
 */

import type { ToolResult, CacheEntry } from "./types";

export class ResultCache {
  private store = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ToolResult>>();
  private hits = 0;
  private misses = 0;

  /**
   * Get a cached result or compute it. If another caller is already computing
   * the same (toolName, input), this awaits the same promise instead of making
   * a duplicate API call.
   */
  async getOrCompute(
    toolName: string,
    input: Record<string, unknown>,
    compute: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const key = this.cacheKey(toolName, input);

    // 1. Check completed cache
    const cached = this.store.get(key);
    if (cached) {
      this.hits++;
      return cached.result;
    }

    // 2. Check inflight — another caller already computing this
    const existing = this.inflight.get(key);
    if (existing) {
      this.hits++;
      return existing;
    }

    // 3. Cache miss — compute and share the promise
    this.misses++;
    const promise = compute()
      .then((result) => {
        this.store.set(key, { result, createdAt: Date.now() });
        this.inflight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Clear all entries (call between pipeline runs) */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Cache stats for observability */
  stats(): { hits: number; misses: number; entries: number } {
    return { hits: this.hits, misses: this.misses, entries: this.store.size };
  }

  private cacheKey(toolName: string, input: Record<string, unknown>): string {
    return `${toolName}::${JSON.stringify(input, Object.keys(input).sort())}`;
  }
}

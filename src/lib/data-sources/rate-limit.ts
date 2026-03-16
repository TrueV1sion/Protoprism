/**
 * Rate Limiting for Data Source Clients
 *
 * Two layers:
 * 1. GlobalRateLimiter: Semaphore limiting total concurrent outbound requests (default 20)
 * 2. TokenBucketLimiter: Per-client rate limiter based on upstream API limits
 */

import { MAX_CONCURRENT_REQUESTS } from "./types";

// ─── Global Concurrency Limiter ──────────────────────────────

/**
 * Semaphore-based concurrency limiter. Limits total concurrent outbound
 * API requests across all Layer 1 clients to prevent overwhelming
 * upstream APIs when many agents run in parallel.
 */
export class GlobalRateLimiter {
  private available: number;
  private readonly maxConcurrent: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number = MAX_CONCURRENT_REQUESTS) {
    this.maxConcurrent = maxConcurrent;
    this.available = maxConcurrent;
  }

  /** Acquire a slot. Resolves immediately if slots available, queues otherwise. */
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.available--;
        resolve();
      });
    });
  }

  /** Release a slot and unblock the next queued request. */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.available = Math.min(this.available + 1, this.maxConcurrent);
    }
  }
}

/** Singleton global rate limiter — shared across all Layer 1 clients */
export const globalRateLimiter = new GlobalRateLimiter();

// ─── Per-Client Token Bucket Limiter ─────────────────────────

/**
 * Simple token bucket rate limiter for per-client request pacing.
 * Enforces a minimum interval between requests based on the upstream
 * API's documented rate limits.
 */
export class TokenBucketLimiter {
  private readonly intervalMs: number;
  private lastRequestTime = 0;

  /**
   * @param requestsPerSecond — max requests per second for this client
   * @param _bucketSize — unused, reserved for future burst support
   */
  constructor(requestsPerSecond: number, _bucketSize: number = 1) {
    this.intervalMs = Math.ceil(1000 / requestsPerSecond);
  }

  /** Wait until the next request slot is available. */
  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.intervalMs) {
      const waitMs = this.intervalMs - elapsed;
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestTime = Date.now();
  }
}

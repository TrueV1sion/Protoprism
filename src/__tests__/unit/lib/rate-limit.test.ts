/**
 * Unit tests for PRISM In-Memory Rate Limiter (src/lib/rate-limit.ts)
 *
 * Tests validate:
 * - Allows requests under the limit
 * - Blocks requests over the limit (checks allowed, remaining, retryAfterMs)
 * - Tracks different keys independently
 * - Allows requests after window expires (using fake timers)
 * - cleanup() removes expired entries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("allows requests under the limit", () => {
    it("allows first request and reports correct remaining count", () => {
      const limiter = new RateLimiter(5, 60_000);
      const result = limiter.check("user-1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfterMs).toBe(0);
    });

    it("allows all requests up to the limit", () => {
      const limiter = new RateLimiter(3, 60_000);

      const r1 = limiter.check("user-1");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check("user-1");
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check("user-1");
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });
  });

  describe("blocks requests over the limit", () => {
    it("denies request when limit is exceeded", () => {
      const limiter = new RateLimiter(2, 60_000);

      limiter.check("user-1");
      limiter.check("user-1");
      const result = limiter.check("user-1");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("retryAfterMs reflects time until oldest timestamp expires", () => {
      const limiter = new RateLimiter(2, 60_000);

      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      limiter.check("user-1"); // t=0

      vi.advanceTimersByTime(10_000);
      limiter.check("user-1"); // t=10s

      vi.advanceTimersByTime(5_000);
      const result = limiter.check("user-1"); // t=15s, blocked

      expect(result.allowed).toBe(false);
      // Oldest timestamp was at t=0, window is 60s, now at t=15s
      // retryAfterMs = 60000 - (15000 - 0) = 45000
      expect(result.retryAfterMs).toBe(45_000);
    });
  });

  describe("tracks different keys independently", () => {
    it("one key being rate limited does not affect another", () => {
      const limiter = new RateLimiter(2, 60_000);

      // Exhaust limit for user-1
      limiter.check("user-1");
      limiter.check("user-1");
      const blocked = limiter.check("user-1");
      expect(blocked.allowed).toBe(false);

      // user-2 should be completely unaffected
      const result = limiter.check("user-2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("tracks multiple keys with separate counts", () => {
      const limiter = new RateLimiter(3, 60_000);

      limiter.check("ip-192.168.1.1");
      limiter.check("ip-192.168.1.1");
      limiter.check("ip-10.0.0.1");

      const r1 = limiter.check("ip-192.168.1.1");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(0); // 3rd of 3

      const r2 = limiter.check("ip-10.0.0.1");
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1); // 2nd of 3
    });
  });

  describe("allows requests after window expires", () => {
    it("resets after the full window elapses", () => {
      const limiter = new RateLimiter(2, 60_000);

      limiter.check("user-1");
      limiter.check("user-1");
      const blocked = limiter.check("user-1");
      expect(blocked.allowed).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(60_001);

      const result = limiter.check("user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("sliding window removes only expired timestamps", () => {
      const limiter = new RateLimiter(3, 60_000);

      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      limiter.check("user-1"); // t=0

      vi.advanceTimersByTime(30_000);
      limiter.check("user-1"); // t=30s

      vi.advanceTimersByTime(30_000);
      limiter.check("user-1"); // t=60s -- limit reached

      // Advance just past the first timestamp's window
      vi.advanceTimersByTime(1);
      // Now t=60001ms. The t=0 timestamp has expired, but t=30s and t=60s remain.
      const result = limiter.check("user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 3 total (2 old valid + 1 new)
    });
  });

  describe("cleanup()", () => {
    it("removes entries whose timestamps are all expired", () => {
      const limiter = new RateLimiter(5, 60_000);

      limiter.check("user-expire");
      limiter.check("user-expire");

      // Advance past the window so all timestamps expire
      vi.advanceTimersByTime(60_001);

      limiter.cleanup();

      // After cleanup, the key should be gone -- next check starts fresh
      const result = limiter.check("user-expire");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // fresh start, 1 used of 5
    });

    it("retains entries that still have valid timestamps", () => {
      const limiter = new RateLimiter(5, 60_000);

      limiter.check("user-active");
      vi.advanceTimersByTime(30_000);
      limiter.check("user-active");

      // Advance so first timestamp expires but second is still valid
      vi.advanceTimersByTime(30_001);
      limiter.cleanup();

      // user-active should still have 1 valid timestamp
      const result = limiter.check("user-active");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3); // 1 old valid + 1 new = 2 used of 5
    });

    it("handles cleanup with no entries gracefully", () => {
      const limiter = new RateLimiter(5, 60_000);
      expect(() => limiter.cleanup()).not.toThrow();
    });
  });

  describe("default constructor values", () => {
    it("defaults to 5 requests per 60 second window", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < 5; i++) {
        expect(limiter.check("user").allowed).toBe(true);
      }
      expect(limiter.check("user").allowed).toBe(false);
    });
  });
});

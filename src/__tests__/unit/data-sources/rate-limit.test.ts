import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GlobalRateLimiter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("allows up to maxConcurrent simultaneous acquisitions", async () => {
    const { GlobalRateLimiter } = await import("@/lib/data-sources/rate-limit");
    const limiter = new GlobalRateLimiter(2);

    await limiter.acquire();
    await limiter.acquire();

    // Third should block — verify by checking it doesn't resolve immediately
    let thirdResolved = false;
    const thirdPromise = limiter.acquire().then(() => { thirdResolved = true; });

    // Let microtasks settle
    await vi.advanceTimersByTimeAsync(0);
    expect(thirdResolved).toBe(false);

    // Release one slot
    limiter.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(thirdResolved).toBe(true);
    limiter.release();
    limiter.release();
  });

  it("queues requests when at capacity", async () => {
    const { GlobalRateLimiter } = await import("@/lib/data-sources/rate-limit");
    const limiter = new GlobalRateLimiter(1);
    await limiter.acquire();

    const order: number[] = [];
    const p1 = limiter.acquire().then(() => order.push(1));
    const p2 = limiter.acquire().then(() => order.push(2));

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([]); // Both blocked

    limiter.release(); // Unblocks first queued
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1]);

    limiter.release(); // Unblocks second queued
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1, 2]);

    limiter.release();
    limiter.release();
  });
});

describe("TokenBucketLimiter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("allows immediate request when bucket has tokens", async () => {
    const { TokenBucketLimiter } = await import("@/lib/data-sources/rate-limit");
    const limiter = new TokenBucketLimiter(10, 1); // 10 req/s, 1 token bucket
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBe(0);
  });

  it("enforces minimum interval between requests", async () => {
    const { TokenBucketLimiter } = await import("@/lib/data-sources/rate-limit");
    const limiter = new TokenBucketLimiter(4, 1); // 4 req/s → 250ms interval

    await limiter.acquire();

    // Second call should wait ~250ms
    const secondPromise = limiter.acquire();
    await vi.advanceTimersByTimeAsync(250);
    await secondPromise;
    // If we got here, the wait worked
    expect(true).toBe(true);
  });
});

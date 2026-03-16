// src/__tests__/unit/data-sources/clients/openfda.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the rate limiters to avoid real timing
vi.mock("@/lib/data-sources/rate-limit", () => {
  // Must use a regular function (not arrow) so `new` works
  function MockTokenBucketLimiter() {
    return { acquire: vi.fn(async () => {}) };
  }
  return {
    globalRateLimiter: { acquire: vi.fn(async () => {}), release: vi.fn() },
    TokenBucketLimiter: MockTokenBucketLimiter,
  };
});

describe("openFDA API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchAdverseEvents returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { results: { total: 1, skip: 0, limit: 10 }, last_updated: "2026-01-01" },
        results: [{ safetyreportid: "123", serious: 1 }],
      }),
    });

    const { openfdaClient } = await import("@/lib/data-sources/clients/openfda");
    const response = await openfdaClient.searchAdverseEvents({
      drugName: "adalimumab",
      limit: 10,
    });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(1);
    expect(response.data.results[0]).toHaveProperty("safetyreportid", "123");
    expect(response.vintage.source).toContain("openFDA");
  });

  it("searchDrugLabels builds correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { results: { total: 0, skip: 0, limit: 10 } },
        results: [],
      }),
    });

    const { openfdaClient } = await import("@/lib/data-sources/clients/openfda");
    await openfdaClient.searchDrugLabels({ brandName: "Humira" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api.fda.gov/drug/label.json");
    expect(calledUrl).toContain("openfda.brand_name");
    expect(calledUrl).toContain("Humira");
  });

  it("returns empty results on 404 (no matches)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "No matches" } }),
    });

    const { openfdaClient } = await import("@/lib/data-sources/clients/openfda");
    const response = await openfdaClient.searchAdverseEvents({ drugName: "zzz_nonexistent" });

    expect(response.data.results).toEqual([]);
    expect(response.data.total).toBe(0);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { openfdaClient } = await import("@/lib/data-sources/clients/openfda");
    await expect(
      openfdaClient.searchAdverseEvents({ drugName: "test" }),
    ).rejects.toThrow("rate limit");
  });
});

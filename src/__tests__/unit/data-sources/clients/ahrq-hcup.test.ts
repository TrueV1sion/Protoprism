// src/__tests__/unit/data-sources/clients/ahrq-hcup.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch (used by fetchHCUPnetData)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the rate limiters to avoid real timing
vi.mock("@/lib/data-sources/rate-limit", () => {
  function MockTokenBucketLimiter() {
    return { acquire: vi.fn(async () => {}) };
  }
  return {
    globalRateLimiter: { acquire: vi.fn(async () => {}), release: vi.fn() },
    TokenBucketLimiter: MockTokenBucketLimiter,
  };
});

describe("AHRQ HCUP Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchAll returns typed ApiResponse with embedded data results", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.searchAll({ query: "sepsis" });

    expect(response.status).toBe(200);
    expect(response.data.query).toBe("sepsis");
    expect(response.data.results.length).toBeGreaterThan(0);
    expect(response.data.results[0]).toHaveProperty("score");
    expect(response.data.results[0]).toHaveProperty("result_type");
    expect(response.data.results[0]).toHaveProperty("data");
    expect(response.vintage.source).toContain("AHRQ HCUP");
  });

  it("searchAll returns high-score match for exact condition name", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.searchAll({ query: "Heart failure" });

    expect(response.data.results.length).toBeGreaterThan(0);
    const topResult = response.data.results[0];
    expect(topResult.data.name).toBe("Heart failure");
    expect(topResult.score).toBeGreaterThanOrEqual(0.9);
  });

  it("searchAll filters by inpatient dataType and respects limit", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.searchAll({
      query: "heart",
      dataType: "inpatient",
      limit: 1,
    });

    expect(response.data.results.length).toBeLessThanOrEqual(1);
    if (response.data.results.length > 0) {
      expect(response.data.results[0].result_type).not.toBe("ed_diagnosis");
    }
  });

  it("searchAll returns empty results for a nonsense query", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    // Use a query with single-char tokens (filtered out) and no word overlap with any record
    const response = await ahrqHcupClient.searchAll({ query: "q w e r t y u i o p" });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(0);
    expect(response.data.total).toBe(0);
  });

  it("getTopConditions returns inpatient diagnoses ranked by hospitalizations by default", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.getTopConditions();

    expect(response.status).toBe(200);
    expect(response.data.setting).toBe("inpatient");
    expect(response.data.rankedBy).toBe("hospitalizations");
    expect(response.data.conditions.length).toBeGreaterThan(0);

    // Verify descending order by annual_discharges
    const discharges = response.data.conditions.map((c) => c.annual_discharges);
    for (let i = 1; i < discharges.length; i++) {
      expect(discharges[i]).toBeLessThanOrEqual(discharges[i - 1]);
    }
  });

  it("getTopConditions supports emergency setting", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.getTopConditions({ setting: "emergency" });

    expect(response.status).toBe(200);
    expect(response.data.setting).toBe("emergency");
    expect(response.data.conditions.length).toBeGreaterThan(0);
  });

  it("getTopConditions supports aggregate_cost ranking", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.getTopConditions({
      rankedBy: "aggregate_cost",
      setting: "inpatient",
    });

    expect(response.status).toBe(200);
    expect(response.data.rankedBy).toBe("aggregate_cost");
  });

  it("fetchHCUPnetData fetches URL and returns content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "<html><body>HCUPnet data</body></html>",
    });

    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.fetchHCUPnetData({
      url: "https://hcupnet.ahrq.gov/#query/topic=NIS",
    });

    expect(response.status).toBe(200);
    expect(response.data.content).toContain("HCUPnet data");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("hcupnet.ahrq.gov");
  });

  it("fetchHCUPnetData throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "",
    });

    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    await expect(
      ahrqHcupClient.fetchHCUPnetData({ url: "https://hcupnet.ahrq.gov/" }),
    ).rejects.toThrow("rate limit");
  });

  it("vintage includes dataThrough and AHRQ source", async () => {
    const { ahrqHcupClient } = await import("@/lib/data-sources/clients/ahrq-hcup");
    const response = await ahrqHcupClient.searchAll({ query: "sepsis" });

    expect(response.vintage.dataThrough).toBeDefined();
    expect(response.vintage.source).toContain("AHRQ");
    expect(response.vintage.queriedAt).toBeDefined();
  });
});

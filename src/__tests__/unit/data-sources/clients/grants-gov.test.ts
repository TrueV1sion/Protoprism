// src/__tests__/unit/data-sources/clients/grants-gov.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
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

describe("Grants.gov API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchOpportunities returns typed ApiResponse from v1 API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalCount: 42,
        opportunities: [
          {
            opportunityId: "12345",
            opportunityTitle: "Healthcare Workforce Development",
            agencyCode: "HHS",
            oppStatus: "forecasted",
          },
          {
            opportunityId: "67890",
            opportunityTitle: "Rural Health Initiatives",
            agencyCode: "USDA",
            oppStatus: "posted",
          },
        ],
      }),
    });

    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    const response = await grantsGovClient.searchOpportunities({ keyword: "healthcare" });

    expect(response.status).toBe(200);
    expect(response.data.total).toBe(42);
    expect(response.data.count).toBe(2);
    expect(response.data.source).toBe("v1");
    expect(response.data.results[0]).toHaveProperty("opportunity_id", "12345");
    expect(response.data.results[0]).toHaveProperty("title", "Healthcare Workforce Development");
    expect(response.vintage.source).toContain("Grants.gov");
  });

  it("searchOpportunities constructs v1 URL with keyword and rows params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ totalCount: 0, opportunities: [] }),
    });

    process.env.GRANTS_GOV_API_KEY = "test-grants-key";
    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    await grantsGovClient.searchOpportunities({ keyword: "mental health", rows: 5 });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.grants.gov/v1/api");
    expect(url).toContain("/search");
    expect(url).toContain("keyword=mental+health");
    expect(url).toContain("rows=5");
    delete process.env.GRANTS_GOV_API_KEY;
  });

  it("searchOpportunities falls back to legacy POST when v1 returns 404", async () => {
    // First call: v1 returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    // Second call: legacy POST succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        hitCount: 10,
        oppHits: [
          { id: "99999", title: "Legacy Grant", agencyCode: "NIH" },
        ],
      }),
    });

    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    const response = await grantsGovClient.searchOpportunities({ keyword: "research" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response.data.source).toBe("legacy");
    expect(response.data.results).toHaveLength(1);

    // Second call should be a POST to grants.gov legacy endpoint
    const [legacyUrl, legacyInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(legacyUrl).toContain("grants.gov");
    expect(legacyInit.method).toBe("POST");
  });

  it("throws on 429 rate limit from v1 API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    await expect(
      grantsGovClient.searchOpportunities({ keyword: "test" }),
    ).rejects.toThrow("rate limit");
  });

  it("getOpportunity returns normalized result for a single listing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        opportunity: {
          opportunityId: "11111",
          opportunityTitle: "Medical Research Grant",
          agencyCode: "NIH",
          oppStatus: "posted",
        },
      }),
    });

    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    const response = await grantsGovClient.getOpportunity("11111");

    expect(response.status).toBe(200);
    expect(response.data).not.toBeNull();
    expect(response.data?.opportunity_id).toBe("11111");
    expect(response.data?.title).toBe("Medical Research Grant");

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/listing/11111");
  });

  it("getOpportunity returns null data on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { grantsGovClient } = await import("@/lib/data-sources/clients/grants-gov");
    const response = await grantsGovClient.getOpportunity("nonexistent");

    expect(response.status).toBe(404);
    expect(response.data).toBeNull();
  });
});

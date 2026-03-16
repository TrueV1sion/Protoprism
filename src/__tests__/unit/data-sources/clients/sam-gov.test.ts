// src/__tests__/unit/data-sources/clients/sam-gov.test.ts
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

describe("SAM.gov API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchOpportunities returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalRecords: 150,
        opportunitiesData: [
          { opportunityId: "12345", title: "Healthcare IT Services", agencyCode: "HHS" },
          { opportunityId: "67890", title: "Medical Supplies", agencyCode: "VA" },
        ],
      }),
    });

    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    const response = await samGovClient.searchOpportunities({ q: "healthcare", limit: 10 });

    expect(response.status).toBe(200);
    expect(response.data.total).toBe(150);
    expect(response.data.count).toBe(2);
    expect(response.data.results[0]).toHaveProperty("opportunityId");
    expect(response.vintage.source).toContain("SAM.gov");
  });

  it("searchOpportunities constructs correct URL with API key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ totalRecords: 0, opportunitiesData: [] }),
    });

    process.env.SAM_GOV_API_KEY = "test-sam-key";
    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    await samGovClient.searchOpportunities({ q: "defense", naics: "541511", limit: 5 });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.sam.gov");
    expect(url).toContain("/opportunities/v2/search");
    expect(url).toContain("api_key=test-sam-key");
    expect(url).toContain("naics=541511");
    delete process.env.SAM_GOV_API_KEY;
  });

  it("returns empty result on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    const response = await samGovClient.searchOpportunities({ q: "nonexistent" });

    expect(response.status).toBe(404);
    expect(response.data.results).toHaveLength(0);
    expect(response.data.total).toBe(0);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    await expect(samGovClient.searchOpportunities({ q: "test" })).rejects.toThrow("rate limit");
  });

  it("throws on 403 forbidden", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    await expect(samGovClient.searchOpportunities({ q: "test" })).rejects.toThrow("403");
  });

  it("searchEntities constructs correct endpoint URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ totalRecords: 1, entityData: [{ ueiSAM: "ABC123" }] }),
    });

    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    await samGovClient.searchEntities({ legalBusinessName: "Acme Corp" });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/entity-information/v3/entities");
    expect(url).toContain("legalBusinessName=Acme+Corp");
  });

  it("hasApiKey returns false when key is not set", async () => {
    delete process.env.SAM_GOV_API_KEY;
    const { samGovClient } = await import("@/lib/data-sources/clients/sam-gov");
    expect(samGovClient.hasApiKey()).toBe(false);
  });
});

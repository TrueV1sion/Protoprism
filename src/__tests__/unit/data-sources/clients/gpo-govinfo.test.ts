// src/__tests__/unit/data-sources/clients/gpo-govinfo.test.ts
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

describe("GPO GovInfo API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("search returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        count: 2,
        totalCount: 42,
        packages: [
          { packageId: "BILLS-118hr1234ih", title: "A bill to amend..." },
          { packageId: "CFR-2023-title45", title: "Title 45 CFR" },
        ],
      }),
    });

    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    const response = await gpoGovinfoClient.search({ query: "health care" });

    expect(response.status).toBe(200);
    expect(response.data.count).toBe(2);
    expect(response.data.totalCount).toBe(42);
    expect(response.data.packages).toHaveLength(2);
    expect(response.vintage.source).toContain("GovInfo");
  });

  it("search constructs correct URL with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, totalCount: 0, packages: [] }),
    });

    process.env.GOVINFO_API_KEY = "test-govinfo-key";
    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    await gpoGovinfoClient.search({
      query: "Affordable Care Act",
      collections: "BILLS",
      pageSize: 5,
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.govinfo.gov");
    expect(url).toContain("/search");
    expect(url).toContain("query=");
    expect(url).toContain("api_key=test-govinfo-key");
    expect(url).toContain("collections=BILLS");
    delete process.env.GOVINFO_API_KEY;
  });

  it("search returns empty result on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    const response = await gpoGovinfoClient.search({ query: "nonexistent" });

    expect(response.status).toBe(404);
    expect(response.data.packages).toHaveLength(0);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    await expect(gpoGovinfoClient.search({ query: "test" })).rejects.toThrow("rate limit");
  });

  it("hasApiKey returns false when key is not set", async () => {
    delete process.env.GOVINFO_API_KEY;
    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    expect(gpoGovinfoClient.hasApiKey()).toBe(false);
  });

  it("hasApiKey returns true when key is set", async () => {
    process.env.GOVINFO_API_KEY = "my-key";
    const { gpoGovinfoClient } = await import("@/lib/data-sources/clients/gpo-govinfo");
    expect(gpoGovinfoClient.hasApiKey()).toBe(true);
    delete process.env.GOVINFO_API_KEY;
  });
});

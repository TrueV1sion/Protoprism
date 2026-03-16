// src/__tests__/unit/data-sources/clients/fda-orange-book.test.ts
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

describe("FDA Orange Book API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchProducts returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        meta: {
          last_updated: "2024-01-15",
          results: { skip: 0, limit: 10, total: 3 },
        },
        results: [
          {
            application_number: "NDA020670",
            sponsor_name: "PFIZER",
            openfda: {
              brand_name: ["LIPITOR"],
              generic_name: ["ATORVASTATIN CALCIUM"],
            },
            products: [{ dosage_form: "TABLET", route: "ORAL" }],
          },
        ],
      }),
    });

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    const response = await fdaOrangeBookClient.searchProducts({ brandName: "lipitor" });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(1);
    expect(response.data.total).toBe(3);
    expect(response.data.results[0]).toHaveProperty("application_number", "NDA020670");
    expect(response.vintage.source).toContain("Orange Book");
    expect(response.vintage.dataThrough).toBe("2024-01-15");
  });

  it("searchProducts constructs URL with openFDA search syntax", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { results: { skip: 0, limit: 10, total: 0 } },
        results: [],
      }),
    });

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    await fdaOrangeBookClient.searchProducts({
      brandName: "aspirin",
      genericName: "acetylsalicylic acid",
      limit: 5,
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.fda.gov/drug/drugsfda.json");
    expect(url).toContain("search=");
    expect(url).toContain("aspirin");
    expect(url).toContain("limit=5");
  });

  it("returns empty result on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    const response = await fdaOrangeBookClient.searchProducts({ brandName: "nonexistent" });

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

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    await expect(
      fdaOrangeBookClient.searchProducts({ brandName: "test" }),
    ).rejects.toThrow("rate limit");
  });

  it("throws when API returns error in response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        error: { code: "NOT_FOUND", message: "No results found for query" },
      }),
    });

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    await expect(
      fdaOrangeBookClient.searchProducts({ query: "bad_field:value" }),
    ).rejects.toThrow("No results found for query");
  });

  it("getByApplicationNumber uses exact application number search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { results: { skip: 0, limit: 1, total: 1 } },
        results: [{ application_number: "NDA020670", sponsor_name: "PFIZER" }],
      }),
    });

    const { fdaOrangeBookClient } = await import("@/lib/data-sources/clients/fda-orange-book");
    await fdaOrangeBookClient.getByApplicationNumber("NDA020670");

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("application_number");
    expect(url).toContain("NDA020670");
    expect(url).toContain("limit=1");
  });
});

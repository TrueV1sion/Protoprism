// src/__tests__/unit/data-sources/clients/sec-edgar.test.ts
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

describe("SEC EDGAR API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchFilings returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "0001234567-24-000001",
              _source: {
                file_date: "2024-01-15",
                form_type: "10-K",
                display_names: ["Apple Inc."],
                entity_id: "0000320193",
                adsh: "0001234567-24-000001",
              },
            },
          ],
        },
      }),
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    const response = await secEdgarClient.searchFilings({ query: "annual report", limit: 10 });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(1);
    expect(response.data.results[0]).toHaveProperty("form_type", "10-K");
    expect(response.data.results[0]).toHaveProperty("company", "Apple Inc.");
    expect(response.vintage.source).toContain("SEC");
  });

  it("searchFilings builds correct URL with forms filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        hits: { total: { value: 0 }, hits: [] },
      }),
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    await secEdgarClient.searchFilings({ query: "test", forms: ["10-K"] });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("efts.sec.gov");
    expect(calledUrl).toContain("10-K");
  });

  it("getCompanyFilings fetches from submissions endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        cik: "0000320193",
        name: "Apple Inc.",
        filings: { recent: { form: ["10-K"], filingDate: ["2024-01-01"], accessionNumber: ["0001234567-24-000001"] } },
      }),
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    const response = await secEdgarClient.getCompanyFilings({ cik: "320193" });

    expect(response.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("data.sec.gov/submissions");
    expect(calledUrl).toContain("CIK0000320193");
  });

  it("getCompanyFilings pads CIK to 10 digits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ cik: "0000012345", name: "Test Corp", filings: { recent: {} } }),
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    await secEdgarClient.getCompanyFilings({ cik: "12345" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("CIK0000012345");
  });

  it("returns 404 result for unknown company", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    const response = await secEdgarClient.getCompanyFilings({ cik: "9999999999" });

    expect(response.status).toBe(404);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too many requests",
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    await expect(
      secEdgarClient.searchFilings({ query: "test" }),
    ).rejects.toThrow("rate limit");
  });

  it("vintage source contains SEC EDGAR", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ hits: { total: { value: 0 }, hits: [] } }),
    });

    const { secEdgarClient } = await import("@/lib/data-sources/clients/sec-edgar");
    const response = await secEdgarClient.searchFilings({ query: "test" });

    expect(response.vintage.source).toMatch(/SEC/i);
    expect(response.vintage.queriedAt).toBeTruthy();
  });
});

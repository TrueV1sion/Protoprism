// src/__tests__/unit/data-sources/clients/bls-data.test.ts
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

describe("BLS Public Data API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("getTimeSeries returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "REQUEST_SUCCEEDED",
        responseTime: 120,
        message: [],
        Results: {
          series: [
            {
              seriesID: "LNS14000000",
              data: [
                { year: "2024", period: "M01", periodName: "January", value: "3.7", footnotes: [] },
              ],
            },
          ],
        },
      }),
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    const response = await blsDataClient.getTimeSeries({
      seriesIds: ["LNS14000000"],
      startYear: 2024,
      endYear: 2024,
    });

    expect(response.status).toBe(200);
    expect(response.data.series).toHaveLength(1);
    expect(response.data.series[0]).toHaveProperty("seriesID", "LNS14000000");
    expect(response.vintage.source).toContain("Bureau of Labor Statistics");
  });

  it("getTimeSeries sends POST request with correct body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "REQUEST_SUCCEEDED",
        responseTime: 50,
        message: [],
        Results: { series: [] },
      }),
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    await blsDataClient.getTimeSeries({
      seriesIds: ["CEU0000000001"],
      startYear: 2020,
      endYear: 2024,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.bls.gov");
    expect(url).toContain("/timeseries/data/");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.seriesid).toEqual(["CEU0000000001"]);
    expect(body.startyear).toBe("2020");
    expect(body.endyear).toBe("2024");
  });

  it("getSeries is a convenience wrapper for a single series", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "REQUEST_SUCCEEDED",
        responseTime: 50,
        message: [],
        Results: {
          series: [{ seriesID: "CUUR0000SA0", data: [] }],
        },
      }),
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    const response = await blsDataClient.getSeries({
      seriesId: "CUUR0000SA0",
      startYear: 2023,
      endYear: 2024,
    });

    expect(response.data.series[0].seriesID).toBe("CUUR0000SA0");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.seriesid).toEqual(["CUUR0000SA0"]);
  });

  it("includes API key in body when BLS_API_KEY is set", async () => {
    process.env.BLS_API_KEY = "test-bls-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "REQUEST_SUCCEEDED",
        responseTime: 50,
        message: [],
        Results: { series: [] },
      }),
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    await blsDataClient.getTimeSeries({ seriesIds: ["LNS14000000"], startYear: 2024, endYear: 2024 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.registrationkey).toBe("test-bls-key");
    delete process.env.BLS_API_KEY;
  });

  it("throws when API status is not REQUEST_SUCCEEDED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "REQUEST_FAILED",
        responseTime: 50,
        message: ["Series does not exist"],
        Results: null,
      }),
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    await expect(
      blsDataClient.getTimeSeries({ seriesIds: ["INVALID"], startYear: 2024, endYear: 2024 }),
    ).rejects.toThrow("REQUEST_FAILED");
  });

  it("throws when too many series IDs provided", async () => {
    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    const tooMany = Array.from({ length: 51 }, (_, i) => `SERIES${i}`);

    await expect(
      blsDataClient.getTimeSeries({ seriesIds: tooMany, startYear: 2024, endYear: 2024 }),
    ).rejects.toThrow("Too many series IDs");
  });

  it("throws when year span exceeds 20 years", async () => {
    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");

    await expect(
      blsDataClient.getTimeSeries({ seriesIds: ["LNS14000000"], startYear: 2000, endYear: 2024 }),
    ).rejects.toThrow("Year span");
  });

  it("throws when endYear is before startYear", async () => {
    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");

    await expect(
      blsDataClient.getTimeSeries({ seriesIds: ["LNS14000000"], startYear: 2024, endYear: 2020 }),
    ).rejects.toThrow("endYear must be");
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    await expect(
      blsDataClient.getTimeSeries({ seriesIds: ["LNS14000000"], startYear: 2024, endYear: 2024 }),
    ).rejects.toThrow("rate limit");
  });

  it("hasApiKey returns false when key is not set", async () => {
    delete process.env.BLS_API_KEY;
    const { blsDataClient } = await import("@/lib/data-sources/clients/bls-data");
    expect(blsDataClient.hasApiKey()).toBe(false);
  });
});

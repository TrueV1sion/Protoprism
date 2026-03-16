// src/__tests__/unit/data-sources/clients/who-gho.test.ts
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

describe("WHO GHO API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("listIndicators returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        "@odata.context": "https://ghoapi.azureedge.net/api/$metadata#Indicator",
        value: [
          { IndicatorCode: "WHOSIS_000001", IndicatorName: "Life expectancy at birth", Language: "EN" },
          { IndicatorCode: "WHOSIS_000002", IndicatorName: "Healthy life expectancy (HALE) at birth", Language: "EN" },
        ],
      }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    const response = await whoGhoClient.listIndicators({ limit: 50 });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(2);
    expect(response.data.results[0]).toHaveProperty("IndicatorCode", "WHOSIS_000001");
    expect(response.vintage.source).toContain("WHO");
  });

  it("listIndicators with keyword uses $filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ value: [] }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    await whoGhoClient.listIndicators({ keyword: "mortality" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("ghoapi.azureedge.net");
    expect(calledUrl).toContain("Indicator");
    expect(calledUrl).toContain("filter");
    expect(calledUrl).toContain("mortality");
  });

  it("getIndicatorData fetches data for a specific indicator", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        value: [
          {
            IndicatorCode: "WHOSIS_000001",
            SpatialDim: "USA",
            TimeDim: 2022,
            NumericValue: 76.4,
            Value: "76.4",
          },
        ],
      }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    const response = await whoGhoClient.getIndicatorData({
      indicatorCode: "WHOSIS_000001",
      country: "USA",
    });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("WHOSIS_000001");
    expect(calledUrl).toContain("USA");
  });

  it("getIndicatorData applies year range filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ value: [] }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    await whoGhoClient.getIndicatorData({
      indicatorCode: "WHOSIS_000001",
      yearFrom: 2015,
      yearTo: 2022,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("TimeDim%20ge%202015");
    expect(calledUrl).toContain("TimeDim%20le%202022");
  });

  it("getIndicatorData normalizes sex code to GHO dimension", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ value: [] }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    await whoGhoClient.getIndicatorData({
      indicatorCode: "WHOSIS_000001",
      sex: "male",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("MLE");
  });

  it("getMultiCountryData builds OR filter for multiple countries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ value: [] }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    await whoGhoClient.getMultiCountryData({
      indicatorCode: "WHOSIS_000001",
      countryCodes: ["USA", "GBR", "FRA"],
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("USA");
    expect(calledUrl).toContain("GBR");
    expect(calledUrl).toContain("FRA");
  });

  it("returns empty results on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    const response = await whoGhoClient.getIndicatorData({ indicatorCode: "UNKNOWN_CODE" });

    expect(response.status).toBe(404);
    expect(response.data.results).toEqual([]);
  });

  it("hasMore is true when results fill the limit", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      IndicatorCode: "WHOSIS_000001",
      SpatialDim: `C${i}`,
      TimeDim: 2022,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ value: items }),
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    const response = await whoGhoClient.getIndicatorData({
      indicatorCode: "WHOSIS_000001",
      limit: 50,
    });

    expect(response.data.count).toBe(50);
    expect(response.data.hasMore).toBe(true);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too many requests",
    });

    const { whoGhoClient } = await import("@/lib/data-sources/clients/who-gho");
    await expect(
      whoGhoClient.listIndicators({}),
    ).rejects.toThrow("rate limit");
  });

  it("buildIndicatorNameFilter helper escapes single quotes", async () => {
    const { buildIndicatorNameFilter } = await import("@/lib/data-sources/clients/who-gho");
    const filter = buildIndicatorNameFilter("O'Brien test");
    expect(filter).toBe("contains(IndicatorName,'O''Brien test')");
  });

  it("buildDataFilter returns undefined when no options given", async () => {
    const { buildDataFilter } = await import("@/lib/data-sources/clients/who-gho");
    expect(buildDataFilter({})).toBeUndefined();
  });
});

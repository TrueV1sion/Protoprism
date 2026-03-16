// src/__tests__/unit/data-sources/clients/oecd-health.test.ts
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

const SAMPLE_SDMX_RESPONSE = {
  dataSets: [
    {
      series: {
        "0:0": {
          observations: {
            "0": [8.5, null],
            "1": [8.7, null],
          },
        },
        "1:0": {
          observations: {
            "0": [11.2, null],
            "1": [11.4, null],
          },
        },
      },
    },
  ],
  structure: {
    dimensions: {
      series: [
        {
          id: "REF_AREA",
          name: "Reference Area",
          values: [
            { id: "GBR", name: "United Kingdom" },
            { id: "USA", name: "United States" },
          ],
        },
        {
          id: "MEASURE",
          name: "Measure",
          values: [{ id: "PC_GDP", name: "% of GDP" }],
        },
      ],
      observation: [
        {
          id: "TIME_PERIOD",
          name: "Time Period",
          values: [
            { id: "2020", name: "2020" },
            { id: "2021", name: "2021" },
          ],
        },
      ],
    },
  },
};

describe("OECD Health Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("getHealthData returns typed ApiResponse with parsed observations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => SAMPLE_SDMX_RESPONSE,
    });

    const { oecdHealthClient } = await import("@/lib/data-sources/clients/oecd-health");
    const response = await oecdHealthClient.getHealthData({
      dataflowId: "SHA",
      indicatorId: "HEALTH_EXP_GDP",
      unit: "% GDP",
      countries: ["GBR", "USA"],
    });

    expect(response.status).toBe(200);
    expect(response.data.indicator).toBe("HEALTH_EXP_GDP");
    expect(response.data.unit).toBe("% GDP");
    expect(response.data.dataflow).toBe("SHA");
    expect(response.data.observations.length).toBeGreaterThan(0);
    expect(response.vintage.source).toContain("OECD");
  });

  it("getHealthData constructs SDMX URL with correct format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => SAMPLE_SDMX_RESPONSE,
    });

    const { oecdHealthClient } = await import("@/lib/data-sources/clients/oecd-health");
    await oecdHealthClient.getHealthData({
      dataflowId: "HEALTH_STAT",
      indicatorId: "LIFE_EXP",
      unit: "Years",
      countries: ["USA"],
      dimensionFilter: "LIFEEXP.T",
      startYear: 2015,
      endYear: 2022,
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sdmx.oecd.org");
    expect(url).toContain("HEALTH_STAT");
    expect(url).toContain("OECD.ELS.HD");
    expect(url).toContain("startPeriod=2015");
    expect(url).toContain("endPeriod=2022");
    expect(url).toContain("USA");
  });

  it("returns empty observations on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { oecdHealthClient } = await import("@/lib/data-sources/clients/oecd-health");
    const response = await oecdHealthClient.getHealthData({
      dataflowId: "NONEXISTENT",
      indicatorId: "BAD_ID",
      unit: "units",
    });

    expect(response.status).toBe(404);
    expect(response.data.observations).toHaveLength(0);
    expect(response.data.totalObservations).toBe(0);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { oecdHealthClient } = await import("@/lib/data-sources/clients/oecd-health");
    await expect(
      oecdHealthClient.getHealthData({ dataflowId: "SHA", indicatorId: "X", unit: "Y" }),
    ).rejects.toThrow("rate limit");
  });

  it("getLifeExpectancy is a convenience wrapper with correct defaults", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ dataSets: [], structure: {} }),
    });

    const { oecdHealthClient } = await import("@/lib/data-sources/clients/oecd-health");
    const response = await oecdHealthClient.getLifeExpectancy({ countries: ["FRA"] });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("HEALTH_STAT");
    expect(response.data.indicator).toBe("LIFE_EXP");
    expect(response.data.unit).toBe("Years");
  });
});

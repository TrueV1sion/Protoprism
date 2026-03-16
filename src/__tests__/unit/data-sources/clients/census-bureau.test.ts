// src/__tests__/unit/data-sources/clients/census-bureau.test.ts
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

describe("Census Bureau API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("getAcsData returns typed ApiResponse with transformed records", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        ["B01003_001E", "NAME", "state"],
        ["39538223", "California", "06"],
        ["20201249", "Texas", "48"],
      ],
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.getAcsData({
      year: 2022,
      variables: ["B01003_001E", "NAME"],
      geography: "state:*",
    });

    expect(response.status).toBe(200);
    expect(response.data.records).toHaveLength(2);
    expect(response.data.records[0]).toHaveProperty("B01003_001E", 39538223);
    expect(response.data.records[0]).toHaveProperty("NAME", "California");
    expect(response.data.headers).toEqual(["B01003_001E", "NAME", "state"]);
    expect(response.vintage.source).toContain("Census");
  });

  it("getAcsData builds correct URL with geography", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [["B01003_001E", "us"], ["331449281", "1"]],
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    await censusBureauClient.getAcsData({
      year: 2022,
      variables: ["B01003_001E"],
      geography: "us",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api.census.gov/data");
    expect(calledUrl).toContain("2022/acs/acs5");
    expect(calledUrl).toContain("B01003_001E");
    expect(calledUrl).toContain("us%3A1");
  });

  it("transforms sentinel values to null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        ["B19013_001E", "NAME", "state"],
        ["-666666666", "Puerto Rico", "72"],
        ["-999999999", "Other Territory", "99"],
      ],
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.getAcsData({
      year: 2022,
      variables: ["B19013_001E", "NAME"],
      geography: "state:*",
    });

    expect(response.data.records[0]).toHaveProperty("B19013_001E", null);
    expect(response.data.records[1]).toHaveProperty("B19013_001E", null);
  });

  it("transforms numeric strings to numbers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        ["B01003_001E", "B19013_001E"],
        ["1000000", "75000"],
      ],
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.getAcsData({
      year: 2022,
      variables: ["B01003_001E", "B19013_001E"],
      geography: "us",
    });

    expect(typeof response.data.records[0]["B01003_001E"]).toBe("number");
    expect(response.data.records[0]["B01003_001E"]).toBe(1000000);
  });

  it("getSahieData uses timeseries path (no year prefix)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        ["NIC_PT", "NUI_PT", "PCTIC_PT", "PCTUI_PT", "NAME", "STABREV", "GEOCAT", "AGECAT", "RACECAT", "SEXCAT", "IPRCAT", "NIC_MOE", "NUI_MOE", "PCTIC_MOE", "PCTUI_MOE"],
        ["3000000", "500000", "85.0", "15.0", "California", "CA", "40", "0", "0", "0", "0", "10000", "5000", "1.5", "0.8"],
      ],
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.getSahieData({ stateFips: "06" });

    expect(response.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("timeseries/healthins/sahie");
    // Should NOT have a year in the path
    expect(calledUrl).not.toMatch(/\/data\/\d{4}\//);
  });

  it("listVariables fetches variables endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        variables: {
          for: { label: "Census API FIPS 'for' clause" },
          in: { label: "Census API FIPS 'in' clause" },
          NAME: { label: "Geographic Area Name" },
          B01003_001E: {
            label: "Estimate!!Total",
            concept: "TOTAL POPULATION",
            group: "B01003",
          },
        },
      }),
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.listVariables({ year: 2022, dataset: "acs/acs5" });

    expect(response.status).toBe(200);
    // 'for', 'in', 'NAME' should be filtered out
    expect(response.data.variables.some((v) => v.code === "for")).toBe(false);
    expect(response.data.variables.some((v) => v.code === "NAME")).toBe(false);
    expect(response.data.variables.some((v) => v.code === "B01003_001E")).toBe(true);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("variables.json");
  });

  it("returns 404 result for unknown dataset/year combo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    const response = await censusBureauClient.getAcsData({
      year: 1900,
      variables: ["B01003_001E"],
      geography: "us",
    });

    expect(response.status).toBe(404);
    expect(response.data.records).toEqual([]);
  });

  it("throws on 400 with descriptive message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "error: unknown variable 'INVALID_VAR'",
    });

    const { censusBureauClient } = await import("@/lib/data-sources/clients/census-bureau");
    await expect(
      censusBureauClient.getAcsData({
        year: 2022,
        variables: ["INVALID_VAR"],
        geography: "us",
      }),
    ).rejects.toThrow("400");
  });
});

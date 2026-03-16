// src/__tests__/unit/data-sources/clients/congress-gov.test.ts
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

describe("Congress.gov API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchBills returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        bills: [
          {
            congress: 118,
            type: "HR",
            number: "1234",
            title: "Test Appropriations Act",
            latestAction: { actionDate: "2024-01-15", text: "Passed House" },
          },
        ],
        pagination: { count: 1 },
      }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    const response = await congressGovClient.searchBills({ query: "appropriations" });

    expect(response.status).toBe(200);
    expect(response.data.data).toBeTruthy();
    expect(response.vintage.source).toContain("Congress");
  });

  it("searchBills appends format=json and api_key when set", async () => {
    process.env.CONGRESS_GOV_API_KEY = "test-api-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ bills: [], pagination: { count: 0 } }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    await congressGovClient.searchBills({ query: "test" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("api_key=test-api-key");
    delete process.env.CONGRESS_GOV_API_KEY;
  });

  it("searchBills uses specific congress/billType path when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ bills: [], pagination: { count: 0 } }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    await congressGovClient.searchBills({ congress: 118, billType: "hr" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/bill/118/hr");
  });

  it("getBill fetches specific bill", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        bill: { congress: 117, type: "S", number: "999", title: "A Test Bill" },
        pagination: undefined,
      }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    const response = await congressGovClient.getBill(117, "s", 999);

    expect(response.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/bill/117/s/999");
  });

  it("returns 404 result for unknown bill", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    const response = await congressGovClient.getBill(999, "hr", 99999);

    expect(response.status).toBe(404);
    expect(response.data.data).toBeNull();
  });

  it("hasMore is true when pagination.next is present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        bills: new Array(20).fill({ congress: 118, type: "HR", number: "1" }),
        pagination: { count: 20, next: "https://api.congress.gov/v3/bill?offset=20" },
      }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    const response = await congressGovClient.searchBills({ query: "test", limit: 20 });

    expect(response.data.hasMore).toBe(true);
  });

  it("searchMembers uses state path when state provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ members: [], pagination: { count: 0 } }),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    await congressGovClient.searchMembers({ state: "CA" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/member/CA");
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { congressGovClient } = await import("@/lib/data-sources/clients/congress-gov");
    await expect(
      congressGovClient.searchBills({ query: "test" }),
    ).rejects.toThrow("rate limit");
  });
});

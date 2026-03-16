// src/__tests__/unit/data-sources/clients/uspto-patents.test.ts
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

describe("USPTO PatentsView API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchPatents returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        patents: [
          {
            patent_number: "11234567",
            patent_title: "System and method for AI",
            patent_date: "2024-01-15",
            patent_num_cited_by_us_patents: 5,
          },
        ],
        count: 1,
        total_patent_count: 1,
      }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    const response = await usptoPatentsClient.searchPatents({ query: "artificial intelligence" });

    expect(response.status).toBe(200);
    expect(response.data.patents).toHaveLength(1);
    expect(response.data.patents![0]).toHaveProperty("patent_number", "11234567");
    expect(response.vintage.source).toContain("USPTO");
  });

  it("searchPatents sends POST request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ patents: [], count: 0, total_patent_count: 0 }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    await usptoPatentsClient.searchPatents({ assignee: "Google" });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("patentsview.org");
    expect(url).toContain("/patents/query");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });

    const body = JSON.parse(init.body as string);
    expect(body).toHaveProperty("q");
    expect(body).toHaveProperty("f");
    expect(body).toHaveProperty("o");
  });

  it("getPatent fetches by patent number", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        patents: [{ patent_number: "7654321", patent_title: "Widget Invention", patent_date: "2020-05-10" }],
        count: 1,
        total_patent_count: 1,
      }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    const response = await usptoPatentsClient.getPatent("7654321");

    expect(response.status).toBe(200);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.q).toHaveProperty("patent_number", "7654321");
  });

  it("getPatent normalizes patent number (strips dashes and leading zeros from pure-numeric strings)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ patents: [], count: 0, total_patent_count: 0 }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    // Pure numeric with leading zeros — the normalization strips dashes/spaces then leading zeros
    await usptoPatentsClient.getPatent("007654321");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.q.patent_number).toBe("7654321");
  });

  it("searchAssignees queries assignees endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        assignees: [{ assignee_organization: "Apple Inc.", assignee_total_num_patents: 50000 }],
        count: 1,
        total_assignee_count: 1,
      }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    const response = await usptoPatentsClient.searchAssignees({ orgName: "Apple" });

    expect(response.status).toBe(200);
    expect(response.data.assignees).toHaveLength(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/assignees/query");
  });

  it("hasMore reflects pagination state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        patents: new Array(25).fill({ patent_number: "x", patent_title: "y" }),
        count: 25,
        total_patent_count: 1000,
      }),
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    const response = await usptoPatentsClient.searchPatents({ query: "test", limit: 25 });

    expect(response.data.hasMore).toBe(true);
    expect(response.data.total).toBe(1000);
  });

  it("throws on 400 bad request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Invalid query parameters",
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    await expect(
      usptoPatentsClient.searchPatents({ query: "test" }),
    ).rejects.toThrow("bad request");
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Too many requests",
    });

    const { usptoPatentsClient } = await import("@/lib/data-sources/clients/uspto-patents");
    await expect(
      usptoPatentsClient.searchPatents({ query: "test" }),
    ).rejects.toThrow("rate limit");
  });
});

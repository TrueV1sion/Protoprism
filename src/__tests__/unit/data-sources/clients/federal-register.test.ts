// src/__tests__/unit/data-sources/clients/federal-register.test.ts
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

describe("Federal Register API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("searchDocuments returns typed ApiResponse", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        description: "test",
        count: 1,
        total_pages: 1,
        next_page_url: null,
        results: [
          {
            title: "Test Rule",
            type: "RULE",
            abstract: "A test rule",
            document_number: "2024-00001",
            html_url: "https://www.federalregister.gov/d/2024-00001",
            pdf_url: "https://www.gpo.gov/fdsys/pkg/FR-2024-01-01/pdf/2024-00001.pdf",
            publication_date: "2024-01-01",
            agencies: [],
          },
        ],
      }),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    const response = await federalRegisterClient.searchDocuments({ query: "environmental" });

    expect(response.status).toBe(200);
    expect(response.data.results).toHaveLength(1);
    expect(response.data.results[0]).toHaveProperty("document_number", "2024-00001");
    expect(response.vintage.source).toContain("Federal Register");
  });

  it("searchDocuments builds correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        count: 0, total_pages: 0, next_page_url: null, results: [],
      }),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    await federalRegisterClient.searchDocuments({ query: "climate" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("federalregister.gov");
    expect(calledUrl).toContain("documents.json");
    expect(calledUrl).toContain("climate");
  });

  it("searchDocuments with document_type filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, total_pages: 0, next_page_url: null, results: [] }),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    await federalRegisterClient.searchDocuments({ document_type: ["RULE"] });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("RULE");
  });

  it("getDocument fetches specific document", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        title: "Specific Document",
        type: "RULE",
        document_number: "2024-12345",
        html_url: "https://www.federalregister.gov/d/2024-12345",
        pdf_url: "https://example.com/pdf",
        publication_date: "2024-06-01",
        abstract: null,
        agencies: [],
      }),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    const response = await federalRegisterClient.getDocument("2024-12345");

    expect(response.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("2024-12345");
  });

  it("returns null on 404 for unknown document", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    const response = await federalRegisterClient.getDocument("unknown-number");

    expect(response.status).toBe(404);
    expect(response.data).toBeNull();
  });

  it("hasMore reflects pagination state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        count: 200,
        total_pages: 10,
        next_page_url: "https://www.federalregister.gov/api/v1/documents.json?page=2",
        results: new Array(20).fill({ title: "doc", type: "RULE", document_number: "x", html_url: "", pdf_url: "", publication_date: "2024-01-01", abstract: null, agencies: [] }),
      }),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    const response = await federalRegisterClient.searchDocuments({ query: "test", page: 1 });

    expect(response.data.hasMore).toBe(true);
    expect(response.data.totalPages).toBe(10);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const { federalRegisterClient } = await import("@/lib/data-sources/clients/federal-register");
    await expect(
      federalRegisterClient.searchDocuments({ query: "test" }),
    ).rejects.toThrow("rate limit");
  });
});

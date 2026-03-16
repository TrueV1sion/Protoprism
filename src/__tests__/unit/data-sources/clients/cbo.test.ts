// src/__tests__/unit/data-sources/clients/cbo.test.ts
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

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CBO Publications</title>
    <item>
      <title><![CDATA[The Budget and Economic Outlook: 2024 to 2034]]></title>
      <link>https://www.cbo.gov/publication/59970</link>
      <description><![CDATA[CBO's January 2024 baseline budget projections and economic forecast.]]></description>
      <pubDate>Mon, 12 Feb 2024 12:00:00 +0000</pubDate>
    </item>
    <item>
      <title><![CDATA[Cost Estimate for H.R. 1234]]></title>
      <link>https://www.cbo.gov/publication/59800</link>
      <description><![CDATA[CBO's cost estimate for H.R. 1234.]]></description>
      <pubDate>Tue, 06 Feb 2024 12:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

describe("CBO Client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("getRecentPublications returns typed ApiResponse with parsed items", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => SAMPLE_RSS,
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    const response = await cboClient.getRecentPublications();

    expect(response.status).toBe(200);
    expect(response.data.items).toHaveLength(2);
    expect(response.data.items[0].title).toContain("Budget and Economic Outlook");
    expect(response.data.items[0].publicationId).toBe("59970");
    expect(response.vintage.source).toContain("Congressional Budget Office");
  });

  it("searchPublications constructs URL with encoded query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => SAMPLE_RSS,
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    await cboClient.searchPublications({ query: "health care costs" });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("cbo.gov");
    expect(url).toContain("health%20care%20costs");
    expect(url).toContain("format=rss");
  });

  it("getCostEstimates fetches from cost-estimates RSS endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => SAMPLE_RSS,
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    const response = await cboClient.getCostEstimates({ limit: 1 });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("cost-estimates");
    expect(response.data.items).toHaveLength(1);
  });

  it("returns empty result on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "",
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    const response = await cboClient.getRecentPublications();

    expect(response.status).toBe(404);
    expect(response.data.items).toHaveLength(0);
  });

  it("throws on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "",
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    await expect(cboClient.getRecentPublications()).rejects.toThrow("rate limit");
  });

  it("getPublicationDetail extracts title and content from HTML", async () => {
    const sampleHtml = `<html>
      <head><title>The Budget Outlook | Congressional Budget Office</title></head>
      <body>
        <main>
          <h1>The Budget Outlook</h1>
          <p>This report covers federal budget projections for 2024.</p>
          <p>The deficit is projected to grow significantly over the next decade.</p>
        </main>
      </body>
    </html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => sampleHtml,
    });

    const { cboClient } = await import("@/lib/data-sources/clients/cbo");
    const response = await cboClient.getPublicationDetail("https://www.cbo.gov/publication/59970");

    expect(response.status).toBe(200);
    expect(response.data.title).toContain("Budget Outlook");
    expect(response.data.url).toBe("https://www.cbo.gov/publication/59970");
    expect(response.data.publicationId).toBe("59970");
  });
});

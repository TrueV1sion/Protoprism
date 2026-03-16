// src/lib/data-sources/clients/cbo.ts
/**
 * CBO (Congressional Budget Office) Client (Layer 1)
 *
 * Internal client for fetching CBO publications via RSS feeds and HTML pages.
 * CBO does not have a formal JSON API, so this client parses RSS/XML feeds
 * and extracts structured content from HTML pages.
 *
 * Ported from mcp-servers/cbo-mcp-server/src/api-client.ts with these changes:
 * - Uses native fetch instead of axios
 * - Uses shared GlobalRateLimiter + TokenBucketLimiter
 * - Returns typed ApiResponse<T> with DataVintage
 */

import type { ApiResponse, DataVintage } from "../types";
import { globalRateLimiter, TokenBucketLimiter } from "../rate-limit";

// ─── Constants ───────────────────────────────────────────────

const BASE_URL = "https://www.cbo.gov";

const ENDPOINTS = {
  SEARCH_RSS: "/search/site",
  PUBLICATIONS_RSS: "/publications/rss",
  COST_ESTIMATES_RSS: "/cost-estimates/rss",
  BUDGET_ECONOMIC_OUTLOOK_RSS: "/publication/58988/rss", // commonly accessed
} as const;

// 3 req/s
const clientLimiter = new TokenBucketLimiter(3);

// ─── Types ───────────────────────────────────────────────────

export interface CBOPublicationItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  publicationId?: string;
}

export interface CBOFeedResult {
  items: CBOPublicationItem[];
  total: number;
}

export interface CBOPublicationDetail {
  title: string;
  url: string;
  publicationId?: string;
  date?: string;
  summary?: string;
  content: string;
  topics?: string[];
}

// ─── XML/RSS Parsing ─────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const cdataPattern = new RegExp(
    `<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
  );
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) return cdataMatch[1].trim();

  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const start = xml.indexOf(openTag);
  if (start === -1) return "";
  const contentStart = start + openTag.length;
  const end = xml.indexOf(closeTag, contentStart);
  if (end === -1) return "";
  return xml.substring(contentStart, end).trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPublicationId(url: string): string | undefined {
  const match = url.match(/\/publication\/(\d+)/);
  return match?.[1];
}

function parseRSSFeed(xml: string): CBOPublicationItem[] {
  const items: CBOPublicationItem[] = [];
  const itemChunks = xml.split(/<item>/);
  for (let i = 1; i < itemChunks.length; i++) {
    const chunk = itemChunks[i];
    const endIdx = chunk.indexOf("</item>");
    const itemXml = endIdx !== -1 ? chunk.substring(0, endIdx) : chunk;

    const title = stripHtml(extractTag(itemXml, "title"));
    const link = extractTag(itemXml, "link");
    const description = stripHtml(extractTag(itemXml, "description"));
    const pubDate = extractTag(itemXml, "pubDate");

    if (title || link) {
      const publicationId = extractPublicationId(link);
      items.push({
        title,
        link,
        description,
        pubDate,
        ...(publicationId ? { publicationId } : {}),
      });
    }
  }
  return items;
}

function extractPageContent(html: string): {
  title: string;
  date: string;
  summary: string;
  content: string;
  topics: string[];
} {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = stripHtml(titleMatch[1])
      .replace(/\s*\|\s*Congressional Budget Office.*$/i, "")
      .trim();
  }
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) title = stripHtml(h1Match[1]);
  }

  let date = "";
  const dateMetaMatch = html.match(
    /<meta\s+(?:name|property)=["'](?:article:published_time|dcterms\.date|date)["']\s+content=["']([^"']+)["']/i,
  );
  if (dateMetaMatch) date = dateMetaMatch[1];

  let summary = "";
  const descMatch = html.match(
    /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*?)["']/i,
  );
  if (descMatch) summary = descMatch[1];

  let content = "";
  const contentPatterns = [
    /<div[^>]*class=["'][^"']*field--name-body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]*class=["'][^"']*node__content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];
  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1].length > 200) {
      content = stripHtml(match[1]);
      break;
    }
  }

  if (!content || content.length < 100) {
    const paragraphs: string[] = [];
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pPattern.exec(html)) !== null) {
      const text = stripHtml(pMatch[1]);
      if (text.length > 20) paragraphs.push(text);
    }
    if (paragraphs.length > 0) content = paragraphs.join("\n\n");
  }

  const topics: string[] = [];
  const topicPattern =
    /<a[^>]*href=["']\/topics\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let topicMatch;
  while ((topicMatch = topicPattern.exec(html)) !== null) {
    const topicName = stripHtml(topicMatch[2]);
    if (topicName && !topics.includes(topicName)) topics.push(topicName);
  }

  return { title, date, summary, content, topics };
}

// ─── Core Request ────────────────────────────────────────────

async function makeRequest(url: string): Promise<{ body: string; status: number }> {
  await globalRateLimiter.acquire();
  try {
    await clientLimiter.acquire();

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Protoprism/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 404) {
      return { body: "", status: 404 };
    }

    if (response.status === 429) {
      throw new Error("CBO rate limit exceeded. Please wait a moment and try again.");
    }

    if (!response.ok) {
      throw new Error(`CBO request failed (HTTP ${response.status})`);
    }

    const body = await response.text();
    return { body, status: response.status };
  } finally {
    globalRateLimiter.release();
  }
}

function makeVintage(): DataVintage {
  return {
    queriedAt: new Date().toISOString(),
    source: "Congressional Budget Office",
  };
}

// ─── Public API ──────────────────────────────────────────────

export const cboClient = {
  async searchPublications(params: {
    query: string;
    limit?: number;
  }): Promise<ApiResponse<CBOFeedResult>> {
    const url = `${BASE_URL}${ENDPOINTS.SEARCH_RSS}/${encodeURIComponent(params.query)}?format=rss`;
    const { body, status } = await makeRequest(url);

    if (status === 404 || !body) {
      return {
        data: { items: [], total: 0 },
        status,
        vintage: makeVintage(),
      };
    }

    const items = parseRSSFeed(body).slice(0, params.limit ?? 25);
    return {
      data: { items, total: items.length },
      status,
      vintage: makeVintage(),
    };
  },

  async getRecentPublications(params: {
    limit?: number;
  } = {}): Promise<ApiResponse<CBOFeedResult>> {
    const url = `${BASE_URL}${ENDPOINTS.PUBLICATIONS_RSS}`;
    const { body, status } = await makeRequest(url);

    if (status === 404 || !body) {
      return {
        data: { items: [], total: 0 },
        status,
        vintage: makeVintage(),
      };
    }

    const items = parseRSSFeed(body).slice(0, params.limit ?? 25);
    return {
      data: { items, total: items.length },
      status,
      vintage: makeVintage(),
    };
  },

  async getCostEstimates(params: {
    limit?: number;
  } = {}): Promise<ApiResponse<CBOFeedResult>> {
    const url = `${BASE_URL}${ENDPOINTS.COST_ESTIMATES_RSS}`;
    const { body, status } = await makeRequest(url);

    if (status === 404 || !body) {
      return {
        data: { items: [], total: 0 },
        status,
        vintage: makeVintage(),
      };
    }

    const items = parseRSSFeed(body).slice(0, params.limit ?? 25);
    return {
      data: { items, total: items.length },
      status,
      vintage: makeVintage(),
    };
  },

  async getPublicationDetail(url: string): Promise<ApiResponse<CBOPublicationDetail>> {
    const { body, status } = await makeRequest(url);

    if (status === 404 || !body) {
      return {
        data: {
          title: "",
          url,
          content: "",
        },
        status,
        vintage: makeVintage(),
      };
    }

    const { title, date, summary, content, topics } = extractPageContent(body);
    const publicationId = extractPublicationId(url);

    return {
      data: {
        title,
        url,
        ...(publicationId ? { publicationId } : {}),
        ...(date ? { date } : {}),
        ...(summary ? { summary } : {}),
        content,
        ...(topics.length > 0 ? { topics } : {}),
      },
      status,
      vintage: makeVintage(),
    };
  },
};

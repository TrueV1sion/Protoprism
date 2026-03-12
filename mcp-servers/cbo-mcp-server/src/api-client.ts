/**
 * CBO API Client
 *
 * HTTP client for fetching and parsing CBO RSS feeds and HTML pages.
 * Handles rate limiting, XML/RSS parsing, HTML text extraction,
 * and response truncation.
 */

import axios, { AxiosError } from "axios";
import {
  CBO_BASE_URL,
  MIN_REQUEST_INTERVAL_MS,
  CHARACTER_LIMIT,
  USER_AGENT,
} from "./constants.js";

// ─── Types ───────────────────────────────────────────────────

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  /** Extracted CBO publication ID from URL, if available */
  publicationId?: string;
}

export interface PublicationDetail {
  title: string;
  url: string;
  publicationId?: string;
  date?: string;
  summary?: string;
  content: string;
  topics?: string[];
}

export interface CostEstimateItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  publicationId?: string;
}

// ─── Rate Limiter ────────────────────────────────────────────

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();
}

// ─── HTTP Fetching ───────────────────────────────────────────

/**
 * Fetch a URL and return the response body as a string.
 */
async function fetchUrl(url: string): Promise<string> {
  await enforceRateLimit();

  try {
    const response = await axios.get<string>(url, {
      timeout: 30000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      responseType: "text",
      maxRedirects: 5,
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 404) {
        throw new Error(`CBO page not found: ${url}`);
      }
      if (status === 429) {
        throw new Error(
          "CBO rate limit exceeded. Please wait a moment and try again.",
        );
      }
      throw new Error(
        `CBO request failed (HTTP ${status ?? "unknown"}): ${error.message}`,
      );
    }
    throw new Error(
      `Unexpected error fetching CBO data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── XML/RSS Parsing ─────────────────────────────────────────

/**
 * Extract text content between XML tags. Returns the first match.
 */
function extractTag(xml: string, tag: string): string {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;

  // Also check for CDATA-wrapped content
  const cdataPattern = new RegExp(
    `<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
  );
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  const start = xml.indexOf(openTag);
  if (start === -1) return "";
  const contentStart = start + openTag.length;
  const end = xml.indexOf(closeTag, contentStart);
  if (end === -1) return "";
  return xml.substring(contentStart, end).trim();
}

/**
 * Parse RSS/XML feed content into an array of RSS items.
 */
export function parseRSSFeed(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Split on <item> tags
  const itemChunks = xml.split(/<item>/);
  // Skip the first chunk (everything before the first <item>)
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

/**
 * Extract a CBO publication ID from a URL.
 * CBO URLs typically look like: https://www.cbo.gov/publication/12345
 */
function extractPublicationId(url: string): string | undefined {
  const match = url.match(/\/publication\/(\d+)/);
  return match?.[1];
}

// ─── HTML Processing ─────────────────────────────────────────

/**
 * Strip HTML tags from a string and decode common HTML entities.
 */
export function stripHtml(html: string): string {
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

/**
 * Extract the main content text from a CBO publication HTML page.
 * Tries to find the main content area and strips HTML tags.
 */
function extractPageContent(html: string): {
  title: string;
  date: string;
  summary: string;
  content: string;
  topics: string[];
} {
  // Extract title from <title> tag or <h1>
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = stripHtml(titleMatch[1]).replace(/\s*\|\s*Congressional Budget Office.*$/i, "").trim();
  }
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = stripHtml(h1Match[1]);
    }
  }

  // Extract date from meta tags or common date patterns
  let date = "";
  const dateMetaMatch = html.match(
    /<meta\s+(?:name|property)=["'](?:article:published_time|dcterms\.date|date)["']\s+content=["']([^"']+)["']/i,
  );
  if (dateMetaMatch) {
    date = dateMetaMatch[1];
  }
  if (!date) {
    const dateSpanMatch = html.match(
      /<(?:span|time|div)[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|time|div)>/i,
    );
    if (dateSpanMatch) {
      date = stripHtml(dateSpanMatch[1]);
    }
  }

  // Extract summary/description from meta tags
  let summary = "";
  const descMatch = html.match(
    /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*?)["']/i,
  );
  if (descMatch) {
    summary = descMatch[1];
  }

  // Extract main content - try several common CBO page content selectors
  let content = "";

  // Try to find the main content area
  const contentPatterns = [
    /<div[^>]*class=["'][^"']*field--name-body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]*class=["'][^"']*node__content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1].length > 200) {
      content = stripHtml(match[1]);
      break;
    }
  }

  // Fallback: extract all paragraph text from the body
  if (!content || content.length < 100) {
    const paragraphs: string[] = [];
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pPattern.exec(html)) !== null) {
      const text = stripHtml(pMatch[1]);
      if (text.length > 20) {
        paragraphs.push(text);
      }
    }
    if (paragraphs.length > 0) {
      content = paragraphs.join("\n\n");
    }
  }

  // Extract topic tags from the page
  const topics: string[] = [];
  const topicPattern =
    /<a[^>]*href=["']\/topics\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let topicMatch;
  while ((topicMatch = topicPattern.exec(html)) !== null) {
    const topicName = stripHtml(topicMatch[2]);
    if (topicName && !topics.includes(topicName)) {
      topics.push(topicName);
    }
  }

  return { title, date, summary, content, topics };
}

// ─── Public API Functions ────────────────────────────────────

/**
 * Fetch and parse the CBO RSS feed for a given URL.
 */
export async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  const xml = await fetchUrl(url);
  return parseRSSFeed(xml);
}

/**
 * Fetch a CBO publication page and extract its content.
 */
export async function fetchPublication(
  url: string,
): Promise<PublicationDetail> {
  const html = await fetchUrl(url);
  const { title, date, summary, content, topics } = extractPageContent(html);
  const publicationId = extractPublicationId(url);

  return {
    title,
    url,
    ...(publicationId ? { publicationId } : {}),
    ...(date ? { date } : {}),
    ...(summary ? { summary } : {}),
    content,
    ...(topics.length > 0 ? { topics } : {}),
  };
}

/**
 * Search CBO publications via the search RSS feed.
 */
export async function searchPublications(
  query: string,
): Promise<RSSItem[]> {
  const url = `${CBO_BASE_URL}/search/site/${encodeURIComponent(query)}?format=rss`;
  const xml = await fetchUrl(url);
  return parseRSSFeed(xml);
}

// ─── Response Truncation ─────────────────────────────────────

/**
 * Truncate a string to the CHARACTER_LIMIT and append a truncation notice.
 */
export function truncateResponse(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= CHARACTER_LIMIT) {
    return { text, truncated: false };
  }
  return {
    text:
      text.substring(0, CHARACTER_LIMIT - 50) +
      "\n\n[Truncated - response exceeded 25,000 character limit]",
    truncated: true,
  };
}

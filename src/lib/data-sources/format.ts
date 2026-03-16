/**
 * Markdown Formatting Helpers
 *
 * Shared utilities for formatting API data into LLM-optimized markdown.
 * Used by all Layer 2 tools and Layer 3 research tools.
 */

import type { Citation } from "./types";

// ─── Markdown Table ──────────────────────────────────────────

/**
 * Format data rows into a markdown table.
 *
 * @param headers Column header names
 * @param rows Array of row arrays (each row has same length as headers)
 * @param maxRows Maximum rows to display (default: no limit)
 * @param totalCount Total matching results (for truncation note)
 */
export function markdownTable(
  headers: string[],
  rows: string[][],
  maxRows?: number,
  totalCount?: number,
): string {
  if (rows.length === 0) {
    return "No results found.";
  }

  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `|${headers.map((h) => "-".repeat(h.length + 2)).join("|")}|`;
  const dataLines = displayRows.map((row) => `| ${row.join(" | ")} |`);

  let result = [headerLine, separatorLine, ...dataLines].join("\n");

  if (maxRows && rows.length > maxRows) {
    const total = totalCount ?? rows.length;
    result += `\n*Showing ${maxRows} of ${total} results. Use more specific filters for complete data.*`;
  }

  return result;
}

// ─── Citation Block ──────────────────────────────────────────

/**
 * Format citations into a standard markdown citation block.
 */
export function formatCitations(citations: Citation[]): string {
  if (citations.length === 0) return "";

  const lines = citations.map((c) => {
    const parts = [`${c.id} Source: ${c.source}`, `query: "${c.query}"`];
    if (c.dateRange) parts.push(`date range: ${c.dateRange}`);
    if (c.resultCount !== undefined) parts.push(`${c.resultCount} results`);
    return parts.join(" | ");
  });

  return `### Citations\n${lines.join("\n")}`;
}

// ─── Smart Truncation ────────────────────────────────────────

/**
 * Truncate content to fit within a character budget.
 * Attempts to truncate at section boundaries to preserve readability.
 */
export function truncateToCharBudget(
  content: string,
  budget: number,
): { content: string; truncated: boolean } {
  if (content.length <= budget) {
    return { content, truncated: false };
  }

  // Try to truncate at a section boundary (### or ##)
  const truncationNote = "\n\n*Response truncated. Use granular tools for detailed data.*";
  const targetLength = budget - truncationNote.length;

  if (targetLength <= 0) {
    return { content: content.slice(0, budget), truncated: true };
  }

  // Find the last section boundary before the target length
  const slice = content.slice(0, targetLength);
  const lastSection = Math.max(
    slice.lastIndexOf("\n### "),
    slice.lastIndexOf("\n## "),
    slice.lastIndexOf("\n\n"),
  );

  const cutPoint = lastSection > 0 ? lastSection : targetLength;
  return {
    content: content.slice(0, cutPoint) + truncationNote,
    truncated: true,
  };
}

// ─── Intelligence Packet Header ──────────────────────────────

/**
 * Format the standard header line for Layer 3 intelligence packets.
 */
export function intelligenceHeader(opts: {
  topic: string;
  subject: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sourcesQueried: number;
  sourcesReturned: number;
  vintage: string;
}): string {
  return [
    `## ${opts.topic}: ${opts.subject}`,
    `**Confidence**: ${opts.confidence} | **Sources**: ${opts.sourcesReturned}/${opts.sourcesQueried} returned data | **Data through**: ${opts.vintage}`,
  ].join("\n");
}

// ─── Value Formatting Helpers ────────────────────────────────

/** Format a number with commas (e.g., 1234567 → "1,234,567") */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Format a date string to YYYY-MM-DD if possible, otherwise return as-is */
export function formatDate(date: string): string {
  // Handle YYYYMMDD format from FDA APIs
  if (/^\d{8}$/.test(date)) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  // Handle ISO dates
  if (date.includes("T")) {
    return date.split("T")[0];
  }
  return date;
}

/** Safely extract a nested value from an object, returning fallback on miss */
export function dig(obj: unknown, path: string, fallback = "—"): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return fallback;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return fallback;
  if (Array.isArray(current)) return current.join(", ");
  return String(current);
}

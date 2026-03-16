// src/lib/data-sources/research/regulatory-landscape.ts
/**
 * research_regulatory_landscape — Layer 3 Intelligence Tool
 *
 * Aggregates Federal Register notices, congressional legislation, GPO documents,
 * and CMS coverage policies into a single regulatory intelligence packet.
 * Uses 3 in-process clients + 1 McpBridge call.
 */

import type { DataSourceTool, ToolResult, ToolCache, McpBridgeResult } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { mcpBridge } from "../mcp-bridge";
import { federalRegisterClient } from "../clients/federal-register";
import { congressGovClient } from "../clients/congress-gov";
import { gpoGovinfoClient } from "../clients/gpo-govinfo";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const regulatoryLandscapeResearchTool: DataSourceTool = {
  name: "research_regulatory_landscape",
  description:
    "Regulatory landscape intelligence: federal register notices, legislative activity, and coverage policy for a topic.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Topic, regulation, or policy area" },
      timeframe: { type: "string", description: "How far back to search: '1y', '3y', '5y' (default '3y')" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["federal-register", "congress-gov", "gpo-govinfo", "cms_coverage"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;
    const timeframe = (input.timeframe as string) ?? "3y";
    const yearsBack = parseInt(timeframe) || 3;

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - yearsBack);
    const dateFromStr = dateFrom.toISOString().slice(0, 10);

    // ─── Parallel API calls ────────────────────────────────────
    const [frResult, congressResult, gpoResult, cmsResult] = await Promise.all([
      federalRegisterClient.searchDocuments({ query, limit: 5, date_from: dateFromStr }).catch(() => null),
      congressGovClient.searchBills({ query, limit: 5 }).catch(() => null),
      gpoGovinfoClient.search({ query, pageSize: 5 }).catch(() => null),
      mcpBridge
        .call("cms_coverage", "search_national_coverage", { keyword: query, limit: 5 })
        .catch((): McpBridgeResult => ({ available: false, server: "cms_coverage", toolName: "search_national_coverage", error: "call failed" })),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const frTotal = frResult?.data.total ?? 0;
    const frDocs = frResult?.data.results ?? [];

    const congressData = congressResult?.data?.data as Record<string, unknown> | null;
    const bills = (congressData?.bills ?? []) as Record<string, unknown>[];
    const billCount = congressResult?.data?.pagination?.count ?? bills.length;

    const gpoTotal = gpoResult?.data.totalCount ?? gpoResult?.data.count ?? 0;
    const gpoPackages = gpoResult?.data.packages ?? [];

    let cmsCount = 0;
    if (cmsResult.available && cmsResult.data) {
      try {
        const parsed = JSON.parse(cmsResult.data) as Record<string, unknown>;
        const results = (parsed.results ?? parsed.ncds ?? []) as unknown[];
        cmsCount = Array.isArray(results) ? results.length : 0;
      } catch {
        cmsCount = 0;
      }
    }

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (frTotal > 0 || frDocs.length > 0) sourcesReturned++;
    if (billCount > 0 || bills.length > 0) sourcesReturned++;
    if (gpoTotal > 0 || gpoPackages.length > 0) sourcesReturned++;
    if (cmsResult.available) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Regulatory Landscape",
      subject: query,
      confidence,
      sourcesQueried: 4,
      sourcesReturned,
      vintage: frResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(frTotal)}** Federal Register documents in the last ${yearsBack} years`);
    bullets.push(`- **${formatNumber(billCount)}** congressional bills/activity found`);
    bullets.push(`- **${formatNumber(gpoTotal)}** GPO GovInfo documents found`);
    if (cmsResult.available) {
      bullets.push(`- **${formatNumber(cmsCount)}** CMS national coverage policies found`);
    } else {
      bullets.push(`- ⚠️ CMS coverage data unavailable`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Federal Register notices table
    if (frDocs.length > 0) {
      const rows = frDocs.slice(0, 5).map((doc) => [
        String(doc.publication_date ?? "—").slice(0, 10),
        String(doc.type ?? "—"),
        String(doc.title ?? "—").slice(0, 60),
      ]);
      sections.push(`### Federal Register Notices\n${markdownTable(["Date", "Type", "Title"], rows, 5, frTotal)}`);
    }

    // Congressional bills
    if (bills.length > 0) {
      const rows = bills.slice(0, 5).map((b) => [
        String(b.number ?? "—"),
        String(b.title ?? "—").slice(0, 60),
        String(b.latestAction?.actionDate ?? "—").slice(0, 10),
      ]);
      sections.push(`### Congressional Bills\n${markdownTable(["Number", "Title", "Latest Action"], rows, 5, billCount)}`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[FR-${ts}]`,
        source: "Federal Register",
        query,
        resultCount: frTotal,
      },
      {
        id: `[CONGRESS-${ts}]`,
        source: "Congress.gov",
        query,
        resultCount: billCount,
      },
      {
        id: `[GPO-${ts}]`,
        source: "GPO GovInfo",
        query,
        resultCount: gpoTotal,
      },
      {
        id: `[CMS-${ts}]`,
        source: "CMS National Coverage Determinations",
        query,
        resultCount: cmsCount,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: frResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "Federal Register" },
      confidence,
      truncated,
    };
  },
};

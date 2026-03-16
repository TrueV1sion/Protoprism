// src/lib/data-sources/research/legislative-status.ts
/**
 * research_legislative_status — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates legislative data from Congress.gov,
 * government publications from GPO GovInfo, and CBO cost estimate reports
 * into a single intelligence packet.
 * Makes 3 parallel Layer 1 API calls per invocation.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { congressGovClient } from "../clients/congress-gov";
import { gpoGovinfoClient } from "../clients/gpo-govinfo";
import { cboClient } from "../clients/cbo";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  dig,
  truncateToCharBudget,
} from "../format";

export const legislativeStatusResearchTool: DataSourceTool = {
  name: "research_legislative_status",
  description:
    "Legislative status intelligence: relevant bills, CBO cost estimates, " +
    "and government publications.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Policy topic to research" },
      timeframe: {
        type: "string",
        description: "How far back to search: '1y', '3y', '5y' (default '3y')",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["congress-gov", "gpo-govinfo", "cbo"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const policyTopic = input.query as string;

    // ─── Parallel API calls ────────────────────────────────────
    const [billsResult, govInfoResult, cboResult] = await Promise.all([
      congressGovClient.searchBills({ query: policyTopic, limit: 5 }).catch(() => null),
      gpoGovinfoClient.search({ query: policyTopic, pageSize: 5 }).catch(() => null),
      cboClient.searchPublications({ query: policyTopic, limit: 5 }).catch(() => null),
    ]);

    // ─── Extract insights ──────────────────────────────────────
    const billsBody = billsResult?.data.data as Record<string, unknown> | null;
    const billsList = (
      (billsBody?.bills as Record<string, unknown>[]) ?? []
    ).slice(0, 5);
    const billsCount = (billsResult?.data.pagination?.count ?? billsList.length) as number;

    const govInfoTotal = govInfoResult?.data.totalCount ?? 0;
    const govInfoPackages = govInfoResult?.data.packages ?? [];

    const cboTotal = cboResult?.data.total ?? 0;
    const cboItems = cboResult?.data.items ?? [];

    // First bill details
    const firstBill = billsList[0] as Record<string, unknown> | undefined;
    const recentBillTitle = firstBill
      ? String(dig(firstBill, "title", "Untitled")).slice(0, 80)
      : "No bills found";
    const recentBillStatus = firstBill
      ? String(
          dig(firstBill, "latestAction.text", dig(firstBill, "latestAction.actionDate", "—")),
        ).slice(0, 60)
      : "—";

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (billsCount > 0) sourcesReturned++;
    if (govInfoTotal > 0) sourcesReturned++;
    if (cboTotal > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Legislative Status",
      subject: policyTopic,
      confidence,
      sourcesQueried: 3,
      sourcesReturned,
      vintage: billsResult?.vintage.queriedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(billsCount)}** relevant bills found in Congress.gov`);
    if (firstBill) {
      bullets.push(`- Most recent: "${recentBillTitle}"`);
      bullets.push(`- Status: ${recentBillStatus}`);
    }
    bullets.push(`- **${formatNumber(cboTotal)}** CBO publication(s) found`);
    bullets.push(`- **${formatNumber(govInfoTotal)}** GovInfo document(s) found`);

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Recent bills table
    if (billsList.length > 0) {
      const billRows = billsList.slice(0, 5).map((b) => {
        const bill = b as Record<string, unknown>;
        const billType = String(bill.type ?? "—");
        const billNumber = String(bill.number ?? "—");
        const billTitle = String(dig(bill, "title", "Untitled")).slice(0, 50);
        const billDate = String(
          dig(bill, "latestAction.actionDate", dig(bill, "updateDate", "—")),
        ).slice(0, 10);
        return [`${billType} ${billNumber}`, billTitle, billDate];
      });
      sections.push(
        `### Recent Bills\n${markdownTable(
          ["Bill", "Title", "Date"],
          billRows,
          5,
          billsCount,
        )}`,
      );
    }

    // CBO publications
    if (cboItems.length > 0) {
      const cboRows = cboItems.slice(0, 4).map((item) => [
        String(item.title ?? "—").slice(0, 60),
        String(item.pubDate ?? "—").slice(0, 20),
      ]);
      sections.push(
        `### CBO Publications\n${markdownTable(
          ["Title", "Date"],
          cboRows,
          4,
          cboTotal,
        )}`,
      );
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[CONGRESS-${ts}]`,
        source: "Congress.gov",
        query: policyTopic,
        resultCount: billsCount,
      },
      {
        id: `[GOVINFO-${ts}]`,
        source: "GPO GovInfo",
        query: policyTopic,
        resultCount: govInfoTotal,
      },
      {
        id: `[CBO-${ts}]`,
        source: "Congressional Budget Office",
        query: policyTopic,
        resultCount: cboTotal,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: billsResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "Congress.gov" },
      confidence,
      truncated,
    };
  },
};

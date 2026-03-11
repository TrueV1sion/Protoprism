/**
 * Congress.gov MCP Server
 *
 * Provides legislative data tools for the Protoprism healthcare AI research
 * platform. Supports bill search, member lookup, committee tracking, and
 * hearing search via the Congress.gov v3 API.
 *
 * Intended archetypes: LEGISLATIVE-PIPELINE, REGULATORY-RADAR,
 * ANALYST-STRATEGIC, MACRO-CONTEXT
 *
 * Transport: stdio (default) or HTTP (--http flag with optional --port)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { CongressApiClient, CongressApiClientError } from "./api-client.js";
import {
  SERVER_NAME,
  SERVER_VERSION,
  CHARACTER_LIMIT,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DEFAULT_ACTIONS_LIMIT,
  BILL_TYPES,
  BILL_TYPE_LABELS,
  CHAMBERS,
  COMMITTEE_CHAMBERS,
  PARTIES,
  BILL_SORT_OPTIONS,
  HEALTHCARE_COMMITTEES,
} from "./constants.js";

// ─── Startup Validation ─────────────────────────────────────

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
if (!CONGRESS_API_KEY) {
  console.error(
    "ERROR: CONGRESS_API_KEY environment variable is required.\n" +
      "Get a free API key at https://api.congress.gov/sign-up/"
  );
  process.exit(1);
}

const apiClient = new CongressApiClient(CONGRESS_API_KEY);

// ─── Helpers ────────────────────────────────────────────────

function truncate(text: string, limit: number = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n\n[Output truncated at character limit]";
}

function toolError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function toolResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: truncate(text) }],
  };
}

function handleApiError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof CongressApiClientError) {
    return toolError(`Congress.gov API error (${error.status}): ${error.message}`);
  }
  if (error instanceof Error) {
    return toolError(`Error: ${error.message}`);
  }
  return toolError("An unknown error occurred");
}

// Safe extraction helpers for untyped API responses
function safeGet(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ─── Formatters ─────────────────────────────────────────────

function formatBillSummary(bill: unknown): string {
  const type = safeString(safeGet(bill, "type")).toLowerCase();
  const number = safeString(safeGet(bill, "number"));
  const congress = safeString(safeGet(bill, "congress"));
  const title = safeString(safeGet(bill, "title"));
  const introducedDate = safeString(safeGet(bill, "introducedDate"));
  const updateDate = safeString(safeGet(bill, "updateDate"));
  const originChamber = safeString(safeGet(bill, "originChamber"));

  const latestAction = safeGet(bill, "latestAction");
  const latestActionText = safeString(safeGet(latestAction, "text"));
  const latestActionDate = safeString(safeGet(latestAction, "actionDate"));

  const sponsors = safeArray(safeGet(bill, "sponsors"));
  const sponsorLines = sponsors.map((s) => {
    const name = safeString(safeGet(s, "fullName") ?? safeGet(s, "firstName"));
    const party = safeString(safeGet(s, "party"));
    const state = safeString(safeGet(s, "state"));
    return party && state ? `${name} (${party}-${state})` : name;
  });

  const typeLabel = BILL_TYPE_LABELS[type as keyof typeof BILL_TYPE_LABELS] ?? type.toUpperCase();

  const lines: string[] = [
    `## ${typeLabel} ${number} (${congress}th Congress)`,
    "",
    `**Title:** ${title}`,
  ];

  if (sponsorLines.length > 0) {
    lines.push(`**Sponsor(s):** ${sponsorLines.join(", ")}`);
  }
  if (originChamber) lines.push(`**Origin Chamber:** ${originChamber}`);
  if (introducedDate) lines.push(`**Introduced:** ${introducedDate}`);
  if (updateDate) lines.push(`**Last Updated:** ${updateDate}`);
  if (latestActionText) {
    lines.push(`**Latest Action (${latestActionDate}):** ${latestActionText}`);
  }

  return lines.join("\n");
}

function formatBillDetail(data: unknown): string {
  const bill = safeGet(data, "bill") ?? data;
  const base = formatBillSummary(bill);

  const lines: string[] = [base, ""];

  // Policy area
  const policyArea = safeString(safeGet(bill, "policyArea", "name"));
  if (policyArea) lines.push(`**Policy Area:** ${policyArea}`);

  // Committees
  const committees = safeGet(bill, "committees");
  const committeeUrl = safeString(safeGet(committees, "url"));
  const committeeCount = safeGet(committees, "count");
  if (committeeCount) {
    lines.push(`**Committees:** ${committeeCount} committee(s) referred`);
  }

  // Cosponsors
  const cosponsors = safeGet(bill, "cosponsors");
  const cosponsorCount = safeGet(cosponsors, "count");
  if (cosponsorCount !== undefined) {
    lines.push(`**Cosponsors:** ${cosponsorCount}`);
  }

  // Actions summary
  const actions = safeGet(bill, "actions");
  const actionCount = safeGet(actions, "count");
  if (actionCount !== undefined) {
    lines.push(`**Total Actions:** ${actionCount}`);
  }

  // Subjects
  const subjects = safeGet(bill, "subjects");
  const subjectUrl = safeString(safeGet(subjects, "url"));
  if (subjectUrl) {
    lines.push(`**Subjects URL:** ${subjectUrl}`);
  }

  // Constitutional authority
  const constitutionalAuth = safeString(
    safeGet(bill, "constitutionalAuthorityStatementText")
  );
  if (constitutionalAuth) {
    lines.push(`**Constitutional Authority:** ${constitutionalAuth.slice(0, 200)}`);
  }

  // Laws
  const laws = safeArray(safeGet(bill, "laws"));
  if (laws.length > 0) {
    const lawLines = laws.map(
      (l) => `  - ${safeString(safeGet(l, "type"))} ${safeString(safeGet(l, "number"))}`
    );
    lines.push(`**Enacted Laws:**\n${lawLines.join("\n")}`);
  }

  // Related bills
  const relatedBills = safeGet(bill, "relatedBills");
  const relatedCount = safeGet(relatedBills, "count");
  if (relatedCount !== undefined && Number(relatedCount) > 0) {
    lines.push(`**Related Bills:** ${relatedCount}`);
  }

  // Summaries
  const summaries = safeGet(bill, "summaries");
  const summaryUrl = safeString(safeGet(summaries, "url"));
  if (summaryUrl) {
    lines.push(`**Summaries URL:** ${summaryUrl}`);
  }

  // Text versions
  const textVersions = safeGet(bill, "textVersions");
  const textCount = safeGet(textVersions, "count");
  if (textCount !== undefined) {
    lines.push(`**Text Versions:** ${textCount}`);
  }

  // CB0 cost estimates
  const cboCostEstimates = safeArray(safeGet(bill, "cboCostEstimates"));
  if (cboCostEstimates.length > 0) {
    lines.push("**CBO Cost Estimates:**");
    for (const est of cboCostEstimates.slice(0, 3)) {
      const title = safeString(safeGet(est, "title"));
      const pubDate = safeString(safeGet(est, "pubDate"));
      const url = safeString(safeGet(est, "url"));
      lines.push(`  - ${title} (${pubDate})${url ? ` [Link](${url})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatAction(action: unknown): string {
  const date = safeString(safeGet(action, "actionDate"));
  const text = safeString(safeGet(action, "text"));
  const actionType = safeString(safeGet(action, "type"));
  const chamber = safeString(safeGet(action, "actionCode"));

  const committee = safeGet(action, "committee");
  const committeeName = safeString(safeGet(committee, "name"));

  let line = `- **${date}**`;
  if (actionType) line += ` [${actionType}]`;
  line += `: ${text}`;
  if (committeeName) line += ` (Committee: ${committeeName})`;

  return line;
}

function formatMember(member: unknown): string {
  const name = safeString(safeGet(member, "name") ?? safeGet(member, "directOrderName"));
  const bioguideId = safeString(safeGet(member, "bioguideId"));
  const state = safeString(safeGet(member, "state"));
  const party = safeString(safeGet(member, "partyName"));
  const district = safeGet(member, "district");
  const chamber = safeString(safeGet(member, "terms", "item")?.toString() ?? "");

  // Current member info
  const depiction = safeGet(member, "depiction");
  const imageUrl = safeString(safeGet(depiction, "imageUrl"));

  const terms = safeArray(safeGet(member, "terms") ?? safeGet(member, "terms", "item"));

  const lines: string[] = [`### ${name}`];
  if (bioguideId) lines.push(`**Bioguide ID:** ${bioguideId}`);
  if (party) lines.push(`**Party:** ${party}`);
  if (state) lines.push(`**State:** ${state}`);
  if (district) lines.push(`**District:** ${district}`);

  return lines.join("\n");
}

function formatCommittee(committee: unknown): string {
  const name = safeString(safeGet(committee, "name"));
  const chamber = safeString(safeGet(committee, "chamber"));
  const systemCode = safeString(safeGet(committee, "systemCode"));
  const committeeTypeCode = safeString(safeGet(committee, "committeeTypeCode"));
  const parent = safeGet(committee, "parent");
  const parentName = safeString(safeGet(parent, "name"));
  const url = safeString(safeGet(committee, "url"));

  // Check if healthcare-relevant
  const isHealthcareRelevant = HEALTHCARE_COMMITTEES.some((hc) =>
    name.toLowerCase().includes(hc.toLowerCase().split(" ")[1] ?? "")
  );

  const lines: string[] = [`### ${name}${isHealthcareRelevant ? " [HEALTHCARE]" : ""}`];
  if (chamber) lines.push(`**Chamber:** ${chamber}`);
  if (systemCode) lines.push(`**System Code:** ${systemCode}`);
  if (parentName) lines.push(`**Parent Committee:** ${parentName}`);
  if (url) lines.push(`**Details:** ${url}`);

  // Subcommittees
  const subcommittees = safeArray(safeGet(committee, "subcommittees"));
  if (subcommittees.length > 0) {
    lines.push("**Subcommittees:**");
    for (const sub of subcommittees.slice(0, 10)) {
      const subName = safeString(safeGet(sub, "name"));
      const subCode = safeString(safeGet(sub, "systemCode"));
      lines.push(`  - ${subName}${subCode ? ` (${subCode})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatHearing(hearing: unknown): string {
  const title = safeString(
    safeGet(hearing, "title") ?? safeGet(hearing, "description")
  );
  const date = safeString(safeGet(hearing, "date"));
  const chamber = safeString(safeGet(hearing, "chamber"));
  const congress = safeString(safeGet(hearing, "congress"));
  const number = safeString(safeGet(hearing, "number") ?? safeGet(hearing, "jacketNumber"));
  const url = safeString(safeGet(hearing, "url"));

  const committees = safeArray(safeGet(hearing, "committees"));
  const committeeNames = committees.map((c) => safeString(safeGet(c, "name")));

  const lines: string[] = [`### ${title || "Untitled Hearing"}`];
  if (date) lines.push(`**Date:** ${date}`);
  if (chamber) lines.push(`**Chamber:** ${chamber}`);
  if (congress) lines.push(`**Congress:** ${congress}th`);
  if (number) lines.push(`**Number:** ${number}`);
  if (committeeNames.length > 0) {
    lines.push(`**Committee(s):** ${committeeNames.join(", ")}`);
  }
  if (url) lines.push(`**Details:** ${url}`);

  return lines.join("\n");
}

// ─── MCP Server Setup ───────────────────────────────────────

const server = new McpServer(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tool 1: congress_search_bills ──────────────────────────

server.registerTool(
  "congress_search_bills",
  {
    title: "Search Congressional Bills",
    description:
      "Search for bills and legislation in Congress.gov. Filter by keyword, congress number, " +
      "bill type, date range, and sort order. Returns bill titles, sponsors, status, and latest actions. " +
      "Useful for tracking healthcare legislation, regulatory changes, and policy trends.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search keyword or phrase (e.g., 'Medicare', 'drug pricing')"),
      congress: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Congress number (e.g., 118 for 118th Congress, 2023-2025)"),
      bill_type: z
        .enum(BILL_TYPES)
        .optional()
        .describe("Bill type: hr (House Bill), s (Senate Bill), hjres (House Joint Resolution), sjres (Senate Joint Resolution)"),
      from_date: z
        .string()
        .optional()
        .describe("Filter bills updated after this date (YYYY-MM-DDT00:00:00Z format)"),
      to_date: z
        .string()
        .optional()
        .describe("Filter bills updated before this date (YYYY-MM-DDT00:00:00Z format)"),
      sort: z
        .enum(BILL_SORT_OPTIONS)
        .optional()
        .describe("Sort order: updateDate (most recently updated) or latestAction (most recent action)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe("Maximum number of results to return (1-100, default 20)"),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of results to skip for pagination"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const data = await apiClient.searchBills({
        query: args.query,
        congress: args.congress,
        billType: args.bill_type,
        fromDateTime: args.from_date,
        toDateTime: args.to_date,
        sort: args.sort,
        limit: args.limit,
        offset: args.offset,
      });

      const bills = safeArray(safeGet(data, "bills"));

      if (bills.length === 0) {
        return toolResult("No bills found matching the search criteria.");
      }

      const pagination = safeGet(data, "pagination");
      const totalCount = safeGet(pagination, "count");

      const header = [
        `# Congressional Bills Search Results`,
        "",
        `**Results:** ${bills.length}${totalCount !== undefined ? ` of ${totalCount} total` : ""}`,
        args.query ? `**Query:** "${args.query}"` : "",
        args.congress ? `**Congress:** ${args.congress}th` : "",
        args.bill_type ? `**Type:** ${BILL_TYPE_LABELS[args.bill_type]}` : "",
        "",
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      const billTexts = bills.map((bill) => formatBillSummary(bill));

      return toolResult(header + billTexts.join("\n\n---\n\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Tool 2: congress_get_bill ──────────────────────────────

server.registerTool(
  "congress_get_bill",
  {
    title: "Get Bill Details",
    description:
      "Get detailed information for a specific congressional bill including full title, sponsors, " +
      "cosponsors, committee referrals, actions, related bills, subjects, and CBO cost estimates. " +
      "Use this after searching to get comprehensive bill data.",
    inputSchema: z.object({
      congress: z
        .number()
        .int()
        .min(1)
        .max(200)
        .describe("Congress number (e.g., 118)"),
      bill_type: z
        .enum(BILL_TYPES)
        .describe("Bill type: hr, s, hjres, or sjres"),
      bill_number: z
        .number()
        .int()
        .min(1)
        .describe("Bill number (e.g., 3935)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      // Fetch bill details and supplementary data in parallel
      const [billData, actionsData, committeesData, cosponsorsData, subjectsData, relatedData] =
        await Promise.allSettled([
          apiClient.getBill(args.congress, args.bill_type, args.bill_number),
          apiClient.getBillActions(args.congress, args.bill_type, args.bill_number, 10),
          apiClient.getBillCommittees(args.congress, args.bill_type, args.bill_number),
          apiClient.getBillCosponsors(args.congress, args.bill_type, args.bill_number),
          apiClient.getBillSubjects(args.congress, args.bill_type, args.bill_number),
          apiClient.getBillRelatedBills(args.congress, args.bill_type, args.bill_number),
        ]);

      if (billData.status === "rejected") {
        return toolError(
          `Failed to fetch bill ${args.bill_type.toUpperCase()} ${args.bill_number}: ${billData.reason}`
        );
      }

      const sections: string[] = [];

      // Main bill detail
      sections.push(formatBillDetail(billData.value));

      // Recent actions
      if (actionsData.status === "fulfilled") {
        const actions = safeArray(safeGet(actionsData.value, "actions"));
        if (actions.length > 0) {
          sections.push("\n## Recent Actions\n");
          sections.push(actions.slice(0, 10).map(formatAction).join("\n"));
        }
      }

      // Committees
      if (committeesData.status === "fulfilled") {
        const committees = safeArray(safeGet(committeesData.value, "committees"));
        if (committees.length > 0) {
          sections.push("\n## Committees\n");
          for (const comm of committees) {
            const name = safeString(safeGet(comm, "name"));
            const chamber = safeString(safeGet(comm, "chamber"));
            const activities = safeArray(safeGet(comm, "activities"));
            const activityText = activities
              .map(
                (a) =>
                  `${safeString(safeGet(a, "name"))} (${safeString(safeGet(a, "date"))})`
              )
              .join(", ");

            const isHealthcare = HEALTHCARE_COMMITTEES.some((hc) =>
              name.toLowerCase().includes(hc.toLowerCase().split(" ").slice(1).join(" ").toLowerCase())
            );
            sections.push(
              `- **${name}**${isHealthcare ? " [HEALTHCARE]" : ""} (${chamber})${activityText ? `: ${activityText}` : ""}`
            );
          }
        }
      }

      // Cosponsors
      if (cosponsorsData.status === "fulfilled") {
        const cosponsors = safeArray(safeGet(cosponsorsData.value, "cosponsors"));
        if (cosponsors.length > 0) {
          sections.push(`\n## Cosponsors (${cosponsors.length})\n`);
          for (const cs of cosponsors.slice(0, 20)) {
            const name = safeString(safeGet(cs, "fullName"));
            const party = safeString(safeGet(cs, "party"));
            const state = safeString(safeGet(cs, "state"));
            const sponsorDate = safeString(safeGet(cs, "sponsorshipDate"));
            sections.push(`- ${name} (${party}-${state}) - sponsored ${sponsorDate}`);
          }
          if (cosponsors.length > 20) {
            sections.push(`- ... and ${cosponsors.length - 20} more cosponsors`);
          }
        }
      }

      // Subjects
      if (subjectsData.status === "fulfilled") {
        const subjects = safeGet(subjectsData.value, "subjects");
        const legislativeSubjects = safeArray(safeGet(subjects, "legislativeSubjects"));
        const policyArea = safeString(safeGet(subjects, "policyArea", "name"));

        if (policyArea || legislativeSubjects.length > 0) {
          sections.push("\n## Subjects\n");
          if (policyArea) sections.push(`**Policy Area:** ${policyArea}`);
          if (legislativeSubjects.length > 0) {
            sections.push("**Legislative Subjects:**");
            for (const subj of legislativeSubjects.slice(0, 20)) {
              sections.push(`  - ${safeString(safeGet(subj, "name"))}`);
            }
          }
        }
      }

      // Related Bills
      if (relatedData.status === "fulfilled") {
        const relatedBills = safeArray(safeGet(relatedData.value, "relatedBills"));
        if (relatedBills.length > 0) {
          sections.push(`\n## Related Bills (${relatedBills.length})\n`);
          for (const rb of relatedBills.slice(0, 10)) {
            const rbType = safeString(safeGet(rb, "type"));
            const rbNumber = safeString(safeGet(rb, "number"));
            const rbCongress = safeString(safeGet(rb, "congress"));
            const rbTitle = safeString(safeGet(rb, "title"));
            const rbRelationship = safeString(
              safeGet(rb, "relationshipDetails", "0", "type") ??
                safeGet(rb, "latestAction", "text")
            );
            sections.push(
              `- **${rbType?.toUpperCase()} ${rbNumber}** (${rbCongress}th): ${rbTitle}${rbRelationship ? ` [${rbRelationship}]` : ""}`
            );
          }
        }
      }

      return toolResult(sections.join("\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Tool 3: congress_get_bill_actions ──────────────────────

server.registerTool(
  "congress_get_bill_actions",
  {
    title: "Get Bill Actions/History",
    description:
      "Get the full chronological list of actions taken on a specific bill, including " +
      "introductions, committee referrals, votes, amendments, and enactment. " +
      "Essential for tracking legislative progress of healthcare-related bills.",
    inputSchema: z.object({
      congress: z
        .number()
        .int()
        .min(1)
        .max(200)
        .describe("Congress number (e.g., 118)"),
      bill_type: z
        .enum(BILL_TYPES)
        .describe("Bill type: hr, s, hjres, or sjres"),
      bill_number: z
        .number()
        .int()
        .min(1)
        .describe("Bill number (e.g., 3935)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(250)
        .default(DEFAULT_ACTIONS_LIMIT)
        .describe("Maximum number of actions to return (1-250, default 50)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const data = await apiClient.getBillActions(
        args.congress,
        args.bill_type,
        args.bill_number,
        args.limit
      );

      const actions = safeArray(safeGet(data, "actions"));

      if (actions.length === 0) {
        return toolResult(
          `No actions found for ${args.bill_type.toUpperCase()} ${args.bill_number} (${args.congress}th Congress).`
        );
      }

      const typeLabel =
        BILL_TYPE_LABELS[args.bill_type as keyof typeof BILL_TYPE_LABELS] ?? args.bill_type.toUpperCase();

      const header = [
        `# Actions for ${typeLabel} ${args.bill_number} (${args.congress}th Congress)`,
        "",
        `**Total Actions:** ${actions.length}`,
        "",
        "---",
        "",
      ].join("\n");

      const actionTexts = actions.map(formatAction);

      return toolResult(header + actionTexts.join("\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Tool 4: congress_search_members ────────────────────────

server.registerTool(
  "congress_search_members",
  {
    title: "Search Members of Congress",
    description:
      "Search for current and past members of Congress by name, state, party, or chamber. " +
      "Returns member names, party affiliation, state, and district. " +
      "Useful for identifying sponsors/cosponsors of healthcare legislation.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search by member name (e.g., 'Pelosi', 'Sanders')"),
      state: z
        .string()
        .length(2)
        .optional()
        .describe("Two-letter state code (e.g., 'CA', 'NY', 'TX')"),
      party: z
        .enum(PARTIES)
        .optional()
        .describe("Party: D (Democrat), R (Republican), I (Independent)"),
      chamber: z
        .enum(CHAMBERS)
        .optional()
        .describe("Chamber: house or senate"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe("Maximum number of results (1-100, default 20)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const data = await apiClient.searchMembers({
        query: args.query,
        state: args.state,
        party: args.party,
        chamber: args.chamber,
        limit: args.limit,
      });

      const members = safeArray(safeGet(data, "members"));

      if (members.length === 0) {
        return toolResult("No members found matching the search criteria.");
      }

      const pagination = safeGet(data, "pagination");
      const totalCount = safeGet(pagination, "count");

      // Filter by party and chamber client-side (API support varies)
      let filteredMembers = members;
      if (args.party) {
        filteredMembers = filteredMembers.filter((m) => {
          const partyName = safeString(safeGet(m, "partyName")).toLowerCase();
          const partyMap: Record<string, string> = {
            D: "democrat",
            R: "republican",
            I: "independent",
          };
          return partyName.includes(partyMap[args.party!] ?? "");
        });
      }

      const header = [
        `# Members of Congress Search Results`,
        "",
        `**Results:** ${filteredMembers.length}${totalCount !== undefined ? ` of ${totalCount} total` : ""}`,
        args.query ? `**Query:** "${args.query}"` : "",
        args.state ? `**State:** ${args.state}` : "",
        args.party ? `**Party:** ${args.party}` : "",
        args.chamber ? `**Chamber:** ${args.chamber}` : "",
        "",
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      const memberTexts = filteredMembers.map(formatMember);

      return toolResult(header + memberTexts.join("\n\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Tool 5: congress_search_committees ─────────────────────

server.registerTool(
  "congress_search_committees",
  {
    title: "Search Congressional Committees",
    description:
      "Search congressional committees by name or chamber. Returns committee names, " +
      "chamber, system codes, and subcommittees. Healthcare-relevant committees " +
      "(Senate HELP, Senate Finance, House Energy & Commerce, House Ways & Means) " +
      "are tagged with [HEALTHCARE] for easy identification.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search keyword (e.g., 'health', 'finance', 'energy')"),
      chamber: z
        .enum(COMMITTEE_CHAMBERS)
        .optional()
        .describe("Chamber: house, senate, or joint"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe("Maximum number of results (1-100, default 20)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const data = await apiClient.searchCommittees({
        query: args.query,
        chamber: args.chamber,
        limit: args.limit,
      });

      const committees = safeArray(safeGet(data, "committees"));

      if (committees.length === 0) {
        return toolResult("No committees found matching the search criteria.");
      }

      const pagination = safeGet(data, "pagination");
      const totalCount = safeGet(pagination, "count");

      const header = [
        `# Congressional Committees Search Results`,
        "",
        `**Results:** ${committees.length}${totalCount !== undefined ? ` of ${totalCount} total` : ""}`,
        args.query ? `**Query:** "${args.query}"` : "",
        args.chamber ? `**Chamber:** ${args.chamber}` : "",
        "",
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      const committeeTexts = committees.map(formatCommittee);

      return toolResult(header + committeeTexts.join("\n\n---\n\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Tool 6: congress_search_hearings ───────────────────────

server.registerTool(
  "congress_search_hearings",
  {
    title: "Search Congressional Hearings",
    description:
      "Search congressional hearings by keyword, congress number, and chamber. " +
      "Returns hearing titles, dates, committees, and chamber information. " +
      "Useful for tracking healthcare policy discussions, FDA oversight hearings, " +
      "and CMS-related committee testimony.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search keyword (e.g., 'Medicare', 'FDA', 'drug pricing')"),
      congress: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Congress number (e.g., 118)"),
      chamber: z
        .enum(COMMITTEE_CHAMBERS)
        .optional()
        .describe("Chamber: house, senate, or joint"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe("Maximum number of results (1-100, default 20)"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const data = await apiClient.searchHearings({
        query: args.query,
        congress: args.congress,
        chamber: args.chamber,
        limit: args.limit,
      });

      const hearings = safeArray(safeGet(data, "hearings"));

      if (hearings.length === 0) {
        return toolResult("No hearings found matching the search criteria.");
      }

      const pagination = safeGet(data, "pagination");
      const totalCount = safeGet(pagination, "count");

      const header = [
        `# Congressional Hearings Search Results`,
        "",
        `**Results:** ${hearings.length}${totalCount !== undefined ? ` of ${totalCount} total` : ""}`,
        args.query ? `**Query:** "${args.query}"` : "",
        args.congress ? `**Congress:** ${args.congress}th` : "",
        args.chamber ? `**Chamber:** ${args.chamber}` : "",
        "",
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      const hearingTexts = hearings.map(formatHearing);

      return toolResult(header + hearingTexts.join("\n\n---\n\n"));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ─── Transport Selection & Startup ──────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useHttp = args.includes("--http");

  if (useHttp) {
    // HTTP/SSE transport mode
    const portFlag = args.find((a) => a.startsWith("--port="));
    const port = portFlag ? parseInt(portFlag.split("=")[1]!, 10) : 3002;

    // Track active SSE transports by session ID
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (url.pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION }));
        return;
      }

      // SSE endpoint - client connects here for events
      if (url.pathname === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        transport.onclose = () => {
          transports.delete(transport.sessionId);
        };

        await server.connect(transport);
        return;
      }

      // Message endpoint - client POSTs JSON-RPC messages here
      if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId || !transports.has(sessionId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
          return;
        }

        const transport = transports.get(sessionId)!;
        await transport.handlePostMessage(req, res);
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    httpServer.listen(port, () => {
      console.error(`${SERVER_NAME} v${SERVER_VERSION} running on http://localhost:${port}`);
      console.error(`  SSE endpoint: http://localhost:${port}/sse`);
      console.error(`  Message endpoint: http://localhost:${port}/messages`);
      console.error(`  Health check: http://localhost:${port}/health`);
    });
  } else {
    // Stdio transport mode (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

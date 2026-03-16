// src/lib/data-sources/research/provider-landscape.ts
/**
 * research_provider_landscape — Layer 3 Intelligence Tool
 *
 * Aggregates NPI provider registry data and Census Bureau population
 * context into a single provider distribution intelligence packet.
 * Uses 1 McpBridge call + 1 in-process client.
 */

import type { DataSourceTool, ToolResult, ToolCache, McpBridgeResult } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import { mcpBridge } from "../mcp-bridge";
import { censusBureauClient } from "../clients/census-bureau";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

export const providerLandscapeResearchTool: DataSourceTool = {
  name: "research_provider_landscape",
  description:
    "Provider landscape intelligence: healthcare provider distribution and demographic context.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Provider specialty or location" },
      timeframe: { type: "string", description: "Optional timeframe context" },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["npi_registry", "census-bureau"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const query = input.query as string;

    // ─── Parallel API calls ────────────────────────────────────
    const [npiResult, censusResult] = await Promise.all([
      mcpBridge
        .call("npi_registry", "npi_search", { taxonomy_description: query, limit: 10 })
        .catch((): McpBridgeResult => ({ available: false, server: "npi_registry", toolName: "npi_search", error: "call failed" })),
      censusBureauClient.getAcsData({
        year: 2023,
        variables: ["NAME", "B01001_001E"],
        geography: "state:*",
        dataset: "acs/acs5",
      }).catch(() => null),
    ]);

    // ─── Parse NPI results ─────────────────────────────────────
    let providerCount = 0;
    let providers: Array<{ name?: string; city?: string; state?: string; taxonomy?: string }> = [];
    if (npiResult.available && npiResult.data) {
      try {
        const parsed = JSON.parse(npiResult.data) as Record<string, unknown>;
        const results = (parsed.results ?? parsed.providers ?? []) as Record<string, unknown>[];
        providerCount = Number(parsed.result_count ?? parsed.total ?? results.length);
        providers = results.slice(0, 8).map((p) => {
          const basic = (p.basic ?? p) as Record<string, unknown>;
          const addresses = (p.addresses ?? []) as Record<string, unknown>[];
          const primaryAddr = addresses[0] ?? {};
          const taxonomies = (p.taxonomies ?? []) as Record<string, unknown>[];
          const taxonomy = taxonomies[0] ?? {};
          return {
            name: [basic.first_name, basic.last_name ?? basic.organization_name].filter(Boolean).join(" ") || String(basic.name ?? "—"),
            city: String(primaryAddr.city ?? "—"),
            state: String(primaryAddr.state ?? "—"),
            taxonomy: String(taxonomy.desc ?? taxonomy.description ?? "—").slice(0, 50),
          };
        });
      } catch {
        providerCount = 0;
      }
    }

    // ─── Parse Census results ──────────────────────────────────
    const censusRecords = censusResult?.data.records ?? [];
    const totalPopulation = censusRecords.reduce((sum, r) => sum + (Number(r.B01001_001E) || 0), 0);
    const stateCount = censusRecords.length;

    // ─── Confidence scoring ────────────────────────────────────
    let sourcesReturned = 0;
    if (npiResult.available) sourcesReturned++;
    if (censusResult && stateCount > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 2 ? "HIGH" : sourcesReturned >= 1 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ─────────────────────────────
    const sections: string[] = [];

    sections.push(intelligenceHeader({
      topic: "Provider Landscape",
      subject: query,
      confidence,
      sourcesQueried: 2,
      sourcesReturned,
      vintage: new Date().toISOString().slice(0, 10),
    }));

    // Key Intelligence bullets
    const bullets: string[] = [];
    if (npiResult.available) {
      bullets.push(`- **${formatNumber(providerCount)}** providers found in NPI Registry for "${query}"`);
    } else {
      bullets.push(`- ⚠️ NPI Registry data unavailable`);
    }
    if (stateCount > 0) {
      bullets.push(`- **${stateCount}** US states with ACS 2023 demographic data`);
      bullets.push(`- Total US population across queried states: **${formatNumber(totalPopulation)}**`);
    } else {
      bullets.push(`- ⚠️ Census Bureau demographic data unavailable`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Provider Distribution summary
    if (providers.length > 0) {
      const rows = providers.map((p) => [
        p.name ?? "—",
        p.taxonomy ?? "—",
        p.city ?? "—",
        p.state ?? "—",
      ]);
      sections.push(`### Provider Distribution\n${markdownTable(["Name", "Specialty", "City", "State"], rows, 8, providerCount)}`);
    }

    // ─── Citations ─────────────────────────────────────────────
    const ts = Date.now();
    const citations = [
      {
        id: `[NPI-${ts}]`,
        source: "CMS NPI Registry (NPPES)",
        query,
        resultCount: providerCount,
      },
      {
        id: `[CENSUS-${ts}]`,
        source: "US Census Bureau ACS 5-Year 2023",
        query: "state:* B01001_001E",
        resultCount: stateCount,
      },
    ];

    sections.push(formatCitations(citations));

    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: censusResult?.vintage ?? { queriedAt: new Date().toISOString(), source: "NPI Registry / Census Bureau" },
      confidence,
      truncated,
    };
  },
};

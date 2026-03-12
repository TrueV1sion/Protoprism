/**
 * Unit tests for MCP Server Configuration (src/lib/mcp/config.ts)
 *
 * Tests validate:
 * - MCP_SERVERS registry defines all 21 MCP servers (Tier 1–3)
 * - Every server has required config fields (description, available, transport)
 * - ARCHETYPE_TOOL_ROUTING maps archetypes to correct server sets
 * - All referenced servers in routing exist in MCP_SERVERS
 * - WEB_SEARCH_ARCHETYPES membership
 */

import { describe, it, expect } from "vitest";
import {
  MCP_SERVERS,
  ARCHETYPE_TOOL_ROUTING,
  WEB_SEARCH_ARCHETYPES,
} from "@/lib/mcp/config";

// ─── MCP_SERVERS Registry ──────────────────────────────────

describe("MCP_SERVERS", () => {
  const EXPECTED_SERVERS = [
    // Tier 1 — Anthropic-provided healthcare servers
    "pubmed",
    "cms_coverage",
    "icd10",
    "npi_registry",
    "clinical_trials",
    "biorxiv",
    // Tier 1 — Protoprism-built public API servers
    "openfda",
    "sec_edgar",
    "federal_register",
    "uspto_patents",
    "congress_gov",
    "bls_data",
    "census_bureau",
    // Tier 2 — Protoprism-built public API servers
    "who_gho",
    "gpo_govinfo",
    "cbo",
    "oecd_health",
    "sam_gov",
    // Tier 3 — Protoprism-built public API servers
    "fda_orange_book",
    "grants_gov",
    "ahrq_hcup",
  ];

  it("defines all expected MCP servers", () => {
    const serverNames = Object.keys(MCP_SERVERS);
    for (const name of EXPECTED_SERVERS) {
      expect(serverNames).toContain(name);
    }
  });

  it("has exactly 21 servers", () => {
    expect(Object.keys(MCP_SERVERS)).toHaveLength(21);
  });

  describe("every server has required config fields", () => {
    for (const name of EXPECTED_SERVERS) {
      describe(`${name}`, () => {
        it("has a description string", () => {
          expect(typeof MCP_SERVERS[name].description).toBe("string");
          expect(MCP_SERVERS[name].description.length).toBeGreaterThan(0);
        });

        it("has an available boolean", () => {
          expect(typeof MCP_SERVERS[name].available).toBe("boolean");
        });

        it("has a valid transport type", () => {
          expect(["sse", "stdio"]).toContain(MCP_SERVERS[name].transport);
        });
      });
    }
  });

  it("all servers are enabled (available: true)", () => {
    for (const name of EXPECTED_SERVERS) {
      expect(MCP_SERVERS[name].available).toBe(true);
    }
  });
});

// ─── ARCHETYPE_TOOL_ROUTING ────────────────────────────────

describe("ARCHETYPE_TOOL_ROUTING", () => {
  it("maps RESEARCHER-DATA to pubmed, clinical_trials, biorxiv and additional data servers", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["RESEARCHER-DATA"];
    expect(servers).toBeDefined();
    expect(servers).toEqual(
      expect.arrayContaining(["pubmed", "clinical_trials", "biorxiv"])
    );
    expect(servers).toHaveLength(8);
  });

  it("maps RESEARCHER-DOMAIN to pubmed, cms_coverage, icd10, npi_registry, clinical_trials and more", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["RESEARCHER-DOMAIN"];
    expect(servers).toBeDefined();
    expect(servers).toEqual(
      expect.arrayContaining([
        "pubmed",
        "cms_coverage",
        "icd10",
        "npi_registry",
        "clinical_trials",
      ])
    );
    expect(servers).toHaveLength(8);
  });

  it("ANALYST-FINANCIAL maps to sec_edgar, bls_data, cbo, sam_gov, ahrq_hcup", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["ANALYST-FINANCIAL"];
    expect(servers).toBeDefined();
    expect(servers).toEqual(
      expect.arrayContaining([
        "sec_edgar",
        "bls_data",
        "cbo",
        "sam_gov",
        "ahrq_hcup",
      ])
    );
    expect(servers).toHaveLength(5);
  });

  it("RESEARCHER-WEB has empty array (uses web_search native tool)", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["RESEARCHER-WEB"];
    expect(servers).toBeDefined();
    expect(servers).toEqual([]);
  });

  it("CRITIC-FACTUAL has empty array (uses web_search native tool)", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["CRITIC-FACTUAL"];
    expect(servers).toBeDefined();
    expect(servers).toEqual([]);
  });

  describe("all referenced servers exist in MCP_SERVERS", () => {
    const serverNames = Object.keys(MCP_SERVERS);

    for (const [archetype, servers] of Object.entries(ARCHETYPE_TOOL_ROUTING)) {
      if (servers && servers.length > 0) {
        it(`${archetype} references only valid servers`, () => {
          for (const server of servers) {
            expect(serverNames).toContain(server);
          }
        });
      }
    }
  });
});

// ─── WEB_SEARCH_ARCHETYPES ─────────────────────────────────

describe("WEB_SEARCH_ARCHETYPES", () => {
  it("includes RESEARCHER-WEB", () => {
    expect(WEB_SEARCH_ARCHETYPES.has("RESEARCHER-WEB")).toBe(true);
  });

  it("includes CRITIC-FACTUAL", () => {
    expect(WEB_SEARCH_ARCHETYPES.has("CRITIC-FACTUAL")).toBe(true);
  });

  it("does NOT include CRITIC-LOGICAL", () => {
    expect(WEB_SEARCH_ARCHETYPES.has("CRITIC-LOGICAL")).toBe(false);
  });

  it("does NOT include ANALYST-FINANCIAL", () => {
    expect(WEB_SEARCH_ARCHETYPES.has("ANALYST-FINANCIAL")).toBe(false);
  });

  it("includes ANALYST-STRATEGIC", () => {
    expect(WEB_SEARCH_ARCHETYPES.has("ANALYST-STRATEGIC")).toBe(true);
  });

  it("is a Set instance", () => {
    expect(WEB_SEARCH_ARCHETYPES).toBeInstanceOf(Set);
  });
});

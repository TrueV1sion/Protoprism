/**
 * Unit tests for MCP Server Configuration (src/lib/mcp/config.ts)
 *
 * Tests validate:
 * - MCP_SERVERS registry defines all 6 healthcare MCP servers
 * - Every server has required config fields (description, available)
 * - ARCHETYPE_TOOL_ROUTING maps archetypes to correct server sets
 * - All referenced servers in routing exist in MCP_SERVERS
 * - WEB_SEARCH_ARCHETYPES membership
 */

import { describe, it, expect } from "vitest";
import {
  MCP_SERVERS,
  ARCHETYPE_TOOL_ROUTING,
  WEB_SEARCH_ARCHETYPES,
  type MCPServerConfig,
} from "@/lib/mcp/config";

// ─── MCP_SERVERS Registry ──────────────────────────────────

describe("MCP_SERVERS", () => {
  const EXPECTED_SERVERS = [
    "pubmed",
    "cms_coverage",
    "icd10",
    "npi_registry",
    "clinical_trials",
    "biorxiv",
  ];

  it("defines all 6 healthcare MCP servers", () => {
    const serverNames = Object.keys(MCP_SERVERS);
    for (const name of EXPECTED_SERVERS) {
      expect(serverNames).toContain(name);
    }
  });

  it("has exactly 6 servers", () => {
    expect(Object.keys(MCP_SERVERS)).toHaveLength(6);
  });

  describe("every server has required config fields", () => {
    for (const name of EXPECTED_SERVERS) {
      describe(`${name}`, () => {
        it("has a command string", () => {
          expect(typeof MCP_SERVERS[name].command).toBe("string");
          expect(MCP_SERVERS[name].command.length).toBeGreaterThan(0);
        });

        it("has an args array", () => {
          expect(Array.isArray(MCP_SERVERS[name].args)).toBe(true);
        });

        it("has a description string", () => {
          expect(typeof MCP_SERVERS[name].description).toBe("string");
          expect(MCP_SERVERS[name].description.length).toBeGreaterThan(0);
        });

        it("has an available boolean", () => {
          expect(typeof MCP_SERVERS[name].available).toBe("boolean");
        });
      });
    }
  });

  it("all healthcare servers are currently marked unavailable (remote-only)", () => {
    for (const name of EXPECTED_SERVERS) {
      expect(MCP_SERVERS[name].available).toBe(false);
    }
  });
});

// ─── ARCHETYPE_TOOL_ROUTING ────────────────────────────────

describe("ARCHETYPE_TOOL_ROUTING", () => {
  it("maps RESEARCHER-DATA to pubmed, clinical_trials, biorxiv", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["RESEARCHER-DATA"];
    expect(servers).toBeDefined();
    expect(servers).toEqual(
      expect.arrayContaining(["pubmed", "clinical_trials", "biorxiv"])
    );
    expect(servers).toHaveLength(3);
  });

  it("maps RESEARCHER-DOMAIN to pubmed, cms_coverage, icd10, npi_registry, clinical_trials", () => {
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
    expect(servers).toHaveLength(5);
  });

  it("ANALYST-FINANCIAL has no MCP servers (empty array)", () => {
    const servers = ARCHETYPE_TOOL_ROUTING["ANALYST-FINANCIAL"];
    expect(servers).toBeDefined();
    expect(servers).toEqual([]);
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

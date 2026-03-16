/**
 * Unit tests for MCP Server Configuration (src/lib/mcp/config.ts)
 *
 * Tests validate:
 * - MCP_SERVERS registry defines all 21 MCP servers (Tier 1–3)
 * - Every server has required config fields (description, available, transport)
 *
 * NOTE: ARCHETYPE_TOOL_ROUTING and WEB_SEARCH_ARCHETYPES have moved to
 * src/lib/data-sources/registry.ts and are tested in the registry tests.
 */

import { describe, it, expect } from "vitest";
import { MCP_SERVERS } from "@/lib/mcp/config";

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

/**
 * Unit tests for MCP Server Configuration (src/lib/mcp/config.ts)
 *
 * Tests validate:
 * - MCP_SERVERS registry defines all 6 healthcare MCP servers
 * - Every server has required config fields (description, available)
 *
 * NOTE: ARCHETYPE_TOOL_ROUTING and WEB_SEARCH_ARCHETYPES have moved to
 * src/lib/data-sources/registry.ts and are tested in the registry tests.
 */

import { describe, it, expect } from "vitest";
import { MCP_SERVERS } from "@/lib/mcp/config";

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

  it("all healthcare servers are enabled (available: true)", () => {
    for (const name of EXPECTED_SERVERS) {
      expect(MCP_SERVERS[name].available).toBe(true);
    }
  });
});

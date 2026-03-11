import { vi } from "vitest";
import type { ArchetypeFamily } from "@/lib/pipeline/types";

export const mockGetToolsForArchetype = vi.fn().mockReturnValue([]);
export const mockGetGapsForArchetype = vi.fn().mockReturnValue([]);
export const mockExecuteTool = vi.fn().mockResolvedValue("mock tool result");
export const mockInitialize = vi.fn().mockResolvedValue(undefined);
export const mockShutdown = vi.fn().mockResolvedValue(undefined);
export const mockGetConnectedServers = vi.fn().mockReturnValue([]);
export const mockGetUnavailableServers = vi.fn().mockReturnValue([
  "pubmed", "cms_coverage", "icd10", "npi_registry", "clinical_trials", "biorxiv",
]);

vi.mock("@/lib/mcp/client", () => ({
  MCPManager: vi.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    getToolsForArchetype: mockGetToolsForArchetype,
    getGapsForArchetype: mockGetGapsForArchetype,
    executeTool: mockExecuteTool,
    shutdown: mockShutdown,
    getConnectedServers: mockGetConnectedServers,
    getUnavailableServers: mockGetUnavailableServers,
  })),
  getMCPManager: vi.fn().mockReturnValue({
    initialize: mockInitialize,
    getToolsForArchetype: mockGetToolsForArchetype,
    getGapsForArchetype: mockGetGapsForArchetype,
    executeTool: mockExecuteTool,
    shutdown: mockShutdown,
    getConnectedServers: mockGetConnectedServers,
    getUnavailableServers: mockGetUnavailableServers,
  }),
}));

export function resetMCPMock() {
  mockGetToolsForArchetype.mockReset().mockReturnValue([]);
  mockGetGapsForArchetype.mockReset().mockReturnValue([]);
  mockExecuteTool.mockReset().mockResolvedValue("mock tool result");
  mockInitialize.mockReset().mockResolvedValue(undefined);
  mockShutdown.mockReset().mockResolvedValue(undefined);
}

/**
 * Configure the mock to return specific tools for an archetype.
 * Useful for testing construct/deploy phases.
 */
export function setMockToolsForArchetype(
  archetype: ArchetypeFamily,
  tools: Array<{ name: string; description: string }>,
) {
  mockGetToolsForArchetype.mockImplementation((a: ArchetypeFamily) => {
    if (a === archetype) {
      return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: { type: "object" as const, properties: {} },
      }));
    }
    return [];
  });
}

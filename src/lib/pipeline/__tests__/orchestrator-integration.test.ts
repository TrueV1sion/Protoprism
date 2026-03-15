import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

import { enrichToolCalls } from "../present/enricher";
import { renderSlide } from "../present/template-renderer";
import { selectTemplate } from "../present/template-registry";
import type { CapturedToolCall } from "../present/data-capture";
import type { ContentGeneratorOutput } from "../present/types";

describe("Orchestrator Pipeline Integration", () => {
  it("data capture → enrich → select → render produces valid HTML", () => {
    const captured: CapturedToolCall[] = [{
      runId: "orch-test",
      agentId: "analyst",
      mcpServer: "sec-edgar",
      toolName: "get_filing",
      toolParams: { ticker: "INVA" },
      rawResponse: JSON.stringify({
        revenue: [
          { year: "2020", value: 621400000 },
          { year: "2021", value: 689100000 },
          { year: "2022", value: 743200000 },
          { year: "2023", value: 812600000 },
          { year: "2024", value: 872300000 },
        ],
      }),
      responseBytes: 250,
      latencyMs: 200,
      capturedAt: new Date(),
    }];

    // Stage 1: Enrich
    const registry = enrichToolCalls("orch-test", captured);
    expect(registry.datasets.length).toBeGreaterThan(0);

    // Stage 2: Select template
    const dataset = registry.datasets[0];
    const template = selectTemplate([dataset.dataShape], dataset.values.length, "trend", new Set());
    expect(template).toBeDefined();

    // Stage 5: Render with mock content
    const content: ContentGeneratorOutput = {
      slots: {
        headline: "Revenue Growth",
        subhead: "Consistent trajectory",
        slide_class: "gradient-dark",
        source: dataset.sourceLabel,
        stat_1: { value: "$872M", label: "FY2024", color_class: "cyan" },
        stat_2: { value: "8.3%", label: "CAGR", color_class: "green" },
        stat_3: { value: "+7.3%", label: "YoY", color_class: "orange" },
      },
      chartDataRefs: {},
    };

    const html = renderSlide(template.id, content, new Map());
    expect(html).toContain("Revenue Growth");
    expect(html).toContain("$872M");
    expect(html).toMatch(/<section/);
    expect(html).not.toContain("{{slot:");
  });

  it("empty captured calls produce empty registry without error", () => {
    const registry = enrichToolCalls("empty-test", []);
    expect(registry.datasets).toEqual([]);
    expect(registry.entities).toEqual([]);
  });
});

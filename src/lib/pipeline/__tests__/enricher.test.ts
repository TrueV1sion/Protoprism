import { describe, it, expect } from "vitest";
import { enrichToolCalls } from "../present/enricher";
import type { CapturedToolCall } from "../present/data-capture";
import type { DatasetRegistry } from "../present/types";

function makeCapturedCall(overrides: Partial<CapturedToolCall>): CapturedToolCall {
  return {
    runId: "run-1",
    agentId: "agent-1",
    mcpServer: "test-server",
    toolName: "test_tool",
    toolParams: {},
    rawResponse: "{}",
    responseBytes: 2,
    latencyMs: 100,
    capturedAt: new Date(),
    ...overrides,
  };
}

describe("Deterministic Enricher", () => {
  it("returns empty registry for empty input", () => {
    const registry = enrichToolCalls("run-1", []);
    expect(registry.runId).toBe("run-1");
    expect(registry.datasets).toEqual([]);
    expect(registry.entities).toEqual([]);
  });

  it("extracts time series from financial data", () => {
    const call = makeCapturedCall({
      mcpServer: "sec-edgar",
      toolName: "get_filing",
      rawResponse: JSON.stringify({
        revenue: [
          { year: "2022", value: 743200000 },
          { year: "2023", value: 812600000 },
          { year: "2024", value: 872300000 },
        ],
      }),
    });

    const registry = enrichToolCalls("run-1", [call]);
    expect(registry.datasets.length).toBeGreaterThanOrEqual(1);

    const revDataset = registry.datasets.find(d => d.metricName === "revenue");
    expect(revDataset).toBeDefined();
    expect(revDataset!.dataShape).toBe("time_series");
    expect(revDataset!.values).toHaveLength(3);
    expect(revDataset!.computed.trend).toBe("up");
    expect(revDataset!.computed.cagr).toBeCloseTo(0.083, 2);
  });

  it("computes density tiers correctly", () => {
    const sparseCall = makeCapturedCall({
      rawResponse: JSON.stringify({
        metrics: [
          { label: "A", value: 10 },
          { label: "B", value: 20 },
        ],
      }),
    });
    const denseCall = makeCapturedCall({
      rawResponse: JSON.stringify({
        metrics: Array.from({ length: 12 }, (_, i) => ({ label: `Q${i + 1}`, value: i * 10 })),
      }),
    });

    const sparseRegistry = enrichToolCalls("run-1", [sparseCall]);
    const denseRegistry = enrichToolCalls("run-2", [denseCall]);

    expect(sparseRegistry.datasets.length).toBeGreaterThan(0);
    expect(sparseRegistry.datasets[0].densityTier).toBe("sparse");

    expect(denseRegistry.datasets.length).toBeGreaterThan(0);
    expect(denseRegistry.datasets[0].densityTier).toBe("dense");
  });

  it("scores chart-worthiness based on data richness", () => {
    const call = makeCapturedCall({
      mcpServer: "sec-edgar",
      toolName: "get_filing",
      rawResponse: JSON.stringify({
        revenue: [
          { year: "2022", value: 743200000 },
          { year: "2023", value: 812600000 },
          { year: "2024", value: 872300000 },
        ],
      }),
    });

    const registry = enrichToolCalls("run-1", [call]);
    const dataset = registry.datasets[0];
    expect(dataset.chartWorthiness).toBeGreaterThan(0);
    expect(dataset.chartWorthiness).toBeGreaterThanOrEqual(40);
  });

  it("handles unparseable responses gracefully", () => {
    const call = makeCapturedCall({
      rawResponse: "This is not JSON at all",
    });

    const registry = enrichToolCalls("run-1", [call]);
    expect(registry.datasets).toEqual([]);
  });
});

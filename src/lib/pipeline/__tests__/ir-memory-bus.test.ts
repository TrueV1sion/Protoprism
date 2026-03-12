import { describe, it, expect } from "vitest";
import { MemoryBus } from "../memory-bus";
import type { IRGraph } from "../ir-types";

describe("MemoryBus IR Extensions", () => {
  it("starts with an empty IR graph after initIR()", () => {
    const bus = new MemoryBus("test query");
    bus.initIR("run-123");
    const ir = bus.exportIR();
    expect(ir).not.toBeNull();
    expect(ir!.metadata.runId).toBe("run-123");
    expect(ir!.findings).toEqual([]);
    expect(ir!.emergences).toEqual([]);
  });

  it("exportIR returns null if initIR was not called", () => {
    const bus = new MemoryBus("test query");
    expect(bus.exportIR()).toBeNull();
  });

  it("getIRGraph returns the live IR graph for mutation", () => {
    const bus = new MemoryBus("test query");
    bus.initIR("run-123");
    const graph = bus.getIRGraph();
    expect(graph).not.toBeNull();

    // Mutate and verify
    graph!.findings.push({
      id: "f-1",
      agent: "test-agent",
      agentArchetype: "RESEARCHER-WEB",
      dimension: "Market",
      key: "market/size",
      value: "Test finding",
      confidence: 0.8,
      evidenceType: "direct",
      tags: [],
      references: [],
      timestamp: new Date().toISOString(),
      findingIndex: 0,
      actionabilityScore: 3,
      noveltyScore: 3,
    });

    const ir = bus.exportIR();
    expect(ir!.findings).toHaveLength(1);
    expect(ir!.findings[0].id).toBe("f-1");
  });

  it("export() still returns MemoryBusState without IR data", () => {
    const bus = new MemoryBus("test query");
    bus.initIR("run-123");
    bus.writeToBlackboard({
      agent: "test",
      key: "test/key",
      value: "test value",
      confidence: 0.9,
      evidenceType: "direct",
      tags: [],
      references: [],
    });

    const exported = JSON.parse(bus.export());
    expect(exported.blackboard).toHaveLength(1);
    // IR data should NOT leak into export()
    expect(exported.irGraph).toBeUndefined();
  });

  it("preserves all existing MemoryBus functionality", () => {
    const bus = new MemoryBus("test query");
    bus.initIR("run-123");

    // Blackboard
    const entry = bus.writeToBlackboard({
      agent: "agent-a",
      key: "market/size",
      value: "Market is $5B",
      confidence: 0.9,
      evidenceType: "direct",
      tags: ["market"],
      references: ["source-1"],
    });
    expect(entry.id).toBeDefined();

    // Signals
    const signal = bus.sendSignal({
      from: "agent-a",
      to: "all",
      type: "discovery",
      priority: "high",
      message: "Found big market",
    });
    expect(signal.id).toBeDefined();

    // Conflicts
    const conflict = bus.registerConflict({
      registeredBy: "agent-a",
      claim: "Market is growing",
      positions: [
        { agent: "agent-a", position: "Yes", evidence: "Data", confidence: 0.9 },
      ],
    });
    expect(conflict.status).toBe("open");

    // Status
    const status = bus.getStatus();
    expect(status.entries).toBe(1);
    expect(status.signals).toBe(1);
    expect(status.openConflicts).toBe(1);
  });
});

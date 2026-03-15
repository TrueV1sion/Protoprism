import { describe, it, expect } from "vitest";
import { EngineManifestSchema } from "@/lib/engines/types";
import {
  getEngineRegistry,
  getEngineById,
  getDefaultEngine,
  getActiveEngines,
} from "@/lib/engines/registry";
import { commandCenterManifest } from "@/lib/engines/command-center";

describe("EngineManifestSchema", () => {
  it("validates a correct manifest", () => {
    const result = EngineManifestSchema.safeParse(commandCenterManifest);
    expect(result.success).toBe(true);
  });

  it("rejects a manifest with missing required fields", () => {
    const result = EngineManifestSchema.safeParse({
      id: "test",
      // missing name, shortName, etc.
    });
    expect(result.success).toBe(false);
  });

  it("rejects a manifest with an invalid status", () => {
    const result = EngineManifestSchema.safeParse({
      ...commandCenterManifest,
      status: "invalid-status",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a manifest with an invalid accentColor format", () => {
    const result = EngineManifestSchema.safeParse({
      ...commandCenterManifest,
      accentColor: "not-a-hex",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a manifest with an empty id", () => {
    const result = EngineManifestSchema.safeParse({
      ...commandCenterManifest,
      id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a manifest with a negative order", () => {
    const result = EngineManifestSchema.safeParse({
      ...commandCenterManifest,
      order: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("getEngineRegistry", () => {
  it("returns all registered engines", () => {
    const engines = getEngineRegistry();
    expect(engines.length).toBe(6);
  });

  it("returns engines sorted by order", () => {
    const engines = getEngineRegistry();
    for (let i = 1; i < engines.length; i++) {
      expect(engines[i].order).toBeGreaterThanOrEqual(engines[i - 1].order);
    }
  });
});

describe("getEngineById", () => {
  it("finds an engine by its id", () => {
    const engine = getEngineById("command-center");
    expect(engine).toBeDefined();
    expect(engine!.id).toBe("command-center");
    expect(engine!.name).toBe("Command Center");
  });

  it("finds the M&A engine", () => {
    const engine = getEngineById("ma");
    expect(engine).toBeDefined();
    expect(engine!.name).toBe("M&A Engine");
  });

  it("returns undefined for an unknown id", () => {
    const engine = getEngineById("nonexistent");
    expect(engine).toBeUndefined();
  });
});

describe("getDefaultEngine", () => {
  it("returns the command center as the default engine", () => {
    const def = getDefaultEngine();
    expect(def.id).toBe("command-center");
    expect(def.isDefault).toBe(true);
  });

  it("there is exactly one default engine", () => {
    const engines = getEngineRegistry();
    const defaults = engines.filter((e) => e.isDefault);
    expect(defaults.length).toBe(1);
  });
});

describe("getActiveEngines", () => {
  it("excludes hidden engines", () => {
    const active = getActiveEngines();
    const hiddenEngines = active.filter((e) => e.status === "hidden");
    expect(hiddenEngines.length).toBe(0);
  });

  it("includes active and coming-soon engines", () => {
    const active = getActiveEngines();
    const statuses = new Set(active.map((e) => e.status));
    expect(statuses.has("active")).toBe(true);
    expect(statuses.has("coming-soon")).toBe(true);
  });

  it("returns engines sorted by order", () => {
    const active = getActiveEngines();
    for (let i = 1; i < active.length; i++) {
      expect(active[i].order).toBeGreaterThanOrEqual(active[i - 1].order);
    }
  });
});

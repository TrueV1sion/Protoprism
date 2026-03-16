// src/__tests__/unit/data-sources/tools/openfda.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultCache } from "@/lib/data-sources/cache";

// Mock the openFDA client
vi.mock("@/lib/data-sources/clients/openfda", () => ({
  openfdaClient: {
    searchAdverseEvents: vi.fn(async () => ({
      data: {
        results: [
          {
            safetyreportid: "10001",
            serious: 1,
            seriousnessdeath: 0,
            seriousnesshospitalization: 1,
            receivedate: "20250601",
            patient: {
              reaction: [{ reactionmeddrapt: "Nausea" }, { reactionmeddrapt: "Headache" }],
              drug: [{ openfda: { brand_name: ["Humira"], generic_name: ["adalimumab"] } }],
            },
          },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", dataThrough: "2025-Q4", source: "openFDA FAERS" },
    })),
    searchDrugLabels: vi.fn(async () => ({
      data: {
        results: [
          {
            openfda: { brand_name: ["Humira"], generic_name: ["adalimumab"], manufacturer_name: ["AbbVie"] },
            indications_and_usage: ["Treatment of rheumatoid arthritis"],
            warnings: ["Risk of infections"],
          },
        ],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA Drug Labels" },
    })),
    countAdverseEvents: vi.fn(async () => ({
      data: {
        results: [{ term: "NAUSEA", count: 150 }, { term: "HEADACHE", count: 120 }],
        total: 2,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA FAERS" },
    })),
    searchRecalls: vi.fn(async () => ({
      data: {
        results: [{ report_date: "20250615", classification: "Class II", product_description: "Contaminated tablets", reason_for_recall: "cGMP deviations", status: "Ongoing" }],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA Enforcement" },
    })),
    search510k: vi.fn(async () => ({
      data: {
        results: [{ k_number: "K241234", device_name: "Coronary Stent", applicant: "MedDevice Inc", decision_code: "SESE", decision_date: "20250501" }],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA 510(k)" },
    })),
    searchDeviceEvents: vi.fn(async () => ({
      data: {
        results: [{ mdr_report_key: "9876543", device: [{ generic_name: "Infusion Pump", manufacturer_d_name: "PumpCo" }], event_type: "Malfunction", date_received: "20250801" }],
        total: 1,
        hasMore: false,
      },
      status: 200,
      vintage: { queriedAt: "2026-01-01T00:00:00Z", source: "openFDA MAUDE" },
    })),
  },
}));

describe("openFDA granular tools", () => {
  let cache: ResultCache;

  beforeEach(() => {
    cache = new ResultCache();
    vi.clearAllMocks();
  });

  it("search_adverse_events returns markdown table, not JSON", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "search_adverse_events");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ drug_name: "adalimumab" }, cache);
    expect(result.content).toContain("##"); // Has markdown headers
    expect(result.content).toContain("Nausea"); // Contains reaction data
    expect(result.content).not.toContain('"safetyreportid"'); // No raw JSON
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toContain("openFDA");
    expect(result.confidence).toBe("HIGH");
  });

  it("search_drug_labels returns markdown output", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "search_drug_labels");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ brand_name: "Humira" }, cache);
    expect(result.content).toContain("Humira");
    expect(result.content).toContain("rheumatoid arthritis");
    expect(result.confidence).toBe("HIGH");
  });

  it("count_adverse_events returns term/count table", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "count_adverse_events");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ field: "patient.reaction.reactionmeddrapt", drug_name: "adalimumab" }, cache);
    expect(result.content).toContain("##"); // Has markdown header
    expect(result.citations).toHaveLength(1);
  });

  it("search_drug_recalls returns recall table", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "search_drug_recalls");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ query: "contamination" }, cache);
    expect(result.content).toContain("Recalls");
    expect(result.citations).toHaveLength(1);
  });

  it("search_510k returns clearance table", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "search_510k");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ device_name: "stent" }, cache);
    expect(result.content).toContain("510(k)");
    expect(result.citations).toHaveLength(1);
  });

  it("search_device_events returns device event table", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    const tool = openfdaTools.find((t) => t.name === "search_device_events");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ device_name: "pump" }, cache);
    expect(result.content).toContain("Device Event");
    expect(result.citations).toHaveLength(1);
  });

  it("all tools have layer=2 and no __ in name", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    for (const tool of openfdaTools) {
      expect(tool.layer).toBe(2);
      expect(tool.name).not.toContain("__");
      expect(tool.sources).toContain("openfda");
    }
  });

  it("exports at least 5 tools", async () => {
    const { openfdaTools } = await import("@/lib/data-sources/tools/openfda.tools");
    expect(openfdaTools.length).toBeGreaterThanOrEqual(5);
  });
});

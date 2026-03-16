import { describe, it, expect } from "vitest";

describe("format helpers", () => {
  describe("markdownTable", () => {
    it("formats rows into a markdown table", async () => {
      const { markdownTable } = await import("@/lib/data-sources/format");
      const result = markdownTable(
        ["Name", "Value"],
        [["Aspirin", "100mg"], ["Ibuprofen", "200mg"]],
      );
      expect(result).toContain("| Name | Value |");
      expect(result).toContain("|------|-------|");
      expect(result).toContain("| Aspirin | 100mg |");
      expect(result).toContain("| Ibuprofen | 200mg |");
    });

    it("truncates to maxRows and adds note", async () => {
      const { markdownTable } = await import("@/lib/data-sources/format");
      const rows = Array.from({ length: 25 }, (_, i) => [`item${i}`, `${i}`]);
      const result = markdownTable(["Name", "Value"], rows, 5, 25);
      const lines = result.split("\n").filter(Boolean);
      // header + separator + 5 data rows + truncation note = 8 lines
      expect(lines.length).toBe(8);
      expect(result).toContain("Showing 5 of 25");
    });

    it("handles empty rows", async () => {
      const { markdownTable } = await import("@/lib/data-sources/format");
      const result = markdownTable(["Name"], []);
      expect(result).toContain("No results");
    });
  });

  describe("formatCitations", () => {
    it("formats citations into a markdown block", async () => {
      const { formatCitations } = await import("@/lib/data-sources/format");
      const result = formatCitations([
        { id: "[FDA-AE-1]", source: "openFDA FAERS", query: "adalimumab", resultCount: 42 },
      ]);
      expect(result).toContain("### Citations");
      expect(result).toContain("[FDA-AE-1]");
      expect(result).toContain("openFDA FAERS");
      expect(result).toContain("42 results");
    });
  });

  describe("truncateToCharBudget", () => {
    it("returns content unchanged when under budget", async () => {
      const { truncateToCharBudget } = await import("@/lib/data-sources/format");
      const result = truncateToCharBudget("short content", 1000);
      expect(result.content).toBe("short content");
      expect(result.truncated).toBe(false);
    });

    it("truncates and adds note when over budget", async () => {
      const { truncateToCharBudget } = await import("@/lib/data-sources/format");
      const longContent = "x".repeat(5000);
      const result = truncateToCharBudget(longContent, 100);
      expect(result.content.length).toBeLessThanOrEqual(100);
      expect(result.truncated).toBe(true);
    });
  });

  describe("intelligenceHeader", () => {
    it("formats the standard intelligence packet header", async () => {
      const { intelligenceHeader } = await import("@/lib/data-sources/format");
      const result = intelligenceHeader({
        topic: "Drug Safety",
        subject: "Adalimumab",
        confidence: "HIGH",
        sourcesQueried: 3,
        sourcesReturned: 3,
        vintage: "2026-Q1",
      });
      expect(result).toContain("## Drug Safety: Adalimumab");
      expect(result).toContain("**Confidence**: HIGH");
      expect(result).toContain("**Sources**: 3/3");
      expect(result).toContain("**Data through**: 2026-Q1");
    });
  });

  describe("formatNumber", () => {
    it("adds commas to large numbers", async () => {
      const { formatNumber } = await import("@/lib/data-sources/format");
      expect(formatNumber(1234567)).toBe("1,234,567");
    });

    it("handles small numbers without commas", async () => {
      const { formatNumber } = await import("@/lib/data-sources/format");
      expect(formatNumber(42)).toBe("42");
    });

    it("handles zero", async () => {
      const { formatNumber } = await import("@/lib/data-sources/format");
      expect(formatNumber(0)).toBe("0");
    });
  });

  describe("formatDate", () => {
    it("converts YYYYMMDD format to YYYY-MM-DD", async () => {
      const { formatDate } = await import("@/lib/data-sources/format");
      expect(formatDate("20250601")).toBe("2025-06-01");
    });

    it("extracts date portion from ISO strings", async () => {
      const { formatDate } = await import("@/lib/data-sources/format");
      expect(formatDate("2025-06-01T12:00:00Z")).toBe("2025-06-01");
    });

    it("returns other formats as-is", async () => {
      const { formatDate } = await import("@/lib/data-sources/format");
      expect(formatDate("June 2025")).toBe("June 2025");
    });
  });

  describe("dig", () => {
    it("extracts nested values by dot path", async () => {
      const { dig } = await import("@/lib/data-sources/format");
      expect(dig({ a: { b: { c: "deep" } } }, "a.b.c")).toBe("deep");
    });

    it("returns fallback for missing paths", async () => {
      const { dig } = await import("@/lib/data-sources/format");
      expect(dig({ a: 1 }, "b.c")).toBe("—");
    });

    it("returns custom fallback when provided", async () => {
      const { dig } = await import("@/lib/data-sources/format");
      expect(dig(null, "a.b", "N/A")).toBe("N/A");
    });

    it("joins arrays with commas", async () => {
      const { dig } = await import("@/lib/data-sources/format");
      expect(dig({ tags: ["a", "b", "c"] }, "tags")).toBe("a, b, c");
    });

    it("converts non-string values to strings", async () => {
      const { dig } = await import("@/lib/data-sources/format");
      expect(dig({ count: 42 }, "count")).toBe("42");
    });
  });
});

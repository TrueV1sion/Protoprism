import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(__dirname, "../present/templates");

describe("Template File Validation", () => {
  const layoutDirs = ["single-focus", "data-viz", "content", "composite"];
  const expectedCounts: Record<string, number> = {
    "single-focus": 5,
    "data-viz": 8,
    "content": 8,
    "composite": 6,
  };

  for (const dir of layoutDirs) {
    it(`has ${expectedCounts[dir]} templates in ${dir}/`, () => {
      const fullPath = join(TEMPLATES_DIR, "layouts", dir);
      const files = readdirSync(fullPath).filter(f => f.endsWith(".html"));
      expect(files.length).toBe(expectedCounts[dir]);
    });
  }

  it("has 9 component fragments", () => {
    const files = readdirSync(join(TEMPLATES_DIR, "components")).filter(f => f.endsWith(".html"));
    expect(files.length).toBe(9);
  });

  it("every template has a valid <section> root", () => {
    for (const dir of layoutDirs) {
      const fullPath = join(TEMPLATES_DIR, "layouts", dir);
      const files = readdirSync(fullPath).filter(f => f.endsWith(".html"));
      for (const file of files) {
        const content = readFileSync(join(fullPath, file), "utf-8");
        expect(content).toMatch(/<section class="slide/);
        expect(content).toMatch(/<\/section>/);
      }
    }
  });

  it("no template references nonexistent CSS classes", () => {
    const css = readFileSync(join(__dirname, "../../../../public/styles/presentation.css"), "utf-8");

    // Extract class names from CSS (simplified — look for .classname patterns)
    const cssClasses = new Set<string>();
    for (const match of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      cssClasses.add(match[1]);
    }

    // Known dynamic classes that come from slot values
    const dynamicClasses = new Set([
      "cyan", "green", "orange", "purple", "up", "down", "flat",
      // Component slots can inject these CSS classes:
      "risk", "opportunity", "emergent", // action-card priority_class
      "high", "medium", "low",          // action-card priority_badge
    ]);

    function validateHtmlClasses(filePath: string) {
      const content = readFileSync(filePath, "utf-8");
      const classRefs = content.matchAll(/class="([^"]*?)"/g);
      for (const match of classRefs) {
        const classes = match[1].split(/\s+/);
        for (const cls of classes) {
          if (cls.startsWith("{{")) continue; // slot reference
          if (dynamicClasses.has(cls)) continue; // from slot value
          expect(cssClasses.has(cls)).toBe(true);
        }
      }
    }

    // Validate layout templates
    for (const dir of layoutDirs) {
      const fullPath = join(TEMPLATES_DIR, "layouts", dir);
      const files = readdirSync(fullPath).filter(f => f.endsWith(".html"));
      for (const file of files) {
        validateHtmlClasses(join(fullPath, file));
      }
    }

    // Validate component fragments too
    const componentsPath = join(TEMPLATES_DIR, "components");
    const componentFiles = readdirSync(componentsPath).filter(f => f.endsWith(".html"));
    for (const file of componentFiles) {
      validateHtmlClasses(join(componentsPath, file));
    }
  });
});

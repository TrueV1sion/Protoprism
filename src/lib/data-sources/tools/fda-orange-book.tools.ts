// src/lib/data-sources/tools/fda-orange-book.tools.ts
/**
 * FDA Orange Book Layer 2 Granular Tools
 *
 * 2 tools that wrap the FDA Orange Book Layer 1 API client calls and return
 * markdown-formatted ToolResult responses. Agents see these tools
 * directly and get human-readable tables + citations — no raw JSON.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import { fdaOrangeBookClient } from "../clients/fda-orange-book";
import type { DrugsFDAResult } from "../clients/fda-orange-book";
import {
  markdownTable,
  formatCitations,
  formatNumber,
} from "../format";

// ─── search_orange_book ──────────────────────────────────────

const searchOrangeBook: DataSourceTool = {
  name: "search_orange_book",
  description:
    "Search the FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations). " +
    "Find FDA-approved drugs by brand name, generic name, sponsor, or application number (NDA/ANDA). " +
    "Returns drug products, equivalence codes, and approval status.",
  inputSchema: {
    type: "object",
    properties: {
      brand_name: { type: "string", description: "Brand name (e.g., 'Humira')" },
      generic_name: { type: "string", description: "Generic name (e.g., 'adalimumab')" },
      sponsor_name: { type: "string", description: "Sponsor/manufacturer name" },
      application_number: { type: "string", description: "NDA or ANDA application number" },
      query: { type: "string", description: "Free-text search query" },
      limit: { type: "number", description: "Max results (default 10, max 100)" },
    },
  },
  layer: 2,
  sources: ["fda-orange-book"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const response = await fdaOrangeBookClient.searchProducts({
      brandName: input.brand_name as string | undefined,
      genericName: input.generic_name as string | undefined,
      sponsorName: input.sponsor_name as string | undefined,
      applicationNumber: input.application_number as string | undefined,
      query: input.query as string | undefined,
      limit: (input.limit as number | undefined) ?? 10,
    });

    const headers = ["Application #", "Brand Name", "Generic Name", "Sponsor", "Products"];
    const rows = response.data.results.slice(0, MAX_TABLE_ROWS_LAYER_2).map((drug: DrugsFDAResult) => {
      const brandNames = drug.openfda?.brand_name ?? [];
      const genericNames = drug.openfda?.generic_name ?? [];
      const productCount = drug.products?.length ?? 0;
      return [
        drug.application_number ?? "—",
        brandNames[0] ?? "—",
        genericNames[0] ?? "—",
        (drug.sponsor_name ?? "—").slice(0, 40),
        String(productCount),
      ];
    });

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, response.data.total);
    const queryDesc =
      (input.brand_name as string) ??
      (input.generic_name as string) ??
      (input.sponsor_name as string) ??
      (input.application_number as string) ??
      (input.query as string) ??
      "all drugs";

    const citation = {
      id: `[FDA-OB-${Date.now()}]`,
      source: "FDA Orange Book (openFDA drugsfda)",
      query: queryDesc,
      resultCount: response.data.total,
    };

    return {
      content: `## FDA Orange Book: ${queryDesc}\n\n**${formatNumber(response.data.total)} applications found**\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: rows.length < response.data.total,
    };
  },
};

// ─── get_orange_book_patents ──────────────────────────────────

const getOrangeBookPatents: DataSourceTool = {
  name: "get_orange_book_patents",
  description:
    "Look up FDA Orange Book drug product details including active ingredients, dosage forms, " +
    "routes of administration, and therapeutic equivalence codes for a specific drug.",
  inputSchema: {
    type: "object",
    properties: {
      drug_name: { type: "string", description: "Brand or generic drug name to look up" },
      limit: { type: "number", description: "Max products to return (default 10)" },
    },
    required: ["drug_name"],
  },
  layer: 2,
  sources: ["fda-orange-book"],
  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const drugName = input.drug_name as string;

    // Try brand name first, then generic
    let response = await fdaOrangeBookClient.searchProducts({
      brandName: drugName,
      limit: (input.limit as number | undefined) ?? 10,
    });

    if (response.data.results.length === 0) {
      response = await fdaOrangeBookClient.searchProducts({
        genericName: drugName,
        limit: (input.limit as number | undefined) ?? 10,
      });
    }

    const sections: string[] = [];

    for (const drug of response.data.results.slice(0, 5)) {
      const brandNames = drug.openfda?.brand_name?.join(", ") ?? "—";
      const genericNames = drug.openfda?.generic_name?.join(", ") ?? "—";
      sections.push(`### ${drug.application_number ?? "Unknown"} — ${brandNames}`);
      sections.push(`**Generic:** ${genericNames}`);
      sections.push(`**Sponsor:** ${drug.sponsor_name ?? "—"}`);

      if (drug.products && drug.products.length > 0) {
        const productHeaders = ["Dosage Form", "Route", "TE Code", "Status"];
        const productRows = drug.products.slice(0, 5).map((p) => [
          p.dosage_form ?? "—",
          p.route ?? "—",
          p.te_code ?? "—",
          p.marketing_status ?? "—",
        ]);
        sections.push(markdownTable(productHeaders, productRows));
      }
    }

    const content = sections.length > 0 ? sections.join("\n\n") : "No drug products found.";

    const citation = {
      id: `[FDA-OB-DETAIL-${Date.now()}]`,
      source: "FDA Orange Book (openFDA drugsfda)",
      query: drugName,
      resultCount: response.data.total,
    };

    return {
      content: `## FDA Orange Book: ${drugName}\n\n${content}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: response.vintage,
      confidence: response.data.total > 0 ? "HIGH" : "MEDIUM",
      truncated: response.data.total > 5,
    };
  },
};

// ─── Export ──────────────────────────────────────────────────

export const fdaOrangeBookTools: DataSourceTool[] = [
  searchOrangeBook,
  getOrangeBookPatents,
];

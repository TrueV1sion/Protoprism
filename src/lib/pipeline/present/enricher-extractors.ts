import type { DataRegistryPoint, DataShape } from "./types";

export interface ExtractedMetric {
  metricName: string;
  dataShape: DataShape;
  values: DataRegistryPoint[];
  sourceLabel: string;
}

export type ResponseExtractor = (
  toolName: string,
  params: unknown,
  response: unknown,
) => ExtractedMetric[];

/**
 * Generic extractor — scans any JSON object for arrays of {label/year/period, value} pairs.
 * Used as fallback when no server-specific extractor exists.
 */
export function genericExtractor(
  toolName: string,
  _params: unknown,
  response: unknown,
): ExtractedMetric[] {
  if (!response || typeof response !== "object") return [];
  const results: ExtractedMetric[] = [];

  for (const [key, val] of Object.entries(response as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;

    const points: DataRegistryPoint[] = [];
    for (const item of val) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;

      // Look for value field
      const numVal = typeof obj.value === "number" ? obj.value : undefined;
      if (numVal === undefined) continue;

      // Look for period/label field
      const period =
        typeof obj.period === "string" ? obj.period :
        typeof obj.year === "string" ? obj.year :
        typeof obj.quarter === "string" ? obj.quarter :
        typeof obj.label === "string" ? obj.label :
        typeof obj.name === "string" ? obj.name :
        String(points.length);

      points.push({ period, value: numVal, label: typeof obj.label === "string" ? obj.label : undefined });
    }

    if (points.length >= 2) {
      const shape = inferDataShape(key, points);
      results.push({
        metricName: key,
        dataShape: shape,
        values: points,
        sourceLabel: `Tool: ${toolName}`,
      });
    }
  }

  return results;
}

function inferDataShape(key: string, points: DataRegistryPoint[]): DataShape {
  // Check if all values sum to ~100 (percentage distribution)
  const sum = points.reduce((s, p) => s + p.value, 0);
  if (Math.abs(sum - 100) < 5 && points.length >= 3) return "composition";

  // Check if periods look temporal
  const hasTemporal = points.some(p =>
    /\d{4}/.test(p.period) || /Q\d/.test(p.period) || /FY\d{4}/.test(p.period)
  );
  if (hasTemporal && points.length >= 3) return "time_series";

  // Check key name hints
  if (key.includes("rank") || key.includes("top")) return "ranking";
  if (key.includes("compare") || key.includes("vs")) return "comparison";

  // Default: if sequential values, treat as comparison
  return points.length <= 5 ? "comparison" : "distribution";
}

/** SEC EDGAR specific extractor */
export function extractSecFiling(
  _toolName: string,
  params: unknown,
  response: unknown,
): ExtractedMetric[] {
  const results = genericExtractor("SEC EDGAR", params, response);
  const p = params as Record<string, unknown> | undefined;
  const ticker = p?.ticker ?? p?.cik ?? "Unknown";
  return results.map(r => ({
    ...r,
    sourceLabel: `SEC EDGAR Filing (${ticker})`,
  }));
}

/** BLS data series extractor */
export function extractBlsSeries(
  _toolName: string,
  params: unknown,
  response: unknown,
): ExtractedMetric[] {
  const results = genericExtractor("BLS", params, response);
  return results.map(r => ({
    ...r,
    sourceLabel: "Bureau of Labor Statistics",
    dataShape: "time_series" as DataShape,
  }));
}

/** Clinical trials extractor */
export function extractTrialResults(
  _toolName: string,
  params: unknown,
  response: unknown,
): ExtractedMetric[] {
  const results = genericExtractor("ClinicalTrials.gov", params, response);
  return results.map(r => ({
    ...r,
    sourceLabel: "ClinicalTrials.gov",
  }));
}

/** Registry of known server+tool extractors */
export const extractorRegistry: Record<string, ResponseExtractor> = {
  "sec-edgar:get_filing": extractSecFiling,
  "sec-edgar:search_filings": extractSecFiling,
  "bls-data:get_series": extractBlsSeries,
  "clinicaltrials:search": extractTrialResults,
  "clinicaltrials:search_trials": extractTrialResults,
};

export function getExtractor(mcpServer: string, toolName: string): ResponseExtractor {
  const key = `${mcpServer}:${toolName}`;
  return extractorRegistry[key] ?? genericExtractor;
}

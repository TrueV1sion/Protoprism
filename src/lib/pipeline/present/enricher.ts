import type { CapturedToolCall } from "./data-capture";
import type {
  DatasetRegistry,
  EnrichedDataset,
  ComputedMetrics,
  DensityTier,
  DataRegistryPoint,
} from "./types";
import { getExtractor } from "./enricher-extractors";

const PRIMARY_SOURCES = ["SEC", "CMS", "BLS", "FDA", "Census", "ClinicalTrials.gov"];

export function enrichToolCalls(
  runId: string,
  capturedCalls: CapturedToolCall[],
): DatasetRegistry {
  const datasets: EnrichedDataset[] = [];
  let idCounter = 0;

  for (const call of capturedCalls) {
    let parsed: unknown;
    try {
      parsed = typeof call.rawResponse === "string"
        ? JSON.parse(call.rawResponse)
        : call.rawResponse;
    } catch {
      // Unparseable response — skip enrichment, raw is still in tool_call_log
      continue;
    }

    const extractor = getExtractor(call.mcpServer, call.toolName);
    const metrics = extractor(call.toolName, call.toolParams, parsed);

    for (const metric of metrics) {
      const computed = computeMetrics(metric.values);
      const densityTier = getDensityTier(metric.values.length);
      const dataset: EnrichedDataset = {
        id: `enriched_${runId}_${++idCounter}`,
        // NOTE: In-memory enrichment uses a synthetic ID. When persisting to Postgres
        // in Task 11, replace with the actual ToolCallLog.id (cuid) from the DB insert.
        sourceCallId: `${call.mcpServer}:${call.toolName}:${call.capturedAt.toISOString()}`,
        metricName: metric.metricName,
        dataShape: metric.dataShape,
        densityTier,
        values: metric.values,
        computed,
        sourceLabel: metric.sourceLabel,
        chartWorthiness: scoreChartWorthiness({
          values: metric.values,
          computed,
          dataShape: metric.dataShape,
          sourceLabel: metric.sourceLabel,
        }),
      };
      datasets.push(dataset);
    }
  }

  // NOTE: Entity resolution is not yet implemented. The entities array
  // will be populated in a future iteration when EntityRegistry lookup is added.
  return { runId, datasets, entities: [] };
}

function computeMetrics(values: DataRegistryPoint[]): ComputedMetrics {
  const nums = values.map(v => v.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;

  const result: ComputedMetrics = { min, max, mean };

  // Trend detection
  if (nums.length >= 3) {
    const firstHalf = nums.slice(0, Math.floor(nums.length / 2));
    const secondHalf = nums.slice(Math.floor(nums.length / 2));
    const firstAvg = firstHalf.reduce((s, n) => s + n, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, n) => s + n, 0) / secondHalf.length;
    const delta = (secondAvg - firstAvg) / Math.abs(firstAvg || 1);
    result.trend = delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat";
  }

  // CAGR (compound annual growth rate)
  if (nums.length >= 2 && nums[0] > 0 && nums[nums.length - 1] > 0) {
    const years = nums.length - 1;
    result.cagr = Math.pow(nums[nums.length - 1] / nums[0], 1 / years) - 1;
  }

  // YoY growth (last two values)
  if (nums.length >= 2 && nums[nums.length - 2] > 0) {
    result.yoyGrowth = (nums[nums.length - 1] - nums[nums.length - 2]) / nums[nums.length - 2];
  }

  return result;
}

function getDensityTier(pointCount: number): DensityTier {
  if (pointCount <= 3) return "sparse";
  if (pointCount <= 7) return "medium";
  return "dense";
}

function scoreChartWorthiness(dataset: {
  values: DataRegistryPoint[];
  computed: ComputedMetrics;
  dataShape: string;
  sourceLabel: string;
}): number {
  let score = 0;

  // Data richness: more points = richer visualization (max 30)
  score += Math.min(dataset.values.length * 5, 30);

  // Clear trend = more compelling
  if (dataset.computed.trend === "up" || dataset.computed.trend === "down") {
    score += 20;
  }

  // Large magnitudes are impressive
  const maxValue = Math.max(...dataset.values.map(v => v.value));
  if (maxValue > 1_000_000) score += 10;

  // Computed metrics available = richer callouts
  score += Object.keys(dataset.computed).filter(k =>
    dataset.computed[k as keyof ComputedMetrics] !== undefined
  ).length * 3;

  // Ideal donut: 4-8 segments in a composition
  if (dataset.dataShape === "composition" &&
      dataset.values.length >= 4 && dataset.values.length <= 8) {
    score += 15;
  }

  // Primary source data scores higher
  const isPrimarySource = PRIMARY_SOURCES.some(s => dataset.sourceLabel.includes(s));
  if (isPrimarySource) score += 10;

  return score;
}

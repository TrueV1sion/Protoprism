/**
 * Presentation Pipeline Types
 *
 * Type definitions for the agentic presentation pipeline (Stage 4: PRESENT).
 * LLM-parsed types use Zod schemas for runtime validation.
 * Internal types use plain TypeScript interfaces.
 *
 * Imports shared types from @/lib/pipeline/types — do not duplicate them here.
 */

import { z } from "zod";
import type {
  AgentFinding,
  SynthesisResult,
  AgentResult,
  Blueprint,
  PipelineEvent,
  SwarmTier,
} from "@/lib/pipeline/types";
import type {
  SlotSchema,
  ComponentSlot,
  ComponentField,
  ChartSlotSchema,
} from "./template-registry";

// Re-export imported types for convenience
export type { AgentFinding, SynthesisResult, AgentResult, Blueprint, PipelineEvent, SwarmTier };

// ─── Slide Planning (LLM output — Zod schemas) ───────────────

export const SlideTypeSchema = z.enum([
  "title",
  "executive-summary",
  "dimension-deep-dive",
  "data-metrics",
  "emergence",
  "tension",
  "findings-toc",
  "closing",
]);
export type SlideType = z.infer<typeof SlideTypeSchema>;

export const AnimationTypeSchema = z.enum(["anim", "anim-scale", "anim-blur", "stagger-children"]);
export type AnimationType = z.infer<typeof AnimationTypeSchema>;

export const ChartRoleSchema = z.enum([
  "donut-segment",
  "bar-value",
  "sparkline-point",
  "counter-target",
  "bar-fill-percent",
  "line-point",
]);
export type ChartRole = z.infer<typeof ChartRoleSchema>;

export const DataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  prefix: z.string().optional(),
  chartRole: ChartRoleSchema,
});
export type DataPoint = z.infer<typeof DataPointSchema>;

export const SlideSpecSchema = z.object({
  slideNumber: z.number().int().positive(),
  title: z.string(),
  type: SlideTypeSchema,
  purpose: z.string(),
  agentSources: z.array(z.string()),
  componentHints: z.array(z.string()),
  animationType: AnimationTypeSchema,
  dataPoints: z.array(DataPointSchema),
});
export type SlideSpec = z.infer<typeof SlideSpecSchema>;

export const SlideManifestSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  slides: z.array(SlideSpecSchema),
  totalSlides: z.number().int().positive(),
});
export type SlideManifest = z.infer<typeof SlideManifestSchema>;

// ─── Chart Compiler (internal) ───────────────────────────────

export interface DonutSegment {
  label: string;
  percentage: number;
  dashArray: string;
  dashOffset: string;
  color: string;
}

export interface DonutChartData {
  type: "donut";
  segments: DonutSegment[];
  circumference: number;
  svgFragment: string;
}

export interface BarChartData {
  type: "bar";
  bars: {
    label: string;
    value: number;
    height: number;
    y: number;
    color: string;
  }[];
  svgFragment: string;
}

export interface SparklineData {
  type: "sparkline";
  points: string;
  endX: number;
  endY: number;
  svgFragment: string;
}

export interface CounterData {
  type: "counter";
  target: number;
  prefix?: string;
  suffix?: string;
  colorClass?: string;
  htmlFragment: string;
}

export interface HorizontalBarData {
  type: "horizontal-bar";
  rows: {
    label: string;
    value: number;
    percentage: number;
    color: string;
  }[];
  htmlFragment: string;
}

export interface LineChartData {
  type: "line";
  points: string;
  svgFragment: string;
}

export type ChartData =
  | DonutChartData
  | BarChartData
  | SparklineData
  | CounterData
  | HorizontalBarData
  | LineChartData;

/** ChartDataMap keyed by slideNumber */
export type ChartDataMap = Record<number, ChartData[]>;

// ─── Slide Generator (internal) ──────────────────────────────

export interface SlideHTML {
  slideNumber: number;
  html: string;
  tokensUsed: number;
  status: "success" | "fallback" | "failed";
}

export interface SlideGeneratorInput {
  spec: SlideSpec;
  charts: ChartData[];
  exemplarHtml: string;
  componentRef: string;
  findings: AgentFinding[];
  deckContext: {
    title: string;
    subtitle: string;
    totalSlides: number;
  };
}

// ─── Assembler (internal) ─────────────────────────────────────

export interface AssemblerInput {
  slides: SlideHTML[];
  manifest: SlideManifest;
}

export interface AssemblerOutput {
  html: string;
  slideCount: number;
}

// ─── Validator (internal) ─────────────────────────────────────

export interface MetricScore {
  score: number;
  weight: number;
  details: string;
}

export interface QualityMetrics {
  classNameValidity: MetricScore;
  structuralIntegrity: MetricScore;
  chartAdoption: MetricScore;
  animationVariety: MetricScore;
  counterAdoption: MetricScore;
  emergenceHierarchy: MetricScore;
  sourceAttribution: MetricScore;
}

export interface SlideIssue {
  slideNumber: number;
  severity: "error" | "warning" | "info";
  message: string;
  className?: string;
}

export interface QualityScorecard {
  metrics: QualityMetrics;
  overall: number;
  grade: string;
  perSlideIssues: SlideIssue[];
}

// ─── Design Reviewer (LLM output — Zod schemas) ──────────────

export const SlideReviewSchema = z.object({
  slideNumber: z.number().int().positive(),
  componentFit: z.number().int().min(1).max(5),
  narrativeFlow: z.number().int().min(1).max(5),
  regenerate: z.boolean(),
  feedback: z.string(),
});
export type SlideReview = z.infer<typeof SlideReviewSchema>;

export const DesignReviewSchema = z.object({
  slides: z.array(SlideReviewSchema),
  overallScore: z.number().min(1).max(10),
  narrative: z.string(),
});
export type DesignReview = z.infer<typeof DesignReviewSchema>;

// ─── Remediation (internal) ──────────────────────────────────

export interface RemediationInput {
  slideNumber: number;
  slideType?: string;
  templateId?: string;
  componentHints?: string[];
  originalHtml: string;
  validatorIssues: SlideIssue[];
  reviewerFeedback?: string;
  exemplarHtml: string;
  chartData?: ChartData[];
  chartFragments?: string[];
}

// ─── Pipeline Orchestrator (internal) ────────────────────────

export interface PipelineTimings {
  planMs: number;
  chartCompileMs: number;
  generateMs: number;
  assembleMs: number;
  validateMs: number;
  reviewMs: number;
  remediateMs: number;
  finalizeMs: number;
  totalMs: number;
}

// ─── Data Pipeline Types ─────────────────────────────────────

export type DataShape = "time_series" | "distribution" | "comparison" | "ranking" | "single_metric" | "composition";
export type DensityTier = "sparse" | "medium" | "dense";

export interface DataRegistryPoint {
  period: string;
  value: number;
  label?: string;
}

export interface ComputedMetrics {
  trend?: "up" | "down" | "flat";
  cagr?: number;
  yoyGrowth?: number;
  movingAvg?: number;
  min: number;
  max: number;
  mean: number;
  percentileRank?: number;
  distribution?: number[];
}

export interface ResolvedEntity {
  id: string;
  canonicalName: string;
  entityType: string;
  identifiers: Record<string, string>;
  aliases: string[];
}

export interface EnrichedDataset {
  id: string;
  sourceCallId: string;
  metricName: string;
  dataShape: DataShape;
  densityTier: DensityTier;
  values: DataRegistryPoint[];
  computed: ComputedMetrics;
  sourceLabel: string;
  entityId?: string;
  chartWorthiness: number;
}

export interface DatasetRegistry {
  runId: string;
  datasets: EnrichedDataset[];
  entities: ResolvedEntity[];
}

export interface DataCoverage {
  dataShapes: Record<DataShape, number>;
  domains: string[];
  entityCount: number;
  totalDataPoints: number;
  strongestSignals: SignalSummary[];
}

export interface SignalSummary {
  datasetId: string;
  metricName: string;
  dataShape: DataShape;
  chartWorthiness: number;
  headline: string;
}

// ─── Orchestrator Input ───────────────────────────────────────

// Re-export the canonical PresentInput from present.ts to avoid duplicate definitions.
export type { PresentInput } from "../present";

// ── Renderer & Content Output Types ──

export interface StatData {
  value: string;
  label: string;
  // NOTE: Spec says "magenta" but CSS has `.purple` (no `.magenta` class exists).
  // This plan uses "purple" to match the actual CSS design system.
  color_class: "cyan" | "green" | "purple" | "orange";
  trend_direction?: "up" | "down" | "flat";
  delta?: string;
}

export interface ListItem {
  text: string;
  icon?: string;
  emphasis?: boolean;
}

export interface ContentGeneratorOutput {
  slots: Record<string, string | StatData | ListItem[]>;
  chartDataRefs: Record<string, string>;
  contentNotes?: string;
}

// ── Content Generator Input ──

export interface ContentGeneratorInput {
  templateId: string;
  templateName: string;
  slotSchema: SlotSchema[];
  componentSlotSchemas: ComponentSlot[];
  datasets: EnrichedDataset[];
  slideIntent: string;
  narrativePosition: string;
  deckThesis: string;
  priorSlideHeadlines: string[];
}

// ── Planner & Manifest Types ──

export type SlideIntent = "context" | "evidence" | "comparison" | "trend" | "composition" |
  "ranking" | "process" | "recommendation" | "summary" | "transition";

export interface NarrativeArc {
  opening: string;
  development: string;
  climax: string;
  resolution: string;
}

export interface TemplateSlideSpec {
  index: number;
  templateId: string;
  slideIntent: SlideIntent;
  narrativePosition: string;
  datasetBindings: {
    chartSlots: Record<string, string>;
    statSources: Record<string, string>;
  };
  transitionFrom: string | null;
  transitionTo: string | null;
  slideClass: string;
  accentColor: string;
}

export interface TemplateSlideManifest {
  title: string;
  subtitle: string;
  thesis: string;
  narrativeArc: NarrativeArc;
  slides: TemplateSlideSpec[];
}

export interface PlannerInput {
  brief: string;
  maxSlides: number;
  audience: "executive" | "technical" | "board" | "sales";
  deckThesis: string;
  keyInsights: string[];
  datasetRegistry: DatasetRegistry;
}

// ── Template Quality Scorecard ──

export interface TemplateQualityScorecard {
  structural: {
    templateCoverage: number;
    renderSuccess: number;
    chartCompilation: number;
  };
  dataIntegrity: {
    dataBackedSlides: number;
    sourceAttribution: number;
    valueAccuracy: number;
    noHallucinations: number;
  };
  contentQuality: {
    headlineSpecificity: number;
    narrativeArc: number;
    insightDensity: number;
    audienceAlignment: number;
  };
  visualDesign: {
    templateVariety: number;
    colorDistribution: number;
    densityBalance: number;
    transitionSmooth: number;
  };
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

// ── Slot & Component Schemas (re-exported from template-registry) ──
// These are defined in template-registry.ts as the source of truth.
// Re-export here for convenience so consumers can import from either location.
export type { SlotSchema, ComponentSlot, ComponentField, ChartSlotSchema } from "./template-registry";

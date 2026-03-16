"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Shield,
  Hexagon,
  ChevronRight,
  Library,
  Sparkles,
  Download,
} from "lucide-react";
import type { SynthesisLayer } from "@/lib/types";
import type { StreamEmergence, QualityReport } from "@/hooks/use-research-stream";

interface CompletionData {
  agentCount: number;
  totalFindings: number;
  emergentInsights: number;
  totalCost: number;
}

interface CompletePhaseProps {
  synthesisLayers: SynthesisLayer[];
  findingCount: number;
  hasError: boolean;
  errorMessage: string | null;
  isLiveMode: boolean;
  quality: QualityReport | null;
  completionData: CompletionData | null;
  emergences: StreamEmergence[];
  onNewAnalysis: () => void;
  onViewBrief: () => void;
  onDownloadBrief: () => void;
  onBrowseLibrary: () => void;
}

export default function CompletePhase({
  synthesisLayers,
  findingCount,
  hasError,
  errorMessage,
  isLiveMode,
  quality,
  completionData,
  emergences,
  onNewAnalysis,
  onViewBrief,
  onDownloadBrief,
  onBrowseLibrary,
}: CompletePhaseProps) {
  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 md:p-10 overflow-y-auto">
      <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
          {hasError ? (
            <>
              <div className="prism-kicker mx-auto border-red-400/35 text-red-300 bg-red-500/10">
                <AlertTriangle className="w-3.5 h-3.5" />
                Pipeline Error
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-prism-text">Analysis Encountered an Error</h2>
              <p className="text-sm text-red-300/90 max-w-2xl mx-auto leading-relaxed">
                {errorMessage && errorMessage.length > 260 ? `${errorMessage.slice(0, 260)}...` : errorMessage}
              </p>
            </>
          ) : (
            <>
              <div className="prism-kicker mx-auto border-prism-jade/40 text-prism-jade bg-prism-jade/10">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Synthesis Complete
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-prism-text">Strategic Intelligence Debrief Ready</h2>
              <p className="text-sm text-prism-muted max-w-2xl mx-auto">
                {synthesisLayers.length} synthesis layers produced from {findingCount} validated findings.
              </p>
            </>
          )}
        </motion.div>

        {isLiveMode && quality && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <BarChart3 className="w-5 h-5 text-prism-sky" />
              <h3 className="text-sm font-semibold text-prism-text uppercase tracking-[0.08em]">Quality Assessment</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <MetricTile label="Overall Grade" value={quality.grade} valueClass={quality.overallScore >= 80 ? "text-prism-jade" : quality.overallScore >= 60 ? "text-amber-400" : "text-red-400"} />
              <MetricTile label="Quality Score" value={`${quality.overallScore}%`} valueClass="text-prism-text" />
              <MetricTile label="Provenance" value={`${quality.provenanceCompleteness}%`} valueClass="text-prism-sky" />
              <MetricTile label="Warnings" value={`${quality.warningCount}`} valueClass={quality.warningCount === 0 ? "text-prism-jade" : "text-amber-400"} />
            </div>

            {quality.criticalWarnings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                {quality.criticalWarnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-300/90">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {isLiveMode && completionData && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <Shield className="w-5 h-5 text-prism-jade" />
              <h3 className="text-sm font-semibold text-prism-text uppercase tracking-[0.08em]">Run Summary</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <MetricTile label="Agents" value={`${completionData.agentCount}`} valueClass="text-prism-text" />
              <MetricTile label="Findings" value={`${completionData.totalFindings}`} valueClass="text-prism-text" />
              <MetricTile label="Emergences" value={`${completionData.emergentInsights}`} valueClass="text-prism-sky" />
              <MetricTile label="Cost" value={`$${completionData.totalCost.toFixed(3)}`} valueClass="text-prism-jade" />
            </div>
          </motion.div>
        )}

        {synthesisLayers.length > 0 && (
          <div className="space-y-4">
            {synthesisLayers.map((layer, i) => (
              <motion.div
                key={layer.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-panel rounded-2xl p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.08em] w-fit ${
                      i === 0
                        ? "bg-white/12 text-white"
                        : i === 1
                          ? "bg-prism-jade/10 text-prism-jade"
                          : i === 2
                            ? "bg-amber-400/10 text-amber-400"
                            : i === 3
                              ? "bg-prism-sky/10 text-prism-sky"
                              : "bg-red-400/10 text-red-400"
                    }`}
                  >
                    {layer.name}
                  </span>
                  <span className="text-xs text-prism-muted">{layer.description}</span>
                </div>

                <ul className="space-y-2.5">
                  {layer.insights.map((insight, j) => (
                    <li key={j} className="text-sm text-prism-text leading-relaxed pl-4 border-l-2 border-white/12">
                      {insight}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        )}

        {isLiveMode && emergences.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-prism-sky flex items-center gap-2 uppercase tracking-[0.08em]">
              <Hexagon className="w-4 h-4" />
              Emergent Insights ({emergences.length})
            </h3>
            {emergences.map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-panel rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-prism-sky/15 text-prism-sky border border-prism-sky/30 uppercase tracking-[0.08em]">
                    {e.type}
                  </span>
                  <span className="text-[10px] text-prism-muted font-mono">via {(e.contributingAgents ?? []).join(", ")}</span>
                </div>
                <p className="text-sm text-prism-text leading-relaxed">{e.insight}</p>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-mono text-prism-muted uppercase tracking-[0.06em]">
                  <span>Nov {e.quality.novelty}/5</span>
                  <span>Gnd {e.quality.grounding}/5</span>
                  <span>Act {e.quality.actionability}/5</span>
                  <span>Dpt {e.quality.depth}/5</span>
                  <span>Srp {e.quality.surprise}/5</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-wrap items-center justify-center gap-3 pb-4">
          <button
            onClick={onNewAnalysis}
            className={`px-5 py-2.5 text-sm ${hasError ? "prism-button-secondary" : "prism-button-ghost"}`}
          >
            {hasError ? "Try Again" : "New Analysis"}
          </button>

          {!hasError && (
            <button onClick={onViewBrief} data-tour-id="tour-view-brief" className="prism-button-primary px-7 py-3 text-sm">
              <Sparkles className="w-4 h-4" />
              View Cinematic Brief
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {!hasError && (
            <button onClick={onDownloadBrief} className="prism-button-secondary px-5 py-2.5 text-sm">
              <Download className="w-4 h-4" />
              Download Brief
            </button>
          )}

          {!hasError && (
            <button onClick={onBrowseLibrary} className="prism-button-secondary px-5 py-2.5 text-sm">
              <Library className="w-4 h-4" />
              Browse Library
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="prism-panel-soft rounded-xl px-3 py-3 text-center">
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-prism-muted mt-1">{label}</div>
    </div>
  );
}

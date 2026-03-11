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
    onBrowseLibrary,
}: CompletePhaseProps) {
    return (
        <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto">
            <div className="w-full max-w-4xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
                    {hasError ? (
                        <>
                            <div className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                PIPELINE ERROR
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold text-white">Analysis Encountered an Error</h2>
                            <p className="text-sm text-red-400/80 max-w-xl mx-auto">
                                {errorMessage && errorMessage.length > 200
                                    ? errorMessage.slice(0, 200) + "…"
                                    : errorMessage}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-prism-jade/10 text-prism-jade border border-prism-jade/20">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                SYNTHESIS COMPLETE
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold text-white">Intelligence Brief Ready</h2>
                            <p className="text-sm text-prism-muted">
                                {synthesisLayers.length} synthesis layers generated from {findingCount} validated findings
                            </p>
                        </>
                    )}
                </motion.div>

                {/* Quality Report (live mode only) */}
                {isLiveMode && quality && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <BarChart3 className="w-5 h-5 text-prism-sky" />
                            <h3 className="text-sm font-semibold text-white">Quality Assessment</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className={`text-3xl font-bold ${quality.overallScore >= 80 ? "text-prism-jade" :
                                    quality.overallScore >= 60 ? "text-amber-400" : "text-red-400"
                                    }`}>{quality.grade}</div>
                                <div className="text-xs text-prism-muted mt-1">Overall Grade</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-white">{quality.overallScore}%</div>
                                <div className="text-xs text-prism-muted mt-1">Quality Score</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-prism-sky">{quality.provenanceCompleteness}%</div>
                                <div className="text-xs text-prism-muted mt-1">Provenance</div>
                            </div>
                            <div className="text-center">
                                <div className={`text-3xl font-bold ${quality.warningCount === 0 ? "text-prism-jade" : "text-amber-400"}`}>{quality.warningCount}</div>
                                <div className="text-xs text-prism-muted mt-1">Warnings</div>
                            </div>
                        </div>
                        {quality.criticalWarnings.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {quality.criticalWarnings.map((w, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-red-400/80">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>{w}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Completion Stats (live mode) */}
                {isLiveMode && completionData && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-5 h-5 text-prism-jade" />
                            <h3 className="text-sm font-semibold text-white">Run Summary</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-white">{completionData.agentCount}</div>
                                <div className="text-xs text-prism-muted">Agents</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{completionData.totalFindings}</div>
                                <div className="text-xs text-prism-muted">Findings</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-prism-sky">{completionData.emergentInsights}</div>
                                <div className="text-xs text-prism-muted">Emergences</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-prism-jade">${completionData.totalCost.toFixed(3)}</div>
                                <div className="text-xs text-prism-muted">Cost</div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Synthesis Layers */}
                {synthesisLayers.length > 0 && (
                    <div className="space-y-4">
                        {synthesisLayers.map((layer, i) => (
                            <motion.div
                                key={layer.name}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.15 }}
                                className="glass-panel rounded-xl p-5"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${i === 0 ? "bg-white/10 text-white" :
                                        i === 1 ? "bg-prism-jade/10 text-prism-jade" :
                                            i === 2 ? "bg-amber-400/10 text-amber-400" :
                                                i === 3 ? "bg-prism-sky/10 text-prism-sky" :
                                                    "bg-red-400/10 text-red-400"
                                        }`}>
                                        {layer.name.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-prism-muted">{layer.description}</span>
                                </div>
                                <ul className="space-y-2">
                                    {layer.insights.map((insight, j) => (
                                        <li key={j} className="text-sm text-prism-text leading-relaxed pl-4 border-l-2 border-white/10">
                                            {insight}
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Emergent Insights (live mode) */}
                {isLiveMode && emergences.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-prism-sky flex items-center gap-2">
                            <Hexagon className="w-4 h-4" />
                            Emergent Insights ({emergences.length})
                        </h3>
                        {emergences.map((e, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-panel rounded-xl p-5"
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-prism-sky/15 text-prism-sky border border-prism-sky/30">
                                        {e.type.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-prism-muted">
                                        via {e.contributingAgents.join(", ")}
                                    </span>
                                </div>
                                <p className="text-sm text-white leading-relaxed">{e.insight}</p>
                                <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-prism-muted">
                                    <span title="Novelty">NOV: {e.quality.novelty}/5</span>
                                    <span title="Grounding">GND: {e.quality.grounding}/5</span>
                                    <span title="Actionability">ACT: {e.quality.actionability}/5</span>
                                    <span title="Depth">DPT: {e.quality.depth}/5</span>
                                    <span title="Surprise">SRP: {e.quality.surprise}/5</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* CTA */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="flex items-center justify-center gap-4 pt-4 pb-8">
                    <button
                        onClick={onNewAnalysis}
                        className={`px-6 py-2.5 rounded-lg text-sm border transition-colors ${hasError
                            ? "text-white border-prism-sky/30 bg-prism-sky/10 hover:bg-prism-sky/20"
                            : "text-prism-muted border-white/10 hover:border-white/20 hover:text-white"
                        }`}
                    >
                        {hasError ? "Try Again" : "New Analysis"}
                    </button>
                    {!hasError && (
                        <button
                            onClick={onViewBrief}
                            data-tour-id="tour-view-brief"
                            className="flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-medium bg-prism-sky text-prism-bg shadow-[0_0_20px_rgba(89,221,253,0.25)] hover:bg-white transition-all duration-300"
                        >
                            View Cinematic Brief
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                    {!hasError && (
                        <button
                            onClick={onBrowseLibrary}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm text-prism-muted border border-white/10 hover:border-prism-sky/30 hover:text-prism-sky transition-colors"
                        >
                            <Library className="w-4 h-4" />
                            Browse Library
                        </button>
                    )}
                </motion.div>
            </div>
        </div>
    );
}

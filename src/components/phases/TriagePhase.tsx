"use client";

import { useState, useMemo } from "react";
import { Filter, ChevronRight, ArrowUpDown, ShieldCheck } from "lucide-react";
import FindingCard from "@/components/FindingCard";
import type { Finding, FindingAction } from "@/lib/types";

type ConfidenceFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type SortMode = "default" | "confidence";

const CONFIDENCE_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

interface TriagePhaseProps {
  findings: Finding[];
  agentCount: number;
  onAction: (id: string, action: FindingAction) => void;
  onApproveAndSynthesize: () => void;
}

export default function TriagePhase({
  findings,
  agentCount,
  onAction,
  onApproveAndSynthesize,
}: TriagePhaseProps) {
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const keptCount = findings.filter((f) => f.action === "keep" || f.action === "boost").length;
  const reviewedCount = findings.filter((f) => f.action !== "keep").length;

  const filteredFindings = useMemo(() => {
    let result = [...findings];
    if (confidenceFilter !== "ALL") {
      result = result.filter((f) => f.confidence === confidenceFilter);
    }
    if (sortMode === "confidence") {
      result.sort((a, b) => (CONFIDENCE_ORDER[a.confidence] ?? 1) - (CONFIDENCE_ORDER[b.confidence] ?? 1));
    }
    return result;
  }, [findings, confidenceFilter, sortMode]);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 md:p-10 overflow-y-auto">
      <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <div className="text-center space-y-3">
          <div className="prism-kicker mx-auto">
            <Filter className="w-3.5 h-3.5" />
            HITL Findings Triage
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-prism-text">Review and Curate Agent Output</h2>
          <p className="text-sm text-prism-muted max-w-2xl mx-auto leading-relaxed">
            {findings.length} findings across {agentCount} agents. Confirm what survives into synthesis and suppress weak signal.
          </p>
        </div>

        <div className="sticky top-2 z-10 glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em]">
              <span className="prism-chip px-2.5 py-1 text-prism-jade border-prism-jade/30">{keptCount} kept</span>
              <span className="prism-chip px-2.5 py-1 text-prism-sky border-prism-sky/30">
                {findings.filter((f) => f.action === "boost").length} boosted
              </span>
              <span className="prism-chip px-2.5 py-1 text-amber-400 border-amber-400/30">
                {findings.filter((f) => f.action === "flag").length} flagged
              </span>
              <span className="prism-chip px-2.5 py-1 text-red-400 border-red-400/30">
                {findings.filter((f) => f.action === "dismiss").length} dismissed
              </span>
              <span className="text-prism-muted pl-1">{reviewedCount}/{findings.length} reviewed</span>
            </div>

            <button onClick={onApproveAndSynthesize} className="prism-button-primary px-6 py-2.5 text-sm w-full lg:w-auto">
              <ShieldCheck className="w-4 h-4" />
              Approve & Synthesize
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="prism-divider" />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setSortMode((s) => (s === "default" ? "confidence" : "default"))}
              className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md border transition-colors ${
                sortMode === "confidence"
                  ? "border-prism-sky/45 text-prism-sky bg-prism-sky/12"
                  : "border-white/15 text-prism-muted hover:text-prism-text"
              }`}
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortMode === "confidence" ? "By Confidence" : "Default Order"}
            </button>

            {(["ALL", "HIGH", "MEDIUM", "LOW"] as ConfidenceFilter[]).map((level) => (
              <button
                key={level}
                onClick={() => setConfidenceFilter(level)}
                className={`text-[11px] font-mono px-2.5 py-1.5 rounded-md border transition-colors ${
                  confidenceFilter === level
                    ? level === "HIGH"
                      ? "border-prism-jade/45 text-prism-jade bg-prism-jade/12"
                      : level === "MEDIUM"
                        ? "border-amber-400/45 text-amber-400 bg-amber-400/12"
                        : level === "LOW"
                          ? "border-red-400/45 text-red-400 bg-red-400/12"
                          : "border-prism-sky/45 text-prism-sky bg-prism-sky/12"
                    : "border-white/15 text-prism-muted hover:text-prism-text"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div data-tour-id="tour-finding-card" className="space-y-4">
          {filteredFindings.map((finding, i) => (
            <FindingCard key={finding.id} finding={finding} index={i} onAction={onAction} />
          ))}
          {filteredFindings.length === 0 && (
            <div className="glass-panel rounded-2xl text-center py-14 text-sm text-prism-muted">No findings match the current filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}

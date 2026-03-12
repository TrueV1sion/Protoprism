"use client";

import { motion } from "framer-motion";
import type { Finding, FindingAction } from "@/lib/types";
import { ThumbsUp, ThumbsDown, ArrowUp, Flag, Shield, FileText, Bot } from "lucide-react";

const confidenceStyles: Record<string, string> = {
  HIGH: "bg-prism-jade/15 text-prism-jade border-prism-jade/35",
  MEDIUM: "bg-amber-400/14 text-amber-400 border-amber-400/35",
  LOW: "bg-red-400/15 text-red-400 border-red-400/35",
};

const actionButtons: { action: FindingAction; icon: typeof ThumbsUp; label: string; activeClass: string }[] = [
  { action: "keep", icon: ThumbsUp, label: "Keep", activeClass: "bg-prism-jade/18 text-prism-jade border-prism-jade/45" },
  { action: "boost", icon: ArrowUp, label: "Boost", activeClass: "bg-prism-sky/20 text-prism-sky border-prism-sky/45" },
  { action: "flag", icon: Flag, label: "Flag", activeClass: "bg-amber-400/18 text-amber-400 border-amber-400/45" },
  { action: "dismiss", icon: ThumbsDown, label: "Dismiss", activeClass: "bg-red-400/18 text-red-400 border-red-400/45" },
];

export default function FindingCard({
  finding,
  index,
  onAction,
}: {
  finding: Finding;
  index: number;
  onAction: (id: string, action: FindingAction) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.24 }}
      className={`glass-panel rounded-2xl p-4 sm:p-5 transition-all duration-200 ${finding.action === "dismiss" ? "opacity-45" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-prism-cerulean" />
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-prism-sky truncate">{finding.agentName}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confidenceStyles[finding.confidence]}`}>
          {finding.confidence}
        </span>
      </div>

      <p className="text-sm text-prism-text font-semibold leading-relaxed mb-3">{finding.statement}</p>

      <div className="space-y-2.5 mb-4">
        <div className="flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-prism-muted/60 mt-0.5 shrink-0" />
          <p className="text-xs text-prism-muted leading-relaxed">{finding.evidence}</p>
        </div>
        <div className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-prism-muted/60 mt-0.5 shrink-0" />
          <p className="text-[11px] text-prism-muted/80 font-mono leading-relaxed">{finding.source}</p>
        </div>
      </div>

      <div className="rounded-lg px-3 py-2.5 mb-4 border border-prism-sky/20 bg-prism-sky/10">
        <p className="text-xs text-prism-muted leading-relaxed">
          <span className="text-prism-sky font-semibold uppercase tracking-[0.08em]">Implication </span>
          {finding.implication}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actionButtons.map(({ action, icon: Icon, label, activeClass }) => (
          <button
            key={action}
            onClick={() => onAction(finding.id, action)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${
              finding.action === action
                ? activeClass
                : "border-white/12 text-prism-muted hover:border-white/28 hover:text-prism-text"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

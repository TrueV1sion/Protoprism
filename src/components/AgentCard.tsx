"use client";

import { motion } from "framer-motion";
import type { AgentRunState } from "@/lib/types";
import { Bot, CheckCircle2, AlertTriangle, Loader2, Sparkles } from "lucide-react";

const statusConfig = {
  idle: { icon: Bot, color: "text-prism-muted", bg: "bg-white/5", label: "Standby" },
  active: { icon: Loader2, color: "text-prism-sky", bg: "bg-prism-sky/10", label: "Analyzing" },
  complete: { icon: CheckCircle2, color: "text-prism-jade", bg: "bg-prism-jade/12", label: "Complete" },
  failed: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10", label: "Failed" },
};

export default function AgentCard({ agent, index }: { agent: AgentRunState; index: number }) {
  const config = statusConfig[agent.status];
  const StatusIcon = config.icon;
  const highConfidenceCount = agent.findings.filter((f) => f.confidence === "HIGH").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.34, ease: "easeOut" }}
      className="glass-panel rounded-2xl p-4 sm:p-5 relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }} />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              background: `linear-gradient(150deg, ${agent.color}26, rgba(6, 17, 29, 0.7))`,
              borderColor: `${agent.color}55`,
            }}
          >
            <Bot className="w-5 h-5" style={{ color: agent.color }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-prism-text truncate">{agent.name}</h3>
            <p className="text-[11px] font-mono text-prism-muted uppercase tracking-[0.08em] truncate">{agent.archetype}</p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${config.bg}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${config.color} ${agent.status === "active" ? "animate-spin" : ""}`} />
          <span className={`${config.color} font-medium`}>{config.label}</span>
        </div>
      </div>

      <p className="text-xs text-prism-muted leading-relaxed mb-4 line-clamp-3">{agent.mandate}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {agent.tools.map((tool) => (
          <span key={tool} className="text-[10px] font-mono px-2 py-0.5 prism-chip border uppercase tracking-[0.04em]">
            {tool}
          </span>
        ))}
      </div>

      {agent.status === "active" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-prism-muted uppercase tracking-[0.08em]">
            <span>Execution Progress</span>
            <span>{Math.round(agent.progress)}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: agent.color }}
              initial={{ width: "0%" }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {agent.findings.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
          <span className="text-prism-jade font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {agent.findings.length} findings
          </span>
          <span className="text-prism-muted">{highConfidenceCount} high-confidence</span>
        </div>
      )}
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { BlueprintData } from "@/lib/types";
import { Users, Zap, Clock, Layers, ChevronRight, X, Pencil, Radar } from "lucide-react";

const tierColors: Record<string, string> = {
  MICRO: "text-prism-muted bg-white/5 border-white/10",
  STANDARD: "text-prism-sky bg-prism-sky/10 border-prism-sky/35",
  EXTENDED: "text-prism-jade bg-prism-jade/10 border-prism-jade/35",
  MEGA: "text-amber-400 bg-amber-400/10 border-amber-400/35",
};

export default function BlueprintApproval({
  blueprint,
  onApprove,
  onCancel,
}: {
  blueprint: BlueprintData;
  onApprove: () => void;
  onCancel?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center p-4 sm:p-6 md:p-10 overflow-y-auto"
    >
      <div className="w-full max-w-6xl space-y-6 sm:space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
          <div className="prism-kicker mx-auto">
            <Layers className="w-3.5 h-3.5" />
            HITL Blueprint Approval
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-prism-text">Mission Blueprint</h2>
          <p className="text-sm text-prism-muted max-w-3xl mx-auto leading-relaxed">
            Confirm decomposition strategy and specialist roster before deployment. This gate controls cost, depth, and analytical coverage.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="glass-panel rounded-2xl p-5">
          <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-prism-muted mb-2">Mission Query</p>
          <p className="text-prism-text leading-relaxed">{blueprint.query}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <InfoTile label="Swarm Tier">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${tierColors[blueprint.tier]}`}>{blueprint.tier}</span>
          </InfoTile>
          <InfoTile label="Agents">
            <div className="flex items-center justify-center gap-1.5 text-prism-text">
              <Users className="w-4 h-4 text-prism-cerulean" />
              <span className="text-lg font-semibold">{blueprint.agents.length}</span>
            </div>
          </InfoTile>
          <InfoTile label="Complexity">
            <div className="flex items-center justify-center gap-1.5 text-prism-text">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-lg font-semibold">{blueprint.complexity.total}</span>
            </div>
          </InfoTile>
          <InfoTile label="Est. Runtime">
            <div className="flex items-center justify-center gap-1.5 text-prism-text">
              <Clock className="w-4 h-4 text-prism-jade" />
              <span className="text-lg font-semibold">{blueprint.estimatedTime}</span>
            </div>
          </InfoTile>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-prism-muted">Dimensional Agent Deployment</h3>
          <div className="space-y-3">
            {blueprint.agents.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="glass-panel rounded-xl p-4 flex items-center gap-3 group"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{ backgroundColor: `${agent.color}1a`, borderColor: `${agent.color}66` }}
                >
                  <span className="text-lg font-bold" style={{ color: agent.color }}>
                    {agent.name.charAt(0)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-semibold text-sm text-prism-text truncate">{agent.name}</h4>
                    <span className="text-[10px] font-mono px-1.5 py-px rounded prism-chip uppercase tracking-[0.08em]">{agent.archetype}</span>
                  </div>
                  <p className="text-xs text-prism-muted truncate">{agent.mandate}</p>
                </div>

                <div className="hidden lg:flex items-center gap-1.5">
                  {agent.tools.map((tool) => (
                    <span key={tool} className="text-[10px] font-mono px-2 py-0.5 rounded prism-chip uppercase tracking-[0.06em]">
                      {tool}
                    </span>
                  ))}
                </div>

                <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/5" aria-label="Edit agent">
                  <Pencil className="w-3.5 h-3.5 text-prism-muted" />
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-3 pt-2 pb-4"
        >
          <button onClick={onCancel} className="prism-button-ghost px-5 py-2.5 text-sm">
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button onClick={onApprove} data-tour-id="tour-deploy-agents" className="prism-button-primary px-8 py-3 text-sm">
            <Radar className="w-4 h-4" />
            Deploy Agents
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function InfoTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 text-center space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-prism-muted">{label}</p>
      {children}
    </div>
  );
}

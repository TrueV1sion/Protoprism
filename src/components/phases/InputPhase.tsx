"use client";

import { motion } from "framer-motion";
import { Send, Settings as SettingsIcon, Sparkles, Play, Info } from "lucide-react";
import MissionFeed from "@/components/MissionFeed";

interface InputPhaseProps {
  query: string;
  setQuery: (query: string) => void;
  onSubmitLive: (e: React.FormEvent) => void;
  onOpenSettings: () => void;
}

const STARTER_QUERIES = [
  "Analyze CMS 2027 Star Ratings cut-point pressure on payer strategy",
  "Assess GLP-1 adoption impact on Medicare Advantage margin durability",
  "Map M&A vulnerability and consolidation risk among regional MA plans",
];

export default function InputPhase({
  query,
  setQuery,
  onSubmitLive,
  onOpenSettings,
}: InputPhaseProps) {
  return (
    <div className="flex-1 relative overflow-y-auto overflow-x-hidden text-white selection:bg-cyan-500/30">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 max-w-[1800px] mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-8 md:pb-12 flex flex-col gap-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 items-stretch"
        >
          <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col justify-between min-h-[360px]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-wider">
                Featured Analysis
              </div>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white">
                Strategic Intelligence
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">in Motion</span>
              </h1>
              <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-2xl">
                Launch a coordinated AI agent swarm for executive-level healthcare strategy analysis with real-time triage and synthesis control.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-6">
              <button
                onClick={() => {
                  if (!query.trim()) {
                    setQuery(STARTER_QUERIES[0]);
                  }
                }}
                className="prism-button-primary px-6 py-2.5 text-sm"
              >
                <Play className="w-4 h-4" />
                Play Mission
              </button>
              <button onClick={onOpenSettings} className="prism-button-secondary px-6 py-2.5 text-sm">
                <Info className="w-4 h-4" />
                <SettingsIcon className="w-4 h-4" />
                Platform Settings
              </button>
            </div>
          </div>

          <form onSubmit={onSubmitLive} className="glass-panel rounded-2xl p-5 md:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-prism-muted uppercase tracking-[0.12em]">
                <Sparkles className="w-3.5 h-3.5 text-prism-sky" />
                Strategic Prompt
              </div>
              <span className="text-[11px] font-mono text-prism-muted/80">Live Pipeline</span>
            </div>

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Define the mission objective, affected market, and decision horizon..."
              className="prism-textarea min-h-[210px] resize-none px-4 py-4 text-base leading-relaxed"
            />

            <div className="prism-divider" />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-prism-muted">
                <span className="prism-chip px-2.5 py-1">Claude-Native</span>
                <span className="prism-chip px-2.5 py-1">Human-in-the-Loop</span>
                <span className="prism-chip px-2.5 py-1">Emergence Detection</span>
              </div>
              <button
                type="submit"
                disabled={!query.trim()}
                className={`prism-button-primary px-6 py-2.5 text-sm ${!query.trim() ? "opacity-45 cursor-not-allowed" : ""}`}
              >
                Run Live Analysis
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </motion.section>

        {/* Mission Feed — active + recent runs */}
        <MissionFeed />

        {/* Starter Queries */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5 }}
          className="glass-panel rounded-2xl p-4 sm:p-5"
        >
          <div className="flex flex-wrap gap-2">
            {STARTER_QUERIES.map((starter, i) => (
              <button
                key={i}
                onClick={() => setQuery(starter)}
                className="prism-button-secondary text-left px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed flex-1 min-w-[220px]"
              >
                {starter}
              </button>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

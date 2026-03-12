"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  Users,
  Layers,
  ChevronRight,
  Search,
  Activity,
  CheckCircle2,
  AlertCircle,
  Hexagon,
  FileText,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface RunSummary {
  id: string;
  query: string;
  status: string;
  tier: string;
  complexityScore: number;
  autonomyMode: string;
  createdAt: string;
  completedAt: string | null;
  agents: { id: string; name: string; archetype: string; color: string; status: string }[];
  dimensions: { id: string; name: string }[];
  presentation: { id: string; title: string; htmlPath: string; slideCount: number } | null;
  _count: { findings: number; synthesis: number };
}

const tierColors: Record<string, string> = {
  MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/25",
  STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/25",
  EXTENDED: "bg-[#89b5ff]/10 text-[#9cc4ff] border-[#89b5ff]/30",
  MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/25",
  CAMPAIGN: "bg-red-400/10 text-red-400 border-red-400/25",
};

const statusConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  INITIALIZE: { icon: Hexagon, color: "text-prism-muted", label: "Initializing" },
  THINK: { icon: Activity, color: "text-prism-sky", label: "Thinking" },
  CONSTRUCT: { icon: Activity, color: "text-prism-sky", label: "Constructing" },
  DEPLOY: { icon: Activity, color: "text-prism-sky", label: "Deploying" },
  SPAWN: { icon: Activity, color: "text-prism-sky", label: "Spawning" },
  EXECUTE: { icon: Activity, color: "text-prism-sky", label: "Executing" },
  MONITOR: { icon: Activity, color: "text-amber-400", label: "Monitoring" },
  SYNTHESIZE: { icon: Layers, color: "text-[#a8c9ff]", label: "Synthesizing" },
  COMPLETE: { icon: CheckCircle2, color: "text-prism-jade", label: "Complete" },
  DELIVER: { icon: CheckCircle2, color: "text-prism-jade", label: "Complete" },
  FAILED: { icon: AlertCircle, color: "text-red-400", label: "Failed" },
};

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTier) params.set("tier", filterTier);
      const res = await fetch(`/api/history?${params.toString()}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [filterTier]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const filtered = runs.filter(
    (r) =>
      r.query.toLowerCase().includes(search.toLowerCase()) ||
      r.agents.some((a) => a.name.toLowerCase().includes(search.toLowerCase()))
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const getDuration = (created: string, completed: string | null) => {
    if (!completed) return "-";
    const ms = new Date(completed).getTime() - new Date(created).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 md:px-10 py-5 sm:py-8 gap-5 sm:gap-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="prism-button-ghost px-3 py-1.5 text-xs">
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Command Center
            </Link>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-5 h-5 text-prism-sky" />
              <h1 className="text-lg sm:text-xl font-bold text-prism-text truncate">Run History</h1>
            </div>
          </div>
          <span className="prism-chip px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.08em]">{runs.length} runs</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prism-muted/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by query or agent"
              className="prism-input pl-10 pr-4 py-2.5 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["", "MICRO", "STANDARD", "EXTENDED", "MEGA"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={`text-[10px] font-mono px-3 py-2 rounded-lg border uppercase tracking-[0.08em] transition-colors ${
                  filterTier === t
                    ? "bg-prism-sky/12 text-prism-sky border-prism-sky/35"
                    : "text-prism-muted border-white/12 hover:text-prism-text"
                }`}
              >
                {t || "ALL"}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="glass-panel rounded-2xl flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-prism-muted">
              <Activity className="w-5 h-5 animate-pulse" />
              <span className="text-sm">Loading run history...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-20 text-center">
            <Hexagon className="w-12 h-12 text-prism-muted/30 mb-4" />
            <h3 className="text-sm font-medium text-prism-muted mb-1">{runs.length === 0 ? "No runs yet" : "No matching runs"}</h3>
            <p className="text-xs text-prism-muted/65">
              {runs.length === 0 ? "Run your first analysis from the command center." : "Try a different search term or tier filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((run, i) => {
              const sc = statusConfig[run.status] || statusConfig.INITIALIZE;
              const StatusIcon = sc.icon;
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => {
                    if (run.presentation) {
                      window.open(run.presentation.htmlPath, "_blank");
                    }
                  }}
                  className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-prism-sky/30 transition-all cursor-pointer group"
                >
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${sc.color} shrink-0`} />
                        <h3 className="text-sm font-semibold text-prism-text truncate group-hover:text-prism-sky transition-colors">{run.query}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-prism-muted">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-[0.08em] ${tierColors[run.tier]}`}>{run.tier}</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {run.agents.length} agents
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {run._count.findings} findings
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {run._count.synthesis} layers
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getDuration(run.createdAt, run.completedAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {run.agents.slice(0, 5).map((agent) => (
                          <span key={agent.id} className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full prism-chip" style={{ color: agent.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
                            {agent.name}
                          </span>
                        ))}
                        {run.agents.length > 5 && <span className="text-[10px] text-prism-muted px-2 py-0.5">+{run.agents.length - 5}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row xl:flex-col xl:items-end gap-2.5 sm:justify-between">
                      <div className="text-xs text-prism-muted xl:text-right">
                        <div>{formatDate(run.createdAt)}</div>
                        <div>{formatTime(run.createdAt)}</div>
                      </div>
                      <span className={`text-[10px] font-mono uppercase tracking-[0.08em] ${sc.color}`}>{sc.label}</span>
                      {run.presentation && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(run.presentation!.htmlPath, "_blank");
                          }}
                          className="prism-button-secondary px-3 py-1.5 text-[11px]"
                        >
                          <Sparkles className="w-3 h-3" />
                          View Brief
                          <span className="text-[9px] text-prism-sky/70">{run.presentation.slideCount} slides</span>
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

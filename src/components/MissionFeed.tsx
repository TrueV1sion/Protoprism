"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, CheckCircle2, XCircle, Clock, Eye, ExternalLink, ChevronRight } from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────

interface RunSummary {
  id: string;
  query: string;
  status: string;
  tier: string | null;
  createdAt: string;
  completedAt: string | null;
  agents: { id: string; name: string; archetype: string; status: string }[];
  presentation: { id: string; title: string; htmlPath: string; slideCount: number } | null;
  _count: { findings: number; synthesis: number };
}

// ─── Status Helpers ─────────────────────────────────────────

const ACTIVE_STATUSES = ["INITIALIZE", "THINK", "CONSTRUCT", "DEPLOY", "SYNTHESIZE", "QUALITY_ASSURANCE", "VERIFY", "PRESENT"];
const TERMINAL_STATUSES = ["COMPLETE", "FAILED", "CANCELLED"];

function isActive(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function phaseLabel(status: string): string {
  const labels: Record<string, string> = {
    INITIALIZE: "Initializing",
    THINK: "Thinking",
    CONSTRUCT: "Constructing",
    DEPLOY: "Deploying Agents",
    SYNTHESIZE: "Synthesizing",
    QUALITY_ASSURANCE: "Quality Check",
    VERIFY: "Verifying",
    PRESENT: "Presenting",
    COMPLETE: "Complete",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  };
  return labels[status] ?? status;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── RunCard ────────────────────────────────────────────────

function RunCard({ run }: { run: RunSummary }) {
  const active = isActive(run.status);
  const failed = run.status === "FAILED" || run.status === "CANCELLED";
  const complete = run.status === "COMPLETE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all group"
    >
      {/* Status indicator */}
      <div className="shrink-0">
        {active && (
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse" />
        )}
        {complete && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {failed && <XCircle className="w-4 h-4 text-red-400" />}
      </div>

      {/* Query + metadata */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{run.query}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
          {active && <span>Started {timeAgo(run.createdAt)}</span>}
          {!active && <span>{timeAgo(run.completedAt ?? run.createdAt)}</span>}
          {run.agents.length > 0 && <span>· {run.agents.length} agents</span>}
          {complete && run._count.findings > 0 && <span>· {run._count.findings} findings</span>}
          {complete && run.presentation && <span>· {run.presentation.slideCount} slides</span>}
        </div>
      </div>

      {/* Phase badge */}
      <span
        className={`shrink-0 text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-md ${
          active
            ? "bg-cyan-500/15 text-cyan-400"
            : complete
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
        }`}
      >
        {phaseLabel(run.status)}
      </span>

      {/* Action */}
      {complete && run.presentation && (
        <a
          href={run.presentation.htmlPath}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          View <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </motion.div>
  );
}

// ─── MissionFeed ────────────────────────────────────────────

interface MissionFeedProps {
  /** Currently streaming run ID — exclude from fetch to avoid duplication */
  currentRunId?: string | null;
}

export default function MissionFeed({ currentRunId }: MissionFeedProps) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/history?limit=10");
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    // Poll every 15s for active run updates
    const interval = setInterval(fetchRuns, 15000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  // Split into active + recent, excluding current streaming run
  const filtered = runs.filter((r) => r.id !== currentRunId);
  const activeRuns = filtered.filter((r) => isActive(r.status));
  const recentRuns = filtered.filter((r) => TERMINAL_STATUSES.includes(r.status)).slice(0, 5);

  // Don't render if no runs exist yet
  if (!loading && activeRuns.length === 0 && recentRuns.length === 0) {
    return null;
  }

  if (loading) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.5 }}
      className="space-y-4"
    >
      {/* Active Missions */}
      {activeRuns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
              Active Missions
            </span>
          </div>
          <AnimatePresence mode="popLayout">
            {activeRuns.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Recent Missions */}
      {recentRuns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
              Recent Missions
            </span>
            <Link
              href="/history"
              className="flex items-center gap-1 text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
            >
              View All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <AnimatePresence mode="popLayout">
            {recentRuns.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Clock,
    Users,
    Layers,
    ChevronRight,
    Search,
    Filter,
    Activity,
    CheckCircle2,
    AlertCircle,
    Hexagon,
    FileText,
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
    MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/20",
    STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/20",
    EXTENDED: "bg-violet-400/10 text-violet-400 border-violet-400/20",
    MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    CAMPAIGN: "bg-red-400/10 text-red-400 border-red-400/20",
};

const statusConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
    INITIALIZE: { icon: Hexagon, color: "text-prism-muted", label: "Initializing" },
    THINK: { icon: Activity, color: "text-prism-sky", label: "Thinking" },
    CONSTRUCT: { icon: Activity, color: "text-prism-sky", label: "Constructing" },
    DEPLOY: { icon: Activity, color: "text-prism-sky", label: "Deploying" },
    SPAWN: { icon: Activity, color: "text-prism-sky", label: "Spawning" },
    EXECUTE: { icon: Activity, color: "text-prism-sky", label: "Executing" },
    MONITOR: { icon: Activity, color: "text-amber-400", label: "Monitoring" },
    SYNTHESIZE: { icon: Layers, color: "text-violet-400", label: "Synthesizing" },
    COMPLETE: { icon: CheckCircle2, color: "text-prism-jade", label: "Complete" },
    DELIVER: { icon: CheckCircle2, color: "text-prism-jade", label: "Complete" },
    FAILED: { icon: AlertCircle, color: "text-red-400", label: "Failed" },
};

export default function HistoryPage() {
    const [runs, setRuns] = useState<RunSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterTier, setFilterTier] = useState<string>("");

    useEffect(() => {
        fetchRuns();
    }, [filterTier]);

    async function fetchRuns() {
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
    }

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
        if (!completed) return "—";
        const ms = new Date(completed).getTime() - new Date(created).getTime();
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 md:px-10 pt-6 md:pt-10 pb-6 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="text-xs text-prism-muted hover:text-white transition-colors flex items-center gap-1"
                        >
                            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                            Command Center
                        </Link>
                        <div className="w-px h-5 bg-white/10" />
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-prism-sky" />
                            <h1 className="text-xl font-bold text-white">Run History</h1>
                        </div>
                    </div>
                    <div className="text-xs font-mono text-prism-muted">
                        {runs.length} runs
                    </div>
                </motion.div>

                {/* Search + Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex gap-3"
                >
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prism-muted/50" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by query or agent name..."
                            className="w-full bg-white/[0.03] border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-prism-muted/40 outline-none focus:border-prism-sky/30 transition-colors"
                        />
                    </div>
                    <div className="flex gap-1.5">
                        {["", "MICRO", "STANDARD", "EXTENDED", "MEGA"].map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilterTier(t)}
                                className={`text-[10px] font-mono px-3 py-2 rounded-lg border transition-colors ${filterTier === t
                                    ? "bg-prism-sky/10 text-prism-sky border-prism-sky/30"
                                    : "text-prism-muted border-white/5 hover:border-white/10"
                                    }`}
                            >
                                {t || "ALL"}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Run List */}
            <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex items-center gap-3 text-prism-muted">
                            <Activity className="w-5 h-5 animate-pulse" />
                            <span className="text-sm">Loading run history...</span>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Hexagon className="w-12 h-12 text-prism-muted/30 mb-4" />
                        <h3 className="text-sm font-medium text-prism-muted mb-1">
                            {runs.length === 0 ? "No runs yet" : "No matching runs"}
                        </h3>
                        <p className="text-xs text-prism-muted/60">
                            {runs.length === 0
                                ? "Run your first strategic analysis from the Command Center"
                                : "Try a different search term or filter"}
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
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => {
                                        if (run.presentation) {
                                            window.open(run.presentation.htmlPath, "_blank");
                                        }
                                    }}
                                    className="glass-panel rounded-xl p-5 border border-white/5 hover:border-prism-sky/10 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        {/* Left: Query + Meta */}
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <StatusIcon className={`w-4 h-4 ${sc.color} flex-shrink-0`} />
                                                <h3 className="text-sm font-semibold text-white truncate group-hover:text-prism-sky transition-colors">
                                                    {run.query}
                                                </h3>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs text-prism-muted">
                                                <span className={`px-2 py-0.5 rounded-full border ${tierColors[run.tier]}`}>
                                                    {run.tier}
                                                </span>
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

                                            {/* Agent chips */}
                                            <div className="flex flex-wrap gap-1.5">
                                                {run.agents.slice(0, 5).map((agent) => (
                                                    <span
                                                        key={agent.id}
                                                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/5"
                                                        style={{ color: agent.color }}
                                                    >
                                                        <span
                                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: agent.color }}
                                                        />
                                                        {agent.name}
                                                    </span>
                                                ))}
                                                {run.agents.length > 5 && (
                                                    <span className="text-[10px] text-prism-muted px-2 py-0.5">
                                                        +{run.agents.length - 5} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Date + Status + Actions */}
                                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                            <div className="text-xs text-prism-muted text-right">
                                                <div>{formatDate(run.createdAt)}</div>
                                                <div>{formatTime(run.createdAt)}</div>
                                            </div>
                                            <span className={`text-[10px] font-mono ${sc.color}`}>
                                                {sc.label}
                                            </span>
                                            {run.presentation && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(run.presentation!.htmlPath, "_blank");
                                                    }}
                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-prism-sky/10 text-prism-sky border border-prism-sky/20 hover:bg-prism-sky/20 transition-colors"
                                                >
                                                    <FileText className="w-3 h-3" />
                                                    View Brief
                                                    <span className="text-[9px] text-prism-sky/60">
                                                        {run.presentation.slideCount} slides
                                                    </span>
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

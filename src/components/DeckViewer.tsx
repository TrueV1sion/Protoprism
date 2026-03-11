"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    X,
    Maximize2,
    Minimize2,
    Download,
    Printer,
    Eye,
    EyeOff,
    ChevronLeft,
    Layers,
    Shield,
    FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DeckMeta } from "@/lib/deck-data";

interface DeckViewerProps {
    deck: DeckMeta;
    onClose: () => void;
}

interface ProvenanceItem {
    finding: string;
    agent: string;
    archetype: string;
    confidence: string;
    sources: string;
    color: string;
}

export default function DeckViewer({ deck, onClose }: DeckViewerProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showProvenance, setShowProvenance] = useState(false);
    const [provenanceData, setProvenanceData] = useState<ProvenanceItem[]>([]);

    // Fetch real provenance data from API
    useEffect(() => {
        async function fetchProvenance() {
            try {
                const res = await fetch(`/api/decks/${deck.id}/provenance`);
                if (res.ok) {
                    const data = await res.json();
                    setProvenanceData(data);
                }
            } catch (err) {
                console.warn('Provenance fetch failed:', err);
            }
        }
        fetchProvenance();
    }, [deck.id]);

    useEffect(() => {
        console.log('DeckViewer mounted, loading:', `/decks/${deck.filename}`);

        const iframe = iframeRef.current;
        if (iframe) {
            iframe.onload = () => {
                console.log('Iframe loaded successfully');
            };
            iframe.onerror = (err) => {
                console.error('Iframe failed to load:', err);
            };
        }
    }, [deck.filename]);

    // Keyboard shortcut: Escape to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (isFullscreen) setIsFullscreen(false);
                else onClose();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isFullscreen, onClose]);

    const toggleFullscreen = useCallback(() => setIsFullscreen((prev) => !prev), []);

    const handleDownload = useCallback(() => {
        const a = document.createElement("a");
        a.href = `/decks/${deck.filename}`;
        a.download = deck.filename;
        a.click();
    }, [deck.filename]);

    const handlePrint = useCallback(() => {
        iframeRef.current?.contentWindow?.print();
    }, []);

    const confidenceColor = deck.confidence >= 0.9
        ? "text-prism-jade"
        : deck.confidence >= 0.8
            ? "text-prism-sky"
            : "text-amber-400";

    const tierColors: Record<string, string> = {
        MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/20",
        STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/20",
        EXTENDED: "bg-violet-400/10 text-violet-400 border-violet-400/20",
        MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 z-50 flex flex-col ${isFullscreen ? "" : "p-4 md:p-8"}`}
                style={{ background: "rgba(5, 6, 12, 0.95)" }}
            >
                {/* ─── Toolbar ─────────────────────────────────── */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 bg-[#0d0e16] border-b border-white/5 ${isFullscreen ? "" : "rounded-t-xl border-x border-t border-white/5"}`}
                >
                    {/* Left: Back + Title */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1.5 text-xs text-prism-muted hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Library
                        </button>
                        <div className="w-px h-5 bg-white/10" />
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white truncate">{deck.title}</h3>
                        </div>
                    </div>

                    {/* Center: Deck meta */}
                    <div className="hidden md:flex items-center gap-3 text-xs font-mono">
                        <span className={`px-2 py-0.5 rounded-full border ${tierColors[deck.tier]}`}>
                            {deck.tier}
                        </span>
                        <span className="text-prism-muted">
                            {deck.agentCount} agents
                        </span>
                        <span className="text-prism-muted">
                            {deck.slideCount} slides
                        </span>
                        <span className={confidenceColor}>
                            {Math.round(deck.confidence * 100)}% confidence
                        </span>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowProvenance(!showProvenance)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showProvenance
                                ? "bg-prism-sky/20 text-prism-sky border border-prism-sky/30"
                                : "text-prism-muted hover:text-white hover:bg-white/5"
                                }`}
                            title="Toggle provenance overlay"
                        >
                            {showProvenance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            Provenance
                        </button>
                        <button
                            onClick={handleDownload}
                            className="p-2 text-prism-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Download HTML"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handlePrint}
                            className="p-2 text-prism-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Print to PDF"
                        >
                            <Printer className="w-4 h-4" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-2 text-prism-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-prism-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>

                {/* ─── Content Area ────────────────────────────── */}
                <div className={`flex-1 flex overflow-hidden ${isFullscreen ? "" : "border-x border-b border-white/5 rounded-b-xl"}`}>
                    {/* Iframe */}
                    <div className="flex-1 relative bg-[#0a0b10]">
                        <iframe
                            ref={iframeRef}
                            src={`/decks/${deck.filename}`}
                            className="w-full h-full border-0"
                            title={deck.title}
                            sandbox="allow-scripts"
                        />
                    </div>

                    {/* ─── Provenance Panel ────────────────────── */}
                    <AnimatePresence>
                        {showProvenance && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 380, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="border-l border-white/5 bg-[#0d0e16] overflow-y-auto overflow-x-hidden flex-shrink-0"
                            >
                                <div className="p-5 space-y-5 w-[380px]">
                                    {/* Header */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-xs font-mono text-prism-sky">
                                            <Shield className="w-3.5 h-3.5" />
                                            PROVENANCE & LINEAGE
                                        </div>
                                        <p className="text-xs text-prism-muted">
                                            Trace every insight back to its originating agent, data sources, and confidence assessment.
                                        </p>
                                    </div>

                                    {/* Agent Roster */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Agent Roster</h4>
                                        <div className="space-y-1.5">
                                            {deck.agents.map((agent) => (
                                                <div
                                                    key={agent.name}
                                                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5"
                                                >
                                                    <span
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: agent.color }}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <span className="text-xs text-white font-medium block truncate">{agent.name}</span>
                                                        <span className="text-[10px] text-prism-muted font-mono">{agent.archetype}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Provenance Trace */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Finding Provenance</h4>
                                        <div className="space-y-3">
                                            {provenanceData.map((item, i) => (
                                                <div
                                                    key={i}
                                                    className="rounded-lg bg-white/[0.02] border border-white/5 p-3 space-y-2"
                                                    style={{ borderLeftWidth: 3, borderLeftColor: item.color }}
                                                >
                                                    <p className="text-xs text-white/90 leading-relaxed">{item.finding}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <span
                                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5"
                                                            style={{ color: item.color }}
                                                        >
                                                            {item.agent}
                                                        </span>
                                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${item.confidence === "HIGH"
                                                            ? "bg-prism-jade/10 text-prism-jade"
                                                            : item.confidence === "MEDIUM"
                                                                ? "bg-amber-400/10 text-amber-400"
                                                                : "bg-red-400/10 text-red-400"
                                                            }`}>
                                                            {item.confidence}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-prism-muted">
                                                        <FileText className="w-3 h-3 inline mr-1 opacity-50" />
                                                        {item.sources}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Synthesis Meta */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Synthesis Metadata</h4>
                                        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-prism-muted">Swarm Tier</span>
                                                <span className="text-white font-mono">{deck.tier}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-prism-muted">Overall Confidence</span>
                                                <span className={`font-mono ${confidenceColor}`}>
                                                    {Math.round(deck.confidence * 100)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-prism-muted">Dimensions</span>
                                                <span className="text-white font-mono">{deck.dimensions.length}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-prism-muted">Emergence Algorithms</span>
                                                <span className="text-white font-mono">4 applied</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-prism-muted">Validation</span>
                                                <span className="text-prism-jade font-mono text-[10px]">PRISM Multi-Source</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dimensions */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Analytical Dimensions</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {deck.dimensions.map((dim) => (
                                                <span
                                                    key={dim}
                                                    className="text-[10px] font-medium px-2 py-1 rounded-full bg-white/5 text-prism-muted border border-white/5"
                                                >
                                                    {dim}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

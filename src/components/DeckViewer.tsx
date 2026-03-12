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
  Shield,
  FileText,
  Play,
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

  useEffect(() => {
    async function fetchProvenance() {
      try {
        const res = await fetch(`/api/decks/${deck.id}/provenance`);
        if (res.ok) {
          const data = (await res.json()) as ProvenanceItem[];
          setProvenanceData(data);
        }
      } catch {
        setProvenanceData([]);
      }
    }
    fetchProvenance();
  }, [deck.id]);

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

  const confidenceColor =
    deck.confidence >= 0.9
      ? "text-prism-jade"
      : deck.confidence >= 0.8
        ? "text-prism-sky"
        : "text-amber-400";

  const tierColors: Record<string, string> = {
    MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/25",
    STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/25",
    EXTENDED: "bg-[#89b5ff]/10 text-[#9cc4ff] border-[#89b5ff]/30",
    MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/25",
  };

  const iconButtonClass =
    "p-2 rounded-lg border border-white/10 text-prism-muted hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-50 flex flex-col ${isFullscreen ? "" : "p-3 md:p-6"}`}
        style={{ background: "rgba(2, 6, 23, 0.95)" }}
      >
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className={`flex items-center justify-between gap-4 px-4 py-2.5 bg-[#020612] border-b border-white/10 ${
            isFullscreen ? "" : "rounded-t-xl border-x border-t border-white/10"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} className="prism-button-ghost px-3 py-1.5 text-xs">
              <ChevronLeft className="w-4 h-4" />
              Library
            </button>
            <div className="w-px h-5 bg-white/10" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{deck.title}</h3>
              <p className="text-[11px] text-prism-muted truncate">{deck.subtitle}</p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-3 text-xs font-mono">
            <span className={`px-2 py-0.5 rounded-full border uppercase tracking-[0.08em] ${tierColors[deck.tier]}`}>
              {deck.tier}
            </span>
            <span className="text-prism-muted">{deck.agentCount} agents</span>
            <span className="text-prism-muted">{deck.slideCount} slides</span>
            <span className={confidenceColor}>{Math.round(deck.confidence * 100)}% confidence</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowProvenance((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                showProvenance
                  ? "bg-prism-sky/20 text-prism-sky border-prism-sky/35"
                  : "text-prism-muted border-white/10 hover:text-white hover:border-white/20 hover:bg-white/5"
              }`}
              title="Toggle provenance overlay"
            >
              {showProvenance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Provenance</span>
            </button>
            <button onClick={handleDownload} className={iconButtonClass} title="Download HTML">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={handlePrint} className={iconButtonClass} title="Print to PDF">
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className={iconButtonClass} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className={iconButtonClass} title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        <div className={`flex-1 flex overflow-hidden ${isFullscreen ? "" : "border-x border-b border-white/10 rounded-b-xl"}`}>
          <div className="flex-1 relative bg-[#020612]">
            <iframe
              ref={iframeRef}
              src={`/decks/${deck.filename}`}
              className="w-full h-full border-0"
              title={deck.title}
              sandbox="allow-scripts"
            />

            {!showProvenance && (
              <div className="absolute left-4 bottom-4">
                <button
                  onClick={() => setShowProvenance(true)}
                  className="prism-button-secondary px-4 py-2 text-xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  Show Provenance
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {showProvenance && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 420, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute right-0 top-0 bottom-0 z-20 border-l border-white/10 bg-[#030816] overflow-y-auto overflow-x-hidden flex-shrink-0 lg:relative"
              >
                <div className="p-5 space-y-5 w-[min(92vw,420px)] lg:w-[420px]">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-mono text-prism-sky uppercase tracking-[0.1em]">
                      <Shield className="w-3.5 h-3.5" />
                      Provenance & Lineage
                    </div>
                    <p className="text-xs text-prism-muted">
                      Every insight is traceable to its source evidence, originating agent, and confidence level.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Agent Roster</h4>
                    <div className="space-y-1.5">
                      {deck.agents.map((agent) => (
                        <div key={agent.name} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-white font-medium block truncate">{agent.name}</span>
                            <span className="text-[10px] text-prism-muted font-mono">{agent.archetype}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Finding Provenance</h4>
                    <div className="space-y-3">
                      {provenanceData.length === 0 && (
                        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs text-prism-muted">
                          Provenance entries will appear once source mappings are available.
                        </div>
                      )}
                      {provenanceData.map((item, i) => (
                        <div
                          key={i}
                          className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2"
                          style={{ borderLeftWidth: 3, borderLeftColor: item.color }}
                        >
                          <p className="text-xs text-white/90 leading-relaxed">{item.finding}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5" style={{ color: item.color }}>
                              {item.agent}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                item.confidence === "HIGH"
                                  ? "bg-prism-jade/10 text-prism-jade"
                                  : item.confidence === "MEDIUM"
                                    ? "bg-amber-400/10 text-amber-400"
                                    : "bg-red-400/10 text-red-400"
                              }`}
                            >
                              {item.confidence}
                            </span>
                          </div>
                          <p className="text-[10px] text-prism-muted leading-relaxed">
                            <FileText className="w-3 h-3 inline mr-1 opacity-60" />
                            {item.sources}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Synthesis Metadata</h4>
                    <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                      <MetaRow label="Swarm Tier" value={deck.tier} />
                      <MetaRow label="Overall Confidence" value={`${Math.round(deck.confidence * 100)}%`} className={confidenceColor} />
                      <MetaRow label="Dimensions" value={`${deck.dimensions.length}`} />
                      <MetaRow label="Emergence Algorithms" value="4 applied" />
                      <MetaRow label="Validation" value="PRISM Multi-Source" className="text-prism-jade" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Analytical Dimensions</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {deck.dimensions.map((dim) => (
                        <span key={dim} className="text-[10px] font-medium px-2 py-1 rounded-full bg-white/5 text-prism-muted border border-white/10">
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

function MetaRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-prism-muted">{label}</span>
      <span className={`font-mono text-white ${className ?? ""}`}>{value}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Layers,
  Clock,
  ChevronRight,
  Library,
  Search,
  Hexagon,
  Play,
} from "lucide-react";
import { DeckMeta, DECK_LIBRARY } from "@/lib/deck-data";

interface DeckLibraryProps {
  onSelectDeck: (deck: DeckMeta) => void;
  onBack: () => void;
}

export default function DeckLibrary({ onSelectDeck, onBack }: DeckLibraryProps) {
  const [search, setSearch] = useState("");

  const filtered = DECK_LIBRARY.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.subtitle.toLowerCase().includes(search.toLowerCase()) ||
      d.dimensions.some((dim) => dim.toLowerCase().includes(search.toLowerCase()))
  );

  const tierColors: Record<string, string> = {
    MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/25",
    STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/25",
    EXTENDED: "bg-[#89b5ff]/10 text-[#9cc4ff] border-[#89b5ff]/30",
    MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/25",
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 md:px-8 py-5 sm:py-8 gap-5 sm:gap-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="prism-button-ghost px-3 py-1.5 text-xs">
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Command Center
            </button>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2 min-w-0">
              <Library className="w-5 h-5 text-prism-sky" />
              <h1 className="text-lg sm:text-xl font-bold text-prism-text truncate">Intelligence Library</h1>
            </div>
          </div>
          <span className="prism-chip px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.08em]">{DECK_LIBRARY.length} briefs</span>
        </div>

        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prism-muted/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, thesis, or dimension"
            className="prism-input pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {filtered.map((deck, i) => (
            <motion.button
              key={deck.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onSelectDeck(deck)}
              className="group text-left glass-panel rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-400/35 transition-all duration-300 hover:scale-[1.02] hover:z-10"
            >
              <div className="relative h-32 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/35 via-slate-800/35 to-emerald-600/28" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                <div className="absolute right-3 top-3">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-[0.08em] ${tierColors[deck.tier]}`}>
                    {deck.tier}
                  </span>
                </div>
                <div className="absolute left-4 bottom-3 flex items-center gap-2 text-white">
                  <div className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center group-hover:bg-cyan-400 transition-colors">
                    <Play size={13} fill="currentColor" />
                  </div>
                  <span className="text-xs font-semibold tracking-wide">Play Brief</span>
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold text-prism-text group-hover:text-cyan-300 transition-colors truncate">{deck.title}</h3>
                <p className="text-xs text-prism-muted mt-0.5 truncate">{deck.subtitle}</p>

                <div className="flex flex-wrap items-center gap-3 text-xs text-prism-muted mt-4 mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {deck.agentCount} agents
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {deck.slideCount} slides
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(deck.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em]">
                    <span className="text-prism-muted">Confidence</span>
                    <span className={`font-mono font-semibold ${deck.confidence >= 0.9 ? "text-prism-jade" : deck.confidence >= 0.8 ? "text-prism-sky" : "text-amber-400"}`}>
                      {Math.round(deck.confidence * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${deck.confidence * 100}%`,
                        background:
                          deck.confidence >= 0.9
                            ? "linear-gradient(90deg, #10b981, #22d3ee)"
                            : deck.confidence >= 0.8
                              ? "linear-gradient(90deg, #0891b2, #22d3ee)"
                              : "linear-gradient(90deg, #f59e0b, #fcd34d)",
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-hidden">
                  <div className="translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="flex items-center gap-1 text-xs text-cyan-300 font-medium">
                      Open intelligence brief
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-20 text-center mt-2">
            <Hexagon className="w-12 h-12 text-prism-muted/35 mb-4" />
            <h3 className="text-sm font-medium text-prism-muted mb-1">No briefs match this search</h3>
            <p className="text-xs text-prism-muted/70">Try a different keyword or clear the filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}

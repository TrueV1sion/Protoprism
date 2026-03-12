"use client";

import { motion } from "framer-motion";
import { ChevronRight, Sparkles, Play } from "lucide-react";

export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col items-center justify-center min-h-screen px-4 md:px-6 text-center"
    >
      <div className="w-full max-w-4xl glass-panel rounded-3xl p-8 md:p-12">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Welcome
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white">
            PRISM
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Strategic Intelligence Studio</span>
          </h1>

          <p className="text-base md:text-lg text-prism-muted max-w-2xl mx-auto leading-relaxed">
            Deploy coordinated AI specialists to analyze complex questions, curate findings with human oversight,
            and generate decision-ready intelligence briefs.
          </p>
        </div>

        <div className="flex items-center justify-center pt-8">
          <button onClick={onNext} className="prism-button-primary px-8 py-3 text-sm">
            <Play className="w-4 h-4" />
            Start Setup
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

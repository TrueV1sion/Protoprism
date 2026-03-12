"use client";

import { motion } from "framer-motion";
import { Layers, Sparkles } from "lucide-react";
import type { SynthesisLayer } from "@/lib/types";
import type { StreamEmergence } from "@/hooks/use-research-stream";

interface SynthesisPhaseProps {
  synthesisLayers: SynthesisLayer[];
  emergences: StreamEmergence[];
  phaseMessage: string;
  isLiveMode: boolean;
  isComplete?: boolean;
}

export default function SynthesisPhase({
  synthesisLayers,
  emergences,
  phaseMessage,
  isLiveMode,
  isComplete = false,
}: SynthesisPhaseProps) {
  const layerNames = isLiveMode ? synthesisLayers.map((l) => l.name) : ["Foundation", "Convergence"];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl glass-panel rounded-3xl p-6 sm:p-10 text-center space-y-8"
      >
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-prism-sky/35 animate-ping" />
          <div className="absolute inset-3 rounded-full border border-prism-jade/30 animate-[ping_2.2s_ease-in-out_infinite]" />
          <div className="absolute inset-6 rounded-full bg-prism-sky/12 flex items-center justify-center">
            <Layers className="w-8 h-8 text-prism-sky animate-[floatGlow_2.8s_ease-in-out_infinite]" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="prism-kicker mx-auto">
            <Sparkles className="w-3.5 h-3.5" />
            Emergence Engine
          </div>
          <h2 className="text-2xl sm:text-3xl text-prism-text font-bold">Synthesizing Cross-Agent Signal</h2>
          <p className="text-sm text-prism-muted max-w-2xl mx-auto leading-relaxed">
            {isLiveMode && phaseMessage
              ? phaseMessage
              : "Applying cross-agent theme mining, tension mapping, and structural pattern recognition to produce strategic synthesis layers."}
          </p>
        </div>

        <div data-tour-id="tour-synthesis-layers" className="flex flex-wrap items-center justify-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.08em]">
          {layerNames.map((name, i) => (
            <span key={`${name}-${i}`} className="prism-chip px-3 py-1.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${i === layerNames.length - 1 && !isComplete ? "bg-prism-sky animate-pulse" : "bg-prism-jade"}`} />
              {name}
              {i < layerNames.length - 1 || isComplete ? " complete" : " running"}
            </span>
          ))}
        </div>

        {isLiveMode && emergences.length > 0 && (
          <div className="max-w-2xl mx-auto space-y-3 mt-1 text-left">
            {emergences.map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="prism-panel-soft rounded-xl p-3.5"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-prism-sky/14 text-prism-sky border border-prism-sky/25 uppercase tracking-[0.08em]">
                    {e.type}
                  </span>
                </div>
                <p className="text-xs text-prism-text leading-relaxed">{e.insight}</p>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

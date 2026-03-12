"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronLeft, Sparkles, Play } from "lucide-react";

interface ReadyStepProps {
  onDismiss: (dontShowAgain: boolean) => void;
  onBack: () => void;
}

export default function ReadyStep({ onDismiss, onBack }: ReadyStepProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col items-center justify-center min-h-screen px-4 md:px-6 text-center"
    >
      <div className="w-full max-w-2xl glass-panel rounded-3xl p-6 md:p-9 space-y-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45 }}
          className="mx-auto w-20 h-20 rounded-full bg-prism-jade/10 border border-prism-jade/35 flex items-center justify-center"
        >
          <CheckCircle2 className="w-12 h-12 text-prism-jade" />
        </motion.div>

        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-white">You&apos;re Ready to Launch</h2>
          <p className="text-sm text-prism-muted max-w-lg mx-auto leading-relaxed">
            PRISM is configured. Submit a strategic mission and monitor specialized agent collaboration in real time.
          </p>
        </div>

        <label className="flex items-center justify-center gap-2 cursor-pointer select-none text-xs text-prism-muted">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-cyan-400/30"
          />
          Don&apos;t show onboarding again
        </label>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={onBack} className="prism-button-ghost px-5 py-2.5 text-sm">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button onClick={() => onDismiss(dontShowAgain)} className="prism-button-primary px-8 py-3 text-sm">
            <Play className="w-4 h-4" />
            Begin Analysis
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

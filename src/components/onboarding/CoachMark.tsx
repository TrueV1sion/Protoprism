"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";

interface CoachMarkProps {
  targetId: string;
  message: string;
  onDismiss: () => void;
  onSkipAll: () => void;
}

export default function CoachMark({
  targetId,
  message,
  onDismiss,
  onSkipAll,
}: CoachMarkProps) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(`[data-tour-id="${targetId}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetId]);

  if (!position) return null;

  const tooltipTop = position.top + position.height + 12;
  const tooltipLeft = position.left + position.width / 2;

  return createPortal(
    <>
      {/* Highlight ring */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed pointer-events-none z-[60] rounded-lg"
        style={{
          top: position.top - 4,
          left: position.left - 4,
          width: position.width + 8,
          height: position.height + 8,
          boxShadow: "0 0 0 4000px rgba(0,0,0,0.5), 0 0 15px rgba(89,221,253,0.4)",
          border: "2px solid rgba(89,221,253,0.5)",
        }}
      />

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed z-[61] -translate-x-1/2"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="glass-panel rounded-xl p-4 max-w-xs shadow-xl border border-prism-sky/20">
          <p className="text-sm text-white leading-relaxed mb-3">{message}</p>
          <div className="flex items-center justify-between">
            <button
              onClick={onSkipAll}
              className="text-xs text-prism-muted hover:text-white transition-colors"
            >
              Skip tour
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-prism-sky text-prism-bg hover:bg-white transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </motion.div>
    </>,
    document.body
  );
}

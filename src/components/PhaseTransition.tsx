"use client";

/**
 * PhaseTransition — Smooth animated transitions between pipeline phases.
 *
 * Wraps phase content with AnimatePresence to create polished enter/exit
 * animations. Uses a fade + subtle slide-up for entering content and
 * fade + slide-down for exiting content.
 */

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface PhaseTransitionProps {
  /** Unique key for the current phase (drives AnimatePresence enter/exit) */
  phaseKey: string;
  children: ReactNode;
  /** Duration in seconds (default: 0.3) */
  duration?: number;
}

const variants = {
  enter: {
    opacity: 0,
    y: 12,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
  },
};

export default function PhaseTransition({
  phaseKey,
  children,
  duration = 0.3,
}: PhaseTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phaseKey}
        variants={variants}
        initial="enter"
        animate="visible"
        exit="exit"
        transition={{
          duration,
          ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
        }}
        className="flex-1 flex flex-col min-h-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

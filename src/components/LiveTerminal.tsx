"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LogEntry } from "@/lib/types";
import { Terminal, Radar } from "lucide-react";

const typeColors: Record<LogEntry["type"], string> = {
  info: "text-prism-muted",
  search: "text-prism-sky",
  finding: "text-prism-jade",
  error: "text-red-400",
};

const typeBadge: Record<LogEntry["type"], string> = {
  info: "INFO",
  search: "SCAN",
  finding: "FIND",
  error: "ERR",
};

export default function LiveTerminal({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full scanline">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <Terminal className="w-4 h-4 text-prism-sky" />
        <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-prism-muted">Pipeline Telemetry</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-prism-jade/30 bg-prism-jade/10 text-prism-jade text-[10px] font-mono uppercase tracking-[0.08em]">
          <span className="prism-status-dot bg-prism-jade" />
          <Radar className="w-3 h-3" />
          Live
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-[11px]">
        <AnimatePresence initial={false}>
          {logs.filter(Boolean).map((log, i) => (
            <motion.div
              key={`${log.timestamp}-${log.agent}-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.16 }}
              className="grid grid-cols-[56px_40px_120px_1fr] gap-2 items-start"
            >
              <span className="text-white/28">{log.timestamp}</span>
              <span
                className={`text-[9px] font-bold rounded px-1.5 py-0.5 text-center ${
                  log.type === "finding"
                    ? "bg-prism-jade/15 text-prism-jade"
                    : log.type === "search"
                      ? "bg-prism-sky/15 text-prism-sky"
                      : log.type === "error"
                        ? "bg-red-400/15 text-red-400"
                        : "bg-white/5 text-prism-muted"
                }`}
              >
                {typeBadge[log.type]}
              </span>
              <span className="text-prism-sky/70 truncate">{log.agent}</span>
              <span className={`${typeColors[log.type]} leading-relaxed`}>{log.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex items-center gap-2 py-0.5">
          <span className="text-white/20 w-[56px]" />
          <span className="w-2 h-3 bg-prism-sky rounded-[1px] animate-[pulse_1s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

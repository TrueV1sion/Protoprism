"use client";

import { createElement } from "react";
import { motion } from "framer-motion";
import type { EngineManifest } from "@/lib/engines/types";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconCache = new Map<string, LucideIcon>();

function getIcon(name: string): LucideIcon {
  if (iconCache.has(name)) return iconCache.get(name)!;
  const icon = (LucideIcons as Record<string, LucideIcon>)[name] || LucideIcons.Hexagon;
  iconCache.set(name, icon);
  return icon;
}

export default function EngineComingSoon({ engine }: { engine: EngineManifest }) {
  return (
    <div className="flex-1 flex items-center justify-center px-8 py-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-lg"
      >
        <div className="relative inline-flex mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${engine.accentColor}20, ${engine.accentColor}08)`,
              border: `1px solid ${engine.accentColor}30`,
              boxShadow: `0 0 40px ${engine.accentColor}15`,
            }}
          >
            {createElement(getIcon(engine.icon), {
              className: "w-10 h-10",
              style: { color: engine.accentColor },
            })}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">{engine.name}</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">{engine.description}</p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Coming Soon</span>
        </div>
      </motion.div>
    </div>
  );
}

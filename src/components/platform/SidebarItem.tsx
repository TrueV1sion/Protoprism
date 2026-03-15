"use client";

import { createElement } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { EngineManifest } from "@/lib/engines/types";
import { useSidebar } from "./SidebarContext";

import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconCache = new Map<string, LucideIcon>();

function getIcon(name: string): LucideIcon {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const icon = (LucideIcons as Record<string, LucideIcon>)[name] || LucideIcons.Hexagon;
  iconCache.set(name, icon);
  return icon;
}

function renderIcon(name: string, className?: string, style?: React.CSSProperties) {
  return createElement(getIcon(name), { className, style });
}

interface SidebarItemProps {
  engine: EngineManifest;
  isActive: boolean;
}

export default function SidebarItem({ engine, isActive }: SidebarItemProps) {
  const { collapsed } = useSidebar();
  const isDisabled = engine.status === "coming-soon";

  const content = (
    <div
      className={`
        group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200
        ${isActive
          ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : isDisabled
            ? "text-slate-600 cursor-default"
            : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
        }
      `}
      style={isActive ? { borderLeft: `2px solid ${engine.accentColor}` } : { borderLeft: "2px solid transparent" }}
    >
      {renderIcon(
        engine.icon,
        "w-5 h-5 shrink-0 transition-colors",
        isActive ? { color: engine.accentColor } : undefined,
      )}

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          <span className="text-sm font-medium truncate">{engine.name}</span>
          {engine.status === "coming-soon" && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5 shrink-0">
              Soon
            </span>
          )}
        </motion.div>
      )}

      {collapsed && (
        <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
          {engine.name}
          {engine.status === "coming-soon" && (
            <span className="ml-1.5 text-[9px] font-mono text-slate-500">SOON</span>
          )}
        </div>
      )}
    </div>
  );

  if (isDisabled) return content;

  return (
    <Link href={engine.route} className="block">
      {content}
    </Link>
  );
}

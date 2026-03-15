"use client";

import { usePathname } from "next/navigation";
import { Search, Bell, Layers, Clock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useSidebar } from "./SidebarContext";
import { getEngineById } from "@/lib/engines/registry";

import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

function getIcon(name: string): LucideIcon {
  return (LucideIcons as Record<string, LucideIcon>)[name] || LucideIcons.Hexagon;
}

export default function PlatformHeader() {
  const { collapsed } = useSidebar();
  const pathname = usePathname();

  const engineMatch = pathname.match(/^\/engines\/([^/]+)/);
  const engineId = engineMatch ? engineMatch[1] : "command-center";
  const engine = getEngineById(engineId);

  const isHistory = pathname === "/history";

  return (
    <motion.header
      className="fixed top-0 right-0 z-30 h-[68px] border-b border-white/[0.06] bg-[#030712]/90 backdrop-blur-md flex items-center justify-between px-6"
      animate={{ left: collapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {engine && (
          <div className="flex items-center gap-2 min-w-0">
            {(() => {
              const Icon = getIcon(engine.icon);
              return <Icon className="w-4 h-4 shrink-0" style={{ color: engine.accentColor }} />;
            })()}
            <span className="text-sm font-semibold text-white truncate">{engine.name}</span>
          </div>
        )}

        {isHistory && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button className="hover:text-white text-slate-400 transition-colors" aria-label="Search">
          <Search className="w-[18px] h-[18px]" />
        </button>
        <button className="hover:text-white text-slate-400 transition-colors" aria-label="Notifications">
          <Bell className="w-[18px] h-[18px]" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center" title="PRISM">
          <Layers className="w-4 h-4 text-white" />
        </div>
      </div>
    </motion.header>
  );
}

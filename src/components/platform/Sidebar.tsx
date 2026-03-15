"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getActiveEngines } from "@/lib/engines/registry";
import { useSidebar } from "./SidebarContext";
import SidebarItem from "./SidebarItem";

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  const engines = getActiveEngines();

  const activeEngineId = (() => {
    const engineMatch = pathname.match(/^\/engines\/([^/]+)/);
    if (engineMatch) return engineMatch[1];
    if (pathname === "/" || pathname === "/history") return "command-center";
    return "command-center";
  })();

  return (
    <motion.aside
      className="fixed top-0 left-0 bottom-0 z-40 flex flex-col border-r border-white/[0.06] bg-[#030712]/95 backdrop-blur-xl"
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="h-[68px] flex items-center px-4 border-b border-white/[0.06]">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400"
          >
            PRISM
          </motion.span>
        )}
        {collapsed && (
          <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">P</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        <div className={`${collapsed ? "" : "px-2"} mb-3`}>
          {!collapsed && (
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
              Engines
            </span>
          )}
        </div>

        {engines.map((engine) => (
          <SidebarItem
            key={engine.id}
            engine={engine}
            isActive={engine.id === activeEngineId}
          />
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}

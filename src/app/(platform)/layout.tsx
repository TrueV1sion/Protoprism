"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { SidebarProvider, useSidebar } from "@/components/platform/SidebarContext";
import Sidebar from "@/components/platform/Sidebar";
import PlatformHeader from "@/components/platform/PlatformHeader";

function PlatformContent({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Sidebar />
      <PlatformHeader />
      <motion.main
        className="flex-1 flex flex-col pt-[68px] min-h-0"
        animate={{ marginLeft: collapsed ? 64 : 256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.main>
    </div>
  );
}

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <PlatformContent>{children}</PlatformContent>
    </SidebarProvider>
  );
}

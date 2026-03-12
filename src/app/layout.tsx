import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import Link from "next/link";
import { Layers, Clock, Search, Bell } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "PRISM Strategic Intelligence",
  description: "Parallel multi-agent intelligence pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col app-shell">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#030712]/90 backdrop-blur-md">
          <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-8 min-w-0">
              <Link href="/" className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                PRISM
              </Link>
              <nav className="hidden md:flex gap-6 text-sm font-medium items-center">
                <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                  Home
                </Link>
                <Link href="/history" className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  History
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <button className="hover:text-white text-slate-300 transition-colors" aria-label="Search">
                <Search className="w-5 h-5" />
              </button>
              <button className="hover:text-white text-slate-300 transition-colors" aria-label="Notifications">
                <Bell className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center" title="PRISM">
                <Layers className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pt-[84px] pb-4 sm:pb-6 flex flex-col">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </body>
    </html>
  );
}

"use client";

import { Activity, Hexagon, Radar } from "lucide-react";
import AgentCard from "@/components/AgentCard";
import LiveTerminal from "@/components/LiveTerminal";
import type { AgentRunState, LogEntry } from "@/lib/types";

interface ExecutingPhaseProps {
  agents: AgentRunState[];
  logs: LogEntry[];
  phaseLabel: string;
  phaseMessage: string;
  isLiveMode: boolean;
}

export default function ExecutingPhase({
  agents,
  logs,
  phaseLabel,
  phaseMessage,
  isLiveMode,
}: ExecutingPhaseProps) {
  const completeCount = agents.filter((a) => a.status === "complete").length;

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 sm:gap-5 overflow-hidden">
      <div className="glass-panel rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2">
          <div className="prism-kicker">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            {phaseLabel}
          </div>
          {agents.length > 0 && (
            <span className="prism-chip text-[11px] font-mono px-2.5 py-1 uppercase tracking-[0.08em]">
              {completeCount}/{agents.length} complete
            </span>
          )}
        </div>
        {isLiveMode && phaseMessage && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-prism-muted uppercase tracking-[0.08em]">
            <Radar className="w-3.5 h-3.5 text-prism-sky" />
            {phaseMessage}
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-4 sm:gap-5 overflow-hidden">
        <div
          data-tour-id="tour-agent-grid"
          className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start overflow-y-auto pr-1"
        >
          {agents.length > 0 ? (
            agents.map((agent, i) => <AgentCard key={agent.id} agent={agent} index={i} />)
          ) : (
            <div className="col-span-full glass-panel rounded-2xl flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-prism-sky/30 animate-ping" />
                <div className="absolute inset-3 rounded-full bg-prism-sky/12 flex items-center justify-center">
                  <Hexagon className="w-8 h-8 text-prism-sky animate-[floatGlow_3s_ease-in-out_infinite]" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-prism-muted font-mono uppercase tracking-[0.08em] text-center px-4">
                {phaseMessage || "Initializing pipeline"}
              </p>
            </div>
          )}
        </div>

        <div className="w-[420px] hidden xl:flex flex-col">
          <LiveTerminal logs={logs} />
        </div>
      </div>
    </div>
  );
}

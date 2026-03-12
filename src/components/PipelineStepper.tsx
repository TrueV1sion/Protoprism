"use client";

import type { Phase } from "@/lib/types";
import { Brain, Hammer, Rocket, Filter, Layers, CheckCircle2 } from "lucide-react";

const PIPELINE_STEPS = [
  { label: "Think", icon: Brain },
  { label: "Construct", icon: Hammer },
  { label: "Deploy", icon: Rocket },
  { label: "Triage", icon: Filter },
  { label: "Synthesize", icon: Layers },
  { label: "Complete", icon: CheckCircle2 },
];

function getStepIndex(phase: Phase, streamPhase?: string): number {
  if (phase === "complete") return 5;
  if (phase === "synthesis") return 4;
  if (phase === "triage") return 3;
  if (phase === "executing") {
    if (streamPhase === "deploy") return 2;
    if (streamPhase === "construct") return 1;
    return 0;
  }
  return -1;
}

export default function PipelineStepper({
  phase,
  streamPhase,
}: {
  phase: Phase;
  streamPhase?: string;
}) {
  const currentStep = getStepIndex(phase, streamPhase);
  if (currentStep < 0) return null;

  return (
    <div className="px-4 sm:px-6">
      <div className="mx-auto max-w-[1600px] glass-panel rounded-xl py-2.5 px-2 sm:px-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isComplete = i < currentStep;
            const isCurrent = i === currentStep;
            const Icon = step.icon;

            return (
              <div key={step.label} className="flex items-center gap-1.5 min-w-fit">
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 border transition-all ${
                    isComplete
                      ? "border-prism-jade/45 bg-prism-jade/12 text-prism-jade"
                      : isCurrent
                        ? "border-prism-sky/45 bg-prism-sky/14 text-prism-sky shadow-[0_0_18px_rgba(106,215,255,0.2)]"
                        : "border-white/10 bg-white/[0.02] text-prism-muted/70"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isCurrent ? "animate-pulse" : ""}`} />
                  <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.08em]">{step.label}</span>
                </div>

                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    className={`h-px w-4 sm:w-6 ${i < currentStep ? "bg-prism-jade/55" : "bg-white/10"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

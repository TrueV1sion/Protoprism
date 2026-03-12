"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Activity,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PipelinePreset {
  id: "quick" | "standard" | "deep";
  name: string;
  description: string;
  icon: typeof Zap;
  maxAgents: number;
  defaultUrgency: "speed" | "balanced" | "thorough";
  enableCriticPass: boolean;
}

const PRESETS: PipelinePreset[] = [
  {
    id: "quick",
    name: "Quick Scan",
    description: "3 agents, fast turnaround (~2 min)",
    icon: Zap,
    maxAgents: 3,
    defaultUrgency: "speed",
    enableCriticPass: false,
  },
  {
    id: "standard",
    name: "Standard Analysis",
    description: "5-8 agents, balanced depth (~5 min)",
    icon: Activity,
    maxAgents: 8,
    defaultUrgency: "balanced",
    enableCriticPass: true,
  },
  {
    id: "deep",
    name: "Deep Investigation",
    description: "10-15 agents, comprehensive (~10 min)",
    icon: Search,
    maxAgents: 15,
    defaultUrgency: "thorough",
    enableCriticPass: true,
  },
];

interface ConfigStepProps {
  onNext: (config: {
    maxAgents: number;
    defaultUrgency: "speed" | "balanced" | "thorough";
    enableMemoryBus: boolean;
    enableCriticPass: boolean;
  }) => void;
  onBack: () => void;
}

export default function ConfigStep({ onNext, onBack }: ConfigStepProps) {
  const [selected, setSelected] = useState<"quick" | "standard" | "deep">("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enableMemoryBus, setEnableMemoryBus] = useState(true);
  const [customCriticPass, setCustomCriticPass] = useState<boolean | null>(null);

  const preset = PRESETS.find((p) => p.id === selected)!;
  const criticPass = customCriticPass ?? preset.enableCriticPass;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col items-center justify-center min-h-screen px-4 md:px-6"
    >
      <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 md:p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-white">Configure Analysis Mode</h2>
          <p className="text-sm text-prism-muted max-w-xl mx-auto">
            Choose your default pipeline depth. You can override this per mission.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const isActive = selected === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p.id);
                  setCustomCriticPass(null);
                }}
                className={`glass-panel rounded-xl p-4 text-left transition-all duration-200 ${
                  isActive ? "border-cyan-400/40 shadow-[0_0_18px_rgba(6,182,212,0.2)]" : "hover:border-white/20"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${isActive ? "bg-cyan-500/15 border border-cyan-400/35" : "bg-white/5 border border-white/10"}`}>
                  <Icon className={`w-5 h-5 ${isActive ? "text-cyan-300" : "text-prism-muted"}`} />
                </div>
                <h3 className={`font-semibold text-sm mb-1 ${isActive ? "text-white" : "text-prism-muted"}`}>{p.name}</h3>
                <p className="text-xs text-prism-muted/80">{p.description}</p>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex items-center gap-2 mx-auto text-xs text-prism-muted hover:text-cyan-300 transition-colors"
        >
          Advanced Settings
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-panel rounded-xl p-5 space-y-4">
                <ToggleRow
                  title="Memory Bus"
                  description="Cross-agent signal propagation during execution"
                  enabled={enableMemoryBus}
                  onToggle={() => setEnableMemoryBus((v) => !v)}
                />
                <ToggleRow
                  title="Critic Pass"
                  description="Post-synthesis quality assurance review"
                  enabled={criticPass}
                  onToggle={() => setCustomCriticPass(!criticPass)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={onBack} className="prism-button-ghost px-5 py-2.5 text-sm">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() =>
              onNext({
                maxAgents: preset.maxAgents,
                defaultUrgency: preset.defaultUrgency,
                enableMemoryBus,
                enableCriticPass: criticPass,
              })
            }
            className="prism-button-primary px-8 py-3 text-sm"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-white">{title}</p>
        <p className="text-xs text-prism-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-10 h-6 rounded-full transition-colors relative ${enabled ? "bg-cyan-500" : "bg-white/10"}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

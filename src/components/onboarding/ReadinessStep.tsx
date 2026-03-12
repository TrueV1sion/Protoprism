"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Key, ChevronRight, ChevronLeft } from "lucide-react";

interface ReadinessStepProps {
  keys: { anthropic: boolean; openai: boolean };
  onSaveKey: (provider: string, key: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

function KeyCard({
  provider,
  label,
  ready,
  required,
  onSave,
}: {
  provider: string;
  label: string;
  ready: boolean;
  required: boolean;
  onSave: (provider: string, key: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    await onSave(provider, value.trim());
    setSaving(false);
    setEditing(false);
    setValue("");
  };

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Key className="w-4 h-4 text-prism-muted" />
          <span className="text-sm font-medium text-white truncate">{label}</span>
          {required ? (
            <span className="text-[10px] font-mono px-1.5 py-px rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 uppercase tracking-[0.08em]">
              Required
            </span>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-px rounded bg-white/5 text-prism-muted border border-white/10 uppercase tracking-[0.08em]">
              Optional
            </span>
          )}
        </div>
        {ready ? <CheckCircle2 className="w-5 h-5 text-prism-jade" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
      </div>

      {ready ? (
        <p className="text-xs text-prism-jade">Configured and ready.</p>
      ) : editing ? (
        <div className="flex gap-2 mt-3">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${label}`}
            className="prism-input flex-1 px-3 py-2 text-sm"
          />
          <button onClick={handleSave} disabled={saving || !value.trim()} className="prism-button-primary px-4 py-2 text-xs disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-cyan-400 hover:text-white transition-colors mt-1">
          Configure now
        </button>
      )}
    </div>
  );
}

export default function ReadinessStep({
  keys,
  onSaveKey,
  onNext,
  onBack,
}: ReadinessStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col items-center justify-center min-h-screen px-4 md:px-6"
    >
      <div className="w-full max-w-2xl glass-panel rounded-3xl p-6 md:p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-white">System Readiness</h2>
          <p className="text-sm text-prism-muted max-w-xl mx-auto">
            Add provider keys to unlock live model execution. Demo mode remains available without keys.
          </p>
        </div>

        <div className="space-y-3">
          <KeyCard provider="anthropic" label="Anthropic API Key" ready={keys.anthropic} required={true} onSave={onSaveKey} />
          <KeyCard provider="openai" label="OpenAI API Key" ready={keys.openai} required={false} onSave={onSaveKey} />
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={onBack} className="prism-button-ghost px-5 py-2.5 text-sm">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button onClick={onNext} className="prism-button-primary px-8 py-3 text-sm">
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

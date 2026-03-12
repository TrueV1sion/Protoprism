"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useOnboarding } from "@/hooks/use-onboarding";
import WelcomeStep from "./WelcomeStep";
import ReadinessStep from "./ReadinessStep";
import ConfigStep from "./ConfigStep";
import ReadyStep from "./ReadyStep";

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEP_LABELS = ["Welcome", "Readiness", "Configuration", "Launch"];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const {
    status,
    loading,
    step,
    stepIndex,
    totalSteps,
    nextStep,
    prevStep,
    saveKey,
    dismiss,
  } = useOnboarding();

  if (loading || !status) return null;

  const handleConfigNext = (config: {
    maxAgents: number;
    defaultUrgency: "speed" | "balanced" | "thorough";
    enableMemoryBus: boolean;
    enableCriticPass: boolean;
  }) => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((current) =>
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...current, ...config }),
        })
      )
      .catch(() => {});
    nextStep();
  };

  const handleDismiss = async (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      await dismiss();
    }
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-[#030712] overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-16 left-8 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute top-1/3 right-10 h-72 w-72 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute inset-0 hud-grid opacity-20" />
      </div>

      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 w-full max-w-[720px] px-4">
        <div className="glass-panel rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.12em] text-prism-muted">
            <span>Onboarding</span>
            <span>
              {stepIndex + 1}/{totalSteps}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i <= stepIndex ? "w-10 bg-cyan-400" : "w-5 bg-white/12"}`} />
            ))}
          </div>
          <p className="text-xs text-prism-muted">{STEP_LABELS[stepIndex] ?? "Step"}</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "welcome" && <WelcomeStep key="welcome" onNext={nextStep} />}
        {step === "readiness" && (
          <ReadinessStep key="readiness" keys={status.keys} onSaveKey={saveKey} onNext={nextStep} onBack={prevStep} />
        )}
        {step === "config" && <ConfigStep key="config" onNext={handleConfigNext} onBack={prevStep} />}
        {step === "ready" && <ReadyStep key="ready" onDismiss={handleDismiss} onBack={prevStep} />}
      </AnimatePresence>
    </motion.div>
  );
}

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import CoachMark from "./CoachMark";
import type { Phase } from "@/lib/types";

interface TourMark {
  id: string;
  phase: Phase;
  targetId: string;
  message: string;
}

const TOUR_MARKS: TourMark[] = [
  {
    id: "blueprint",
    phase: "blueprint",
    targetId: "tour-deploy-agents",
    message:
      "Review the AI team assembled for your query. When ready, deploy them.",
  },
  {
    id: "executing",
    phase: "executing",
    targetId: "tour-agent-grid",
    message:
      "Each agent independently researches its assigned dimension in parallel.",
  },
  {
    id: "triage",
    phase: "triage",
    targetId: "tour-finding-card",
    message:
      "Review each finding. Keep, boost, flag, or dismiss before synthesis.",
  },
  {
    id: "synthesis",
    phase: "synthesis",
    targetId: "tour-synthesis-layers",
    message:
      "PRISM weaves agent findings into layered strategic insights.",
  },
  {
    id: "complete",
    phase: "complete",
    targetId: "tour-view-brief",
    message:
      "Your executive brief is ready. Open it to see the final output.",
  },
];

interface CoachMarkContextValue {
  currentPhase: Phase;
  setCurrentPhase: (phase: Phase) => void;
}

const CoachMarkContext = createContext<CoachMarkContextValue>({
  currentPhase: "input",
  setCurrentPhase: () => {},
});

export function useCoachMarkPhase() {
  return useContext(CoachMarkContext);
}

export default function CoachMarkProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [currentPhase, setCurrentPhase] = useState<Phase>("input");
  const [tourActive, setTourActive] = useState(false);
  const [shownMarks, setShownMarks] = useState<Set<string>>(new Set());
  const [tourComplete, setTourComplete] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.hasCompletedTour) {
          setTourActive(true);
        } else {
          setTourComplete(true);
        }
      })
      .catch(() => {});
  }, []);

  const completeTour = useCallback(async () => {
    setTourActive(false);
    setTourComplete(true);
    await fetch("/api/onboarding/tour-complete", { method: "POST" });
  }, []);

  const dismissMark = useCallback(
    (markId: string) => {
      const newShown = new Set([...shownMarks, markId]);
      setShownMarks(newShown);
      const remaining = TOUR_MARKS.filter((m) => !newShown.has(m.id));
      if (remaining.length === 0) {
        completeTour();
      }
    },
    [shownMarks, completeTour]
  );

  const activeMark =
    tourActive && !tourComplete
      ? TOUR_MARKS.find(
          (m) => m.phase === currentPhase && !shownMarks.has(m.id)
        )
      : null;

  return (
    <CoachMarkContext.Provider value={{ currentPhase, setCurrentPhase }}>
      {children}
      {activeMark && (
        <CoachMark
          key={activeMark.id}
          targetId={activeMark.targetId}
          message={activeMark.message}
          onDismiss={() => dismissMark(activeMark.id)}
          onSkipAll={completeTour}
        />
      )}
    </CoachMarkContext.Provider>
  );
}

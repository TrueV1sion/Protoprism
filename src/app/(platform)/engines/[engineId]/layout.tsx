import { notFound } from "next/navigation";
import { getEngineById } from "@/lib/engines/registry";
import EngineShell from "@/components/platform/EngineShell";
import type { ReactNode } from "react";

interface EngineLayoutProps {
  children: ReactNode;
  params: Promise<{ engineId: string }>;
}

export default async function EngineLayout({ children, params }: EngineLayoutProps) {
  const { engineId } = await params;
  const engine = getEngineById(engineId);

  if (!engine) {
    notFound();
  }

  return <EngineShell engine={engine}>{children}</EngineShell>;
}

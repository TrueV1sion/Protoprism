import { notFound } from "next/navigation";
import { getEngineById } from "@/lib/engines/registry";
import EngineComingSoon from "./EngineComingSoon";

interface EnginePageProps {
  params: Promise<{ engineId: string }>;
}

export default async function EnginePage({ params }: EnginePageProps) {
  const { engineId } = await params;
  const engine = getEngineById(engineId);

  if (!engine) {
    notFound();
  }

  return <EngineComingSoon engine={engine} />;
}

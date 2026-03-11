/**
 * API Route: GET /api/decks/[id]/provenance
 *
 * Returns the provenance chain for a specific deck/run.
 * Queries findings -> agents -> run to build the full chain.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const AGENT_COLORS = [
    "#59DDFD", "#00E49F", "#4E84C4", "#EC4899", "#F5E6BB",
    "#6C6CFF", "#FF6B6B", "#FFD93D", "#95E1D3", "#C9B1FF",
];

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: runId } = await params;

        // Get all agents with their findings for this run
        const agents = await db.agent.findManyWithFindings(runId);

        if (agents.length === 0) {
            return NextResponse.json([]);
        }

        const provenance = agents.flatMap((agent, i) =>
            (agent.findings ?? []).map(finding => ({
                finding: finding.statement,
                agent: agent.name,
                archetype: agent.archetype || "RESEARCHER",
                confidence: finding.confidence,
                sources: finding.source || "Not available",
                color: AGENT_COLORS[i % AGENT_COLORS.length],
            }))
        );

        return NextResponse.json(provenance);
    } catch (error) {
        console.error("[Provenance API] Error:", error);
        return NextResponse.json([], { status: 500 });
    }
}

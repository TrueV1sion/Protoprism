/**
 * POST /api/analyze -- Start a new PRISM analysis run.
 *
 * Creates a Run record and returns the runId. The caller should then
 * connect to GET /api/pipeline/stream?runId=...&query=... for real-time
 * pipeline execution via SSE.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json(
      { error: "Query is required" },
      { status: 400 },
    );
  }

  const runId = randomUUID();

  const run = await db.run.create({
    id: runId,
    query: query.trim(),
    status: "INITIALIZE",
  });

  return NextResponse.json({
    runId: run.id,
    query: run.query,
    status: run.status,
  });
}

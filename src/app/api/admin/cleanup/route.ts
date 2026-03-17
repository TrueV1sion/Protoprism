/**
 * POST /api/admin/cleanup — Clean up old presentation files
 * GET /api/admin/cleanup — Get cleanup statistics
 */

import { NextResponse } from "next/server";
import { cleanupOldPresentations, getStorageStats } from "@/lib/cleanup";

export async function GET() {
  try {
    const stats = await getStorageStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { maxAge = 30, dryRun = false } = body;

    const result = await cleanupOldPresentations({ maxAge, dryRun });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

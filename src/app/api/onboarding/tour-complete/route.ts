import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  await db.settings.upsert("default", { hasCompletedTour: true });

  return NextResponse.json({ ok: true });
}

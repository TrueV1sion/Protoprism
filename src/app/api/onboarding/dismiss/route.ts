import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  await db.settings.upsert("default", { onboardingDismissed: true });

  return NextResponse.json({ ok: true });
}

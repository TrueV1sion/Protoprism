import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const settings = await db.settings.findUnique("default");

    const anthropicEnv = !!process.env.ANTHROPIC_API_KEY;
    const openaiEnv = !!process.env.OPENAI_API_KEY;

    let anthropicDb = false;
    let openaiDb = false;

    try {
      const keys = await db.apiKey.findMany();
      anthropicDb = keys.some((k) => k.provider === "anthropic");
      openaiDb = keys.some((k) => k.provider === "openai");
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      onboardingDismissed: settings?.onboardingDismissed ?? false,
      hasCompletedTour: settings?.hasCompletedTour ?? false,
      keys: {
        anthropic: anthropicEnv || anthropicDb,
        openai: openaiEnv || openaiDb,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch onboarding status";
    return NextResponse.json(
      { error: message, onboardingDismissed: false, hasCompletedTour: false, keys: { anthropic: false, openai: false } },
      { status: 500 },
    );
  }
}

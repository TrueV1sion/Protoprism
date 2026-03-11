import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const where: Record<string, string> = {};
    if (tier) where.tier = tier;
    if (status) where.status = status;

    const { runs, total } = await db.run.findMany({
      where,
      orderBy: "created_at",
      orderDir: "desc",
      limit,
      offset,
      includeRelations: true,
    });

    return NextResponse.json({ runs, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch run history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

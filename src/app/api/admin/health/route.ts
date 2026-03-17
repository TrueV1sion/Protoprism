/**
 * GET /api/admin/health — Get MCP server health status
 * POST /api/admin/health/reset — Reset circuit breakers
 */

import { NextResponse } from "next/server";
import { getAllServerHealth, resetAllCircuitBreakers } from "@/lib/mcp/health-check";

export async function GET() {
  try {
    const health = getAllServerHealth();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      servers: health,
      summary: {
        total: health.length,
        healthy: health.filter((h) => h.health === "healthy").length,
        degraded: health.filter((h) => h.health === "degraded").length,
        unhealthy: health.filter((h) => h.health === "unhealthy").length,
        circuitOpen: health.filter((h) => h.health === "circuit_open").length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { pathname } = new URL(request.url);

    if (pathname.endsWith("/reset")) {
      resetAllCircuitBreakers();
      return NextResponse.json({ success: true, message: "All circuit breakers reset" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

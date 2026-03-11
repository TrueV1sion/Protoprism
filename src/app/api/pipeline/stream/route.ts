import { executePipeline } from "@/lib/pipeline/executor";
import { db } from "@/lib/db";
import { pipelineRateLimiter } from "@/lib/rate-limit";
import type { PipelineEvent, AutonomyMode } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const runId = searchParams.get("runId");
  const autonomyMode = (searchParams.get("autonomyMode") ?? "guided") as AutonomyMode;

  if (!query || !runId) {
    return new Response(
      JSON.stringify({ error: "query and runId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = pipelineRateLimiter.check(clientIp);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please wait before starting another pipeline run." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)),
        },
      },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured. Set it in .env to enable live mode." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          abortController.abort();
        }
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          abortController.abort();
        }
      }, 15_000);

      function handleEvent(event: PipelineEvent) {
        switch (event.type) {
          case "phase_change":
            send("phase_change", { phase: event.phase, message: event.message });
            break;
          case "blueprint":
            send("blueprint", {
              query: event.blueprint.query,
              tier: event.blueprint.tier,
              estimatedTime: event.blueprint.estimatedTime,
              agentCount: event.blueprint.agents.length,
              complexity: event.blueprint.complexityScore,
              dimensions: event.blueprint.dimensions.map((d) => ({ name: d.name, description: d.description })),
              agents: event.blueprint.agents.map((a) => ({ name: a.name, archetype: a.archetype, dimension: a.dimension, mandate: a.mandate, tools: a.tools })),
            });
            break;
          case "agent_spawned": {
            const spawnId = event.agentName.toLowerCase().replace(/\s+/g, "-");
            send("agent_spawned", { agentId: spawnId, name: event.agentName, archetype: event.archetype, dimension: event.dimension });
            break;
          }
          case "agent_progress": {
            const progressId = event.agentName.toLowerCase().replace(/\s+/g, "-");
            send("agent_progress", { agentId: progressId, progress: event.progress, message: event.message });
            break;
          }
          case "tool_call": {
            const toolId = event.agentName.toLowerCase().replace(/\s+/g, "-");
            send("tool_call", { agentId: toolId, toolName: event.toolName, serverName: event.serverName });
            break;
          }
          case "finding_added": {
            const findingAgentId = event.agentName.toLowerCase().replace(/\s+/g, "-");
            send("finding_added", {
              agentId: findingAgentId,
              finding: {
                statement: event.finding.statement,
                confidence: event.finding.confidence,
                sourceTier: event.finding.sourceTier,
                evidence: event.finding.evidence,
                source: event.finding.source,
                implication: event.finding.implication,
              },
            });
            break;
          }
          case "agent_complete": {
            const completeId = event.agentName.toLowerCase().replace(/\s+/g, "-");
            send("agent_complete", { agentId: completeId, findingCount: event.findingCount, gapCount: 0, tokensUsed: event.tokensUsed });
            break;
          }
          case "synthesis_started":
            send("synthesis_started", { agentCount: event.agentCount });
            break;
          case "synthesis_layer":
            send("synthesis_layer", { name: event.layer.name, description: event.layer.description, insights: event.layer.insights });
            break;
          case "emergence_detected":
            send("emergence_detected", {
              insight: event.insight.insight,
              algorithm: event.insight.algorithm,
              supportingAgents: event.insight.supportingAgents,
              qualityScores: event.insight.qualityScores,
              whyMultiAgent: event.insight.whyMultiAgent,
            });
            break;
          case "critic_review":
            send("critic_review", { issue: event.issue, severity: event.severity });
            break;
          case "verification_gate":
            send("verification_gate", { claims: event.claims });
            break;
          case "quality_report":
            send("quality_report", {
              ...event.report,
              grade: event.report.grade,
              overallScore: event.report.overallScore,
              provenanceCompleteness: event.report.provenanceCompleteness,
              warningCount: event.report.warningCount,
              criticalWarnings: event.report.criticalWarnings,
              dimensions: event.report.dimensions,
            });
            break;
          case "presentation_started":
            send("presentation_started", {});
            break;
          case "presentation_complete":
            send("presentation_complete", { title: event.title, slideCount: event.slideCount, htmlPath: event.htmlPath });
            break;
          case "complete":
            send("complete", {
              runId: event.manifest.metadata.runId,
              agentCount: event.manifest.agentResults.length,
              totalFindings: event.manifest.qualityReport.totalFindings,
              emergentInsights: event.manifest.synthesis.emergentInsights.length,
              totalTokens: event.manifest.metadata.totalTokens,
              totalCost: event.manifest.metadata.totalCost,
              presentationPath: `/decks/${event.manifest.metadata.runId}.html`,
            });
            break;
          case "error":
            send("error", { error: event.message, phase: event.phase });
            break;
          case "thinking_token":
            send("thinking_token", { token: event.token });
            break;
        }
      }

      try {
        await db.run.upsert(runId, { query, status: "INITIALIZE" });

        await executePipeline({
          query,
          runId,
          autonomyMode,
          signal: abortController.signal,
          onEvent: handleEvent,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send("error", { error: message, phase: "pipeline" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

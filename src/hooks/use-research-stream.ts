"use client";

/**
 * useResearchStream — React hook for real-time PRISM pipeline streaming.
 * 
 * Connects to the SSE endpoint and manages the full lifecycle:
 * - Phase transitions
 * - Agent spawning, progress, completion
 * - Real-time findings
 * - Emergence detection
 * - Quality report
 * 
 * Returns a state object that drives the Research Canvas UI.
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────

export type StreamPhase = "idle" | "think" | "blueprint" | "construct" | "deploy" | "triage" | "synthesize" | "qa" | "complete" | "error";

export interface StreamAgent {
    id: string;
    name: string;
    archetype: string;
    dimension: string;
    status: "pending" | "active" | "complete" | "failed";
    progress: number;
    findingCount: number;
    gapCount: number;
    error?: string;
}

export interface StreamFinding {
    id: string;
    agentId: string;
    statement: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    evidence: string;
    source: string;
    implication: string;
    action?: "approve" | "reject" | "flag" | "modify";
}

export interface StreamEmergence {
    insight: string;
    type: "convergent" | "pattern" | "tension" | "gap";
    contributingAgents: string[];
    quality: {
        novelty: number;
        grounding: number;
        actionability: number;
        depth: number;
        surprise: number;
    };
}

export interface StreamDimension {
    name: string;
    description: string;
}

export interface StreamBlueprint {
    query: string;
    tier: string;
    estimatedTime: string;
    agentCount: number;
    complexity: { breadth: number; depth: number; interconnection: number; total: number; reasoning: string };
    dimensions: StreamDimension[];
    agents: Array<{ name: string; archetype: string; dimension: string; mandate: string; tools: string[] }>;
}

export interface QualityReport {
    overallScore: number;
    grade: string;
    provenanceCompleteness: number;
    warningCount: number;
    criticalWarnings: string[];
}

export interface StreamState {
    phase: StreamPhase;
    phaseMessage: string;
    agents: StreamAgent[];
    dimensions: StreamDimension[];
    findings: StreamFinding[];
    emergences: StreamEmergence[];
    synthesisLayers: Array<{ name: string; description: string; insights: string[] }>;
    criticIssues: Array<{ issue: string; severity: string }>;
    quality: QualityReport | null;
    blueprint: StreamBlueprint | null;
    logs: Array<{ timestamp: string; agent: string; message: string; type: "info" | "finding" | "search" | "error" }>;
    runId: string | null;
    error: string | null;
    isStreaming: boolean;
    completionData: {
        runId: string;
        agentCount: number;
        totalFindings: number;
        emergentInsights: number;
        totalCost: number;
        presentationPath: string;
    } | null;
}

const INITIAL_STATE: StreamState = {
    phase: "idle",
    phaseMessage: "",
    agents: [],
    dimensions: [],
    findings: [],
    emergences: [],
    synthesisLayers: [],
    criticIssues: [],
    quality: null,
    blueprint: null,
    logs: [],
    runId: null,
    error: null,
    isStreaming: false,
    completionData: null,
};

// ─── Hook ───────────────────────────────────────────────────

export function useResearchStream() {
    const [state, setState] = useState<StreamState>(INITIAL_STATE);
    const eventSourceRef = useRef<EventSource | null>(null);
    const findingIdRef = useRef(0);

    const startStream = useCallback((query: string, runId: string, urgency: string = "balanced") => {
        // Guard: prevent re-triggering while already streaming
        if (eventSourceRef.current) {
            // Already streaming — ignore duplicate call
            return;
        }

        // Reset state
        setState({ ...INITIAL_STATE, runId, isStreaming: true, phase: "think", phaseMessage: "Decomposing strategic question..." });
        findingIdRef.current = 0;

        const params = new URLSearchParams({ query, runId, urgency });
        const url = `/api/pipeline/stream?${params}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        // Phase changes
        es.addEventListener("phase_change", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                phase: (data.phase as string).toLowerCase() as StreamPhase,
                phaseMessage: data.message,
            }));
        });

        // Blueprint received — capture full blueprint data and set up agent list
        es.addEventListener("blueprint", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                blueprint: data as StreamBlueprint,
                dimensions: data.dimensions,
                agents: data.agents.map((a: { name: string; archetype: string; dimension: string }) => ({
                    id: a.name.toLowerCase().replace(/\s+/g, "-"),
                    name: a.name,
                    archetype: a.archetype,
                    dimension: a.dimension,
                    status: "pending" as const,
                    progress: 0,
                    findingCount: 0,
                    gapCount: 0,
                })),
            }));
        });

        // Agent spawned
        es.addEventListener("agent_spawned", (e) => {
            const data = JSON.parse(e.data);
            const ts = new Date().toTimeString().slice(0, 8);
            setState(prev => ({
                ...prev,
                agents: prev.agents.map(a =>
                    a.id === data.agentId || a.name === data.name
                        ? { ...a, id: data.agentId, status: "active" as const }
                        : a
                ),
                logs: [...prev.logs, { timestamp: ts, agent: data.name, message: "Agent launched", type: "info" as const }],
            }));
        });

        // Agent progress
        es.addEventListener("agent_progress", (e) => {
            const data = JSON.parse(e.data);
            const ts = new Date().toTimeString().slice(0, 8);
            setState(prev => ({
                ...prev,
                agents: prev.agents.map(a =>
                    a.id === data.agentId
                        ? { ...a, progress: data.progress, status: "active" as const }
                        : a
                ),
                phaseMessage: data.message || prev.phaseMessage,
                logs: data.message ? [...prev.logs, {
                    timestamp: ts,
                    agent: prev.agents.find(a => a.id === data.agentId)?.name ?? "Agent",
                    message: data.message,
                    type: "search" as const,
                }] : prev.logs,
            }));
        });

        // Finding added
        es.addEventListener("finding_added", (e) => {
            const data = JSON.parse(e.data);
            const id = `f-${++findingIdRef.current}`;
            const ts = new Date().toTimeString().slice(0, 8);
            setState(prev => ({
                ...prev,
                findings: [...prev.findings, {
                    id,
                    agentId: data.agentId,
                    statement: data.finding.statement,
                    confidence: data.finding.confidence,
                    evidence: data.finding.evidence,
                    source: data.finding.source,
                    implication: data.finding.implication,
                }],
                agents: prev.agents.map(a =>
                    a.id === data.agentId
                        ? { ...a, findingCount: a.findingCount + 1 }
                        : a
                ),
                logs: [...prev.logs, {
                    timestamp: ts,
                    agent: prev.agents.find(a => a.id === data.agentId)?.name ?? "Agent",
                    message: data.finding.statement.substring(0, 120),
                    type: "finding" as const,
                }],
            }));
        });

        // Agent complete
        es.addEventListener("agent_complete", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                agents: prev.agents.map(a =>
                    a.id === data.agentId
                        ? { ...a, status: "complete" as const, progress: 100, findingCount: data.findingCount, gapCount: data.gapCount }
                        : a
                ),
            }));
        });

        // Agent failed
        es.addEventListener("agent_failed", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                agents: prev.agents.map(a =>
                    a.id === data.agentId
                        ? { ...a, status: "failed" as const, error: data.error }
                        : a
                ),
            }));
        });

        // Synthesis layer
        es.addEventListener("synthesis_layer", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                phase: "synthesize",
                phaseMessage: `Synthesizing: ${data.name} layer...`,
                synthesisLayers: [...prev.synthesisLayers, data],
            }));
        });

        // Emergence detected
        es.addEventListener("emergence_detected", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                emergences: [...prev.emergences, data],
            }));
        });

        // Critic review
        es.addEventListener("critic_review", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                criticIssues: [...prev.criticIssues, data],
            }));
        });

        // Quality report (enriched with full QA system data)
        es.addEventListener("quality_report", (e) => {
            const data = JSON.parse(e.data);
            const report: QualityReport = {
                overallScore: data.overallScore ?? 0,
                grade: data.grade ?? "?",
                provenanceCompleteness: data.provenanceCompleteness ?? 0,
                warningCount: data.warningCount ?? 0,
                criticalWarnings: data.criticalWarnings ?? [],
            };
            setState(prev => ({
                ...prev,
                phase: "qa",
                phaseMessage: `Quality assessment: Grade ${report.grade} (${report.overallScore}%)`,
                quality: report,
            }));
        });

        // Complete
        es.addEventListener("complete", (e) => {
            const data = JSON.parse(e.data);
            setState(prev => ({
                ...prev,
                phase: "complete",
                phaseMessage: "Analysis complete",
                isStreaming: false,
                completionData: {
                    runId: data.runId ?? "",
                    agentCount: data.agentCount ?? 0,
                    totalFindings: data.totalFindings ?? 0,
                    emergentInsights: data.emergentInsights ?? 0,
                    totalCost: data.totalCost ?? 0,
                    presentationPath: data.presentationPath ?? "",
                },
            }));
            es.close();
            eventSourceRef.current = null;
        });

        // Error (custom server-sent error event from the pipeline)
        // NOTE: Native connection errors also fire this listener but with no data.
        // We only handle actual server-sent errors here — onerror handles connection issues.
        es.addEventListener("error", (e) => {
            const messageEvent = e as MessageEvent;
            // Only handle if this is a server-sent error event (has data)
            if (!messageEvent.data) return;
            try {
                const data = JSON.parse(messageEvent.data);
                setState(prev => ({
                    ...prev,
                    phase: "error",
                    phaseMessage: `Error: ${data.error}`,
                    error: data.error,
                    isStreaming: false,
                }));
                es.close();
                eventSourceRef.current = null;
            } catch {
                // Couldn't parse — ignore, let onerror handle it
            }
        });

        es.onerror = (err) => {
            // ALWAYS close to prevent native EventSource auto-reconnect
            // which would re-hit the SSE endpoint and start a new pipeline run.
            es.close();
            eventSourceRef.current = null;
            setState(prev => {
                // Only set error if we haven't already completed
                if (prev.phase === "complete" || prev.phase === "error") return prev;
                return {
                    ...prev,
                    phase: "error",
                    phaseMessage: "Connection lost",
                    error: prev.error || "Pipeline connection lost. Check server logs for details.",
                    isStreaming: false,
                };
            });
        };
    }, []);

    const stopStream = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setState(prev => ({ ...prev, isStreaming: false }));
    }, []);

    const reset = useCallback(() => {
        stopStream();
        setState(INITIAL_STATE);
    }, [stopStream]);

    // Cleanup: close SSE connection on unmount to prevent leaked connections
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, []);

    // HITL actions
    const setFindingAction = useCallback((findingId: string, action: StreamFinding["action"]) => {
        setState(prev => ({
            ...prev,
            findings: prev.findings.map(f =>
                f.id === findingId ? { ...f, action } : f
            ),
        }));
    }, []);

    return {
        ...state,
        startStream,
        stopStream,
        reset,
        setFindingAction,
    };
}

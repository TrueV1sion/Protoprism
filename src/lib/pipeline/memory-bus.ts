/**
 * PRISM Shared Memory Bus
 * 
 * Ported from prism-dev-package/skills/archon/references/memory-protocol.md
 * 
 * Enables agents to:
 * 1. Write findings to a shared Blackboard (knowledge accumulator)
 * 2. Send Signals to other agents (discovery, warning, request, redirect)
 * 3. Register Conflicts (formal disagreements for the conflict resolver)
 * 
 * In-memory implementation for the web app, with JSON export for MCP server mode.
 * Atomic operations via copy-on-write semantics.
 */

import type { IRGraph } from "./ir-types";
import { createEmptyIRGraph } from "./ir-types";

// ─── Types ──────────────────────────────────────────────────

export type EvidenceKind = "direct" | "inferred" | "analogical";
export type SignalType = "discovery" | "warning" | "request" | "redirect";
export type SignalPriority = "low" | "medium" | "high" | "critical";
export type ConflictStatus = "open" | "resolved" | "deferred";

/** An entry on the shared blackboard */
export interface BlackboardEntry {
    id: string;
    agent: string;
    timestamp: string;
    key: string;            // hierarchical: "market/size", "clinical/efficacy"
    value: string;          // the finding or observation
    confidence: number;     // 0.0 - 1.0
    evidenceType: EvidenceKind;
    tags: string[];
    references: string[];   // source citations
}

/** An inter-agent signal */
export interface Signal {
    id: string;
    from: string;
    to: string;             // "all" or specific agent name
    type: SignalType;
    priority: SignalPriority;
    timestamp: string;
    message: string;
    payload?: Record<string, unknown>;
}

/** A formal conflict between agents */
export interface Conflict {
    id: string;
    registeredBy: string;
    timestamp: string;
    status: ConflictStatus;
    claim: string;
    positions: Array<{
        agent: string;
        position: string;
        evidence: string;
        confidence: number;
    }>;
    resolution: string | null;
    resolutionStrategy?: string;
}

/** Full memory bus state snapshot */
export interface MemoryBusState {
    version: number;
    created: string;
    task: string;
    blackboard: BlackboardEntry[];
    signals: Signal[];
    conflicts: Conflict[];
}


// ─── Memory Bus Implementation ──────────────────────────────

export class MemoryBus {
    private state: MemoryBusState;
    private irGraph: IRGraph | null = null;

    constructor(task: string) {
        this.state = {
            version: 1,
            created: new Date().toISOString(),
            task,
            blackboard: [],
            signals: [],
            conflicts: [],
        };
    }

    // ─── Blackboard Operations ──────────────────────────────

    /**
     * Write a finding to the shared blackboard.
     * Other agents can read this to inform their own analysis.
     */
    writeToBlackboard(entry: Omit<BlackboardEntry, "id" | "timestamp">): BlackboardEntry {
        const fullEntry: BlackboardEntry = {
            ...entry,
            id: generateId(),
            timestamp: new Date().toISOString(),
        };
        this.state.blackboard = [...this.state.blackboard, fullEntry];
        return fullEntry;
    }

    /**
     * Read all blackboard entries, optionally filtered.
     */
    readBlackboard(filter?: {
        agent?: string;
        keyPattern?: string;  // glob-style, e.g., "market/*"
        tags?: string[];
        minConfidence?: number;
    }): BlackboardEntry[] {
        let entries = [...this.state.blackboard];

        if (filter?.agent) {
            entries = entries.filter(e => e.agent === filter.agent);
        }
        if (filter?.keyPattern) {
            const regex = globToRegex(filter.keyPattern);
            entries = entries.filter(e => regex.test(e.key));
        }
        if (filter?.tags && filter.tags.length > 0) {
            entries = entries.filter(e =>
                filter.tags!.some(tag => e.tags.includes(tag))
            );
        }
        if (filter?.minConfidence !== undefined) {
            entries = entries.filter(e => e.confidence >= filter.minConfidence!);
        }

        // Newest first
        return entries.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    /**
     * Get a summary of blackboard contents by key prefix.
     * Useful for giving agents a quick overview of what's been discovered.
     */
    getBlackboardSummary(): Record<string, number> {
        const summary: Record<string, number> = {};
        for (const entry of this.state.blackboard) {
            const prefix = entry.key.split("/")[0];
            summary[prefix] = (summary[prefix] || 0) + 1;
        }
        return summary;
    }

    // ─── Signal Operations ──────────────────────────────────

    /**
     * Send a signal to other agents.
     * discovery = found something game-changing
     * warning = found a reliability issue
     * request = need input from another agent
     * redirect = suggest another agent change focus
     */
    sendSignal(signal: Omit<Signal, "id" | "timestamp">): Signal {
        const fullSignal: Signal = {
            ...signal,
            id: generateId(),
            timestamp: new Date().toISOString(),
        };
        this.state.signals = [...this.state.signals, fullSignal];
        return fullSignal;
    }

    /**
     * Read signals for a specific agent, or all critical signals.
     */
    readSignals(filter?: {
        agent?: string;
        priority?: SignalPriority;
        type?: SignalType;
        unreadSince?: string;
    }): Signal[] {
        let signals = [...this.state.signals];

        if (filter?.agent) {
            signals = signals.filter(s =>
                s.to === "all" || s.to === filter.agent
            );
        }
        if (filter?.priority) {
            const priorityRank = { low: 0, medium: 1, high: 2, critical: 3 };
            const minRank = priorityRank[filter.priority];
            signals = signals.filter(s => priorityRank[s.priority] >= minRank);
        }
        if (filter?.type) {
            signals = signals.filter(s => s.type === filter.type);
        }
        if (filter?.unreadSince) {
            const since = new Date(filter.unreadSince).getTime();
            signals = signals.filter(s => new Date(s.timestamp).getTime() > since);
        }

        return signals.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    /**
     * Check if there are any critical signals that haven't been processed.
     */
    hasCriticalSignals(): boolean {
        return this.state.signals.some(s => s.priority === "critical");
    }

    // ─── Conflict Operations ────────────────────────────────

    /**
     * Register a formal disagreement between agents.
     * This feeds into the Conflict Resolution system.
     */
    registerConflict(conflict: Omit<Conflict, "id" | "timestamp" | "status" | "resolution">): Conflict {
        const fullConflict: Conflict = {
            ...conflict,
            id: generateId(),
            timestamp: new Date().toISOString(),
            status: "open",
            resolution: null,
        };
        this.state.conflicts = [...this.state.conflicts, fullConflict];
        return fullConflict;
    }

    /**
     * Resolve a conflict with a resolution statement and strategy.
     */
    resolveConflict(conflictId: string, resolution: string, strategy: string): void {
        this.state.conflicts = this.state.conflicts.map(c =>
            c.id === conflictId
                ? { ...c, status: "resolved" as ConflictStatus, resolution, resolutionStrategy: strategy }
                : c
        );
    }

    /**
     * Defer a conflict (for HITL resolution).
     */
    deferConflict(conflictId: string): void {
        this.state.conflicts = this.state.conflicts.map(c =>
            c.id === conflictId
                ? { ...c, status: "deferred" as ConflictStatus }
                : c
        );
    }

    /**
     * Get all open (unresolved) conflicts.
     */
    getOpenConflicts(): Conflict[] {
        return this.state.conflicts.filter(c => c.status === "open");
    }

    // ─── IR Graph Operations ─────────────────────────────────

    /**
     * Initialize the IR graph for this run.
     * Must be called before any IR enrichment can happen.
     */
    initIR(runId: string): void {
        this.irGraph = createEmptyIRGraph(runId, this.state.task);
    }

    /**
     * Get the live IR graph for mutation by enrichers.
     * Returns null if initIR() was not called.
     */
    getIRGraph(): IRGraph | null {
        return this.irGraph;
    }

    /**
     * Export a deep copy of the IR graph for serialization.
     * Returns null if initIR() was not called.
     */
    exportIR(): IRGraph | null {
        if (!this.irGraph) return null;
        return JSON.parse(JSON.stringify(this.irGraph));
    }

    // ─── State Management ───────────────────────────────────

    /**
     * Get a read-only snapshot of the full memory bus state.
     */
    getState(): Readonly<MemoryBusState> {
        return { ...this.state };
    }

    /**
     * Export the memory bus state as JSON for persistence or MCP server mode.
     */
    export(): string {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Import a previously exported memory bus state.
     */
    static import(json: string): MemoryBus {
        const state = JSON.parse(json) as MemoryBusState;
        const bus = new MemoryBus(state.task);
        bus.state = state;
        return bus;
    }

    /**
     * Get a status summary for logging/debugging.
     */
    getStatus(): {
        entries: number;
        signals: number;
        openConflicts: number;
        resolvedConflicts: number;
        criticalSignals: number;
    } {
        return {
            entries: this.state.blackboard.length,
            signals: this.state.signals.length,
            openConflicts: this.state.conflicts.filter(c => c.status === "open").length,
            resolvedConflicts: this.state.conflicts.filter(c => c.status === "resolved").length,
            criticalSignals: this.state.signals.filter(s => s.priority === "critical").length,
        };
    }

    /**
     * Format a blackboard context string for injection into agent prompts.
     * Gives agents awareness of what other agents have discovered.
     */
    formatForAgentContext(agentName: string): string {
        const entries = this.readBlackboard();
        const signals = this.readSignals({ agent: agentName });
        const conflicts = this.getOpenConflicts();

        if (entries.length === 0 && signals.length === 0) {
            return "";
        }

        const sections: string[] = [];

        if (entries.length > 0) {
            const otherEntries = entries.filter(e => e.agent !== agentName).slice(0, 20);
            if (otherEntries.length > 0) {
                sections.push(
                    "## Shared Blackboard (findings from other agents)\n" +
                    otherEntries.map(e =>
                        `- **[${e.agent}]** ${e.key}: ${e.value} (confidence: ${e.confidence})`
                    ).join("\n")
                );
            }
        }

        if (signals.length > 0) {
            sections.push(
                "## Signals for You\n" +
                signals.map(s =>
                    `- **[${s.priority.toUpperCase()}]** from ${s.from}: ${s.message}`
                ).join("\n")
            );
        }

        if (conflicts.length > 0) {
            sections.push(
                "## Open Conflicts\n" +
                conflicts.map(c =>
                    `- **${c.claim}**: ${c.positions.map(p => `${p.agent} says "${p.position}"`).join(" vs. ")}`
                ).join("\n")
            );
        }

        return sections.join("\n\n");
    }
}


// ─── Utility Functions ──────────────────────────────────────

function generateId(): string {
    // Use crypto UUID if available, fallback to timestamp-based
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function globToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
}

/**
 * Blueprint Approval Registry
 *
 * Manages Promise-based gates for blueprint approval.
 * When a pipeline reaches the blueprint phase, it registers a pending approval.
 * The approval POST endpoint resolves the promise, allowing the pipeline to continue.
 *
 * Uses globalThis to ensure both the stream route and approval route share
 * the same in-memory maps, even when the Next.js dev server (turbopack)
 * loads each route as a separate module instance.
 *
 * Handles the race condition where the client may POST approval before the
 * server registers the pending promise (since the blueprint SSE event is emitted
 * before waitForBlueprintApproval is called). Pre-approvals are tracked so that
 * the wait resolves immediately if approval arrived first.
 */

type PendingApproval = {
  resolve: () => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

// Use globalThis to survive module reloading in dev and share across routes
const globalKey = "__prism_approval_registry__";

type ApprovalRegistry = {
  pendingApprovals: Map<string, PendingApproval>;
  preApproved: Set<string>;
};

function getRegistry(): ApprovalRegistry {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) {
    g[globalKey] = {
      pendingApprovals: new Map<string, PendingApproval>(),
      preApproved: new Set<string>(),
    };
  }
  return g[globalKey] as ApprovalRegistry;
}

/**
 * Wait for blueprint approval for a given run.
 * Returns a Promise that resolves when the client approves.
 * If approval already arrived (race condition), resolves immediately.
 * Times out after 10 minutes.
 */
export function waitForBlueprintApproval(
  runId: string,
  timeoutMs: number = 10 * 60 * 1000,
): Promise<void> {
  const { pendingApprovals, preApproved } = getRegistry();

  // If the client already approved before we registered the wait, resolve immediately
  if (preApproved.has(runId)) {
    preApproved.delete(runId);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingApprovals.delete(runId);
      reject(new Error("Blueprint approval timed out after 10 minutes"));
    }, timeoutMs);

    pendingApprovals.set(runId, { resolve, reject, timeout });
  });
}

/**
 * Approve a pending blueprint. Returns true if approval was accepted.
 * If no pending promise exists yet (race condition), stores a pre-approval
 * so that waitForBlueprintApproval resolves immediately when called.
 */
export function approveBlueprintForRun(runId: string): boolean {
  const { pendingApprovals, preApproved } = getRegistry();

  const pending = pendingApprovals.get(runId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve();
    pendingApprovals.delete(runId);
    return true;
  }

  // Race condition: approval arrived before wait was registered.
  // Store it so waitForBlueprintApproval resolves immediately.
  preApproved.add(runId);
  return true;
}

/**
 * Cancel a pending approval (e.g., on abort).
 */
export function cancelApproval(runId: string): void {
  const { pendingApprovals, preApproved } = getRegistry();

  preApproved.delete(runId);
  const pending = pendingApprovals.get(runId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Pipeline aborted"));
    pendingApprovals.delete(runId);
  }
}

/**
 * Database Utility Functions
 *
 * Centralized utilities for database operations, including
 * snake_case/camelCase conversion, validation, and error handling.
 */

/**
 * Comprehensive snake_case to camelCase mapping
 */
const SNAKE_TO_CAMEL_MAP: Record<string, string> = {
  run_id: "runId",
  agent_id: "agentId",
  autonomy_mode: "autonomyMode",
  complexity_score: "complexityScore",
  estimated_time: "estimatedTime",
  created_at: "createdAt",
  updated_at: "updatedAt",
  completed_at: "completedAt",
  evidence_type: "evidenceType",
  source_tier: "sourceTier",
  layer_name: "layerName",
  sort_order: "sortOrder",
  html_path: "htmlPath",
  slide_count: "slideCount",
  onboarding_dismissed: "onboardingDismissed",
  has_completed_tour: "hasCompletedTour",
  encrypted_key: "encryptedKey",
};

/**
 * Reverse mapping for camelCase to snake_case
 */
const CAMEL_TO_SNAKE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SNAKE_TO_CAMEL_MAP).map(([snake, camel]) => [camel, snake]),
);

/**
 * Convert snake_case object to camelCase
 */
export function toCamel<T = Record<string, unknown>>(
  obj: Record<string, unknown> | null | undefined,
): T | null {
  if (!obj) return null;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = SNAKE_TO_CAMEL_MAP[key] ?? key;

    if (Array.isArray(value)) {
      result[camelKey] = value.map((item) =>
        typeof item === "object" && item !== null ? toCamel(item as Record<string, unknown>) : item,
      );
    } else if (typeof value === "object" && value !== null && !(value instanceof Date)) {
      result[camelKey] = toCamel(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }

  return result as T;
}

/**
 * Convert camelCase object to snake_case
 */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = CAMEL_TO_SNAKE_MAP[key] ?? key;
    result[snakeKey] = value;
  }

  return result;
}

/**
 * Convert array of snake_case objects to camelCase
 */
export function toCamelArray<T = Record<string, unknown>>(
  arr: Record<string, unknown>[],
): T[] {
  return arr.map((item) => toCamel<T>(item)).filter((item): item is T => item !== null);
}

/**
 * User-friendly database error messages
 */
export function formatDbError(error: unknown, operation: string): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("unique constraint") || message.includes("duplicate")) {
      return `${operation} failed: A record with this identifier already exists`;
    }

    if (message.includes("foreign key constraint")) {
      return `${operation} failed: Referenced record does not exist`;
    }

    if (message.includes("not null constraint")) {
      return `${operation} failed: Required field is missing`;
    }

    if (message.includes("check constraint")) {
      return `${operation} failed: Invalid value provided`;
    }

    if (message.includes("timeout") || message.includes("timed out")) {
      return `${operation} failed: Database operation timed out`;
    }

    return `${operation} failed: ${error.message}`;
  }

  return `${operation} failed: Unknown error`;
}

/**
 * Validate and normalize agent result data
 */
export function normalizeAgentResult(result: Record<string, unknown>): Record<string, unknown> {
  const validConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  const validSourceTiers = new Set(["PRIMARY", "SECONDARY", "TERTIARY"]);

  return {
    ...result,
    confidence: validConfidence.has(String(result.confidence).toUpperCase())
      ? String(result.confidence).toUpperCase()
      : "MEDIUM",
    sourceTier: validSourceTiers.has(String(result.sourceTier).toUpperCase())
      ? String(result.sourceTier).toUpperCase()
      : "SECONDARY",
  };
}

/**
 * Validate finding data before insertion
 */
export function validateFinding(finding: Record<string, unknown>): boolean {
  const required = ["statement", "evidence", "confidence", "agentId", "runId"];
  return required.every((field) => finding[field] !== undefined && finding[field] !== null);
}

/**
 * Compress large JSON objects for database storage
 */
export function compressManifest(manifest: unknown): string {
  // Simple JSON stringify for now - can add actual compression later
  return JSON.stringify(manifest);
}

/**
 * Decompress manifest from database
 */
export function decompressManifest<T = unknown>(compressed: string): T {
  return JSON.parse(compressed) as T;
}

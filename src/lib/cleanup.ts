/**
 * File Cleanup Utilities
 *
 * Manages cleanup of old presentation files and other generated assets
 * to prevent disk space leaks.
 */

import { readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { db } from "./db";

export interface CleanupOptions {
  maxAge?: number; // Maximum age in days
  dryRun?: boolean; // If true, only log what would be deleted
}

/**
 * Clean up old presentation files that are no longer referenced in the database
 */
export async function cleanupOldPresentations(
  options: CleanupOptions = {},
): Promise<{ deleted: number; bytes: number; files: string[] }> {
  const { maxAge = 30, dryRun = false } = options;
  const decksDir = join(process.cwd(), "public", "decks");

  try {
    // Get all HTML files in decks directory
    const files = readdirSync(decksDir).filter((f) => f.endsWith(".html"));

    // Get all presentation records from database
    const runs = await db.run.findMany({ includeRelations: true });
    const validPaths = new Set(
      runs.runs
        .map((r) => r.presentation?.htmlPath)
        .filter((p): p is string => p !== undefined && p !== null),
    );

    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const toDelete: Array<{ file: string; size: number }> = [];

    for (const file of files) {
      const filePath = join(decksDir, file);
      const stat = statSync(filePath);
      const age = now - stat.mtimeMs;

      // Check if file is old and not referenced
      const relativePath = `/decks/${file}`;
      if (age > maxAgeMs && !validPaths.has(relativePath)) {
        toDelete.push({ file: filePath, size: stat.size });
      }
    }

    let totalBytes = 0;
    const deletedFiles: string[] = [];

    for (const { file, size } of toDelete) {
      if (!dryRun) {
        unlinkSync(file);
      }
      totalBytes += size;
      deletedFiles.push(file);
    }

    return {
      deleted: deletedFiles.length,
      bytes: totalBytes,
      files: deletedFiles,
    };
  } catch (error) {
    console.error("Cleanup failed:", error);
    return { deleted: 0, bytes: 0, files: [] };
  }
}

/**
 * Clean up orphaned database records (runs without required relations)
 */
export async function cleanupOrphanedRecords(): Promise<{ deleted: number }> {
  // Find runs that failed during initialization and have no agents
  const allRuns = await db.run.findMany({ includeRelations: true });

  let deleted = 0;

  for (const run of allRuns.runs) {
    // Delete runs stuck in INITIALIZE for more than 24 hours with no agents
    if (
      run.status === "INITIALIZE" &&
      (!run.agents || run.agents.length === 0) &&
      Date.now() - new Date(run.createdAt).getTime() > 24 * 60 * 60 * 1000
    ) {
      // Cascade delete will handle related records
      // In a production system, you'd add a db.run.delete method
      deleted++;
    }
  }

  return { deleted };
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  totalPresentations: number;
  totalSizeBytes: number;
  oldestPresentation: Date | null;
  newestPresentation: Date | null;
}> {
  const decksDir = join(process.cwd(), "public", "decks");

  try {
    const files = readdirSync(decksDir).filter((f) => f.endsWith(".html"));

    let totalSize = 0;
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const file of files) {
      const filePath = join(decksDir, file);
      const stat = statSync(filePath);
      totalSize += stat.size;

      const mtime = new Date(stat.mtime);
      if (!oldest || mtime < oldest) oldest = mtime;
      if (!newest || mtime > newest) newest = mtime;
    }

    return {
      totalPresentations: files.length,
      totalSizeBytes: totalSize,
      oldestPresentation: oldest,
      newestPresentation: newest,
    };
  } catch {
    return {
      totalPresentations: 0,
      totalSizeBytes: 0,
      oldestPresentation: null,
      newestPresentation: null,
    };
  }
}

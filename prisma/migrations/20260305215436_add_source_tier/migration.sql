-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statement" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "evidenceType" TEXT NOT NULL DEFAULT 'direct',
    "source" TEXT NOT NULL,
    "sourceTier" TEXT NOT NULL DEFAULT 'SECONDARY',
    "implication" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'keep',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    CONSTRAINT "Finding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Finding" ("action", "agentId", "confidence", "evidence", "evidenceType", "id", "implication", "runId", "source", "statement", "tags") SELECT "action", "agentId", "confidence", "evidence", "evidenceType", "id", "implication", "runId", "source", "statement", "tags" FROM "Finding";
DROP TABLE "Finding";
ALTER TABLE "new_Finding" RENAME TO "Finding";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "uploaderId" INTEGER,
    "imageFile" TEXT,
    "imageType" TEXT,
    "source" TEXT,
    "playedOn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "isTeamGame" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "scores" TEXT,
    "problems" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "approvedById" INTEGER,
    "approvedAt" DATETIME,
    CONSTRAINT "Entry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Entry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("approvedAt", "approvedById", "createdAt", "error", "groupId", "id", "imageFile", "imageType", "isTeamGame", "playedOn", "problems", "processedAt", "result", "scores", "status", "uncertain", "uploaderId") SELECT "approvedAt", "approvedById", "createdAt", "error", "groupId", "id", "imageFile", "imageType", "isTeamGame", "playedOn", "problems", "processedAt", "result", "scores", "status", "uncertain", "uploaderId" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_status_createdAt_idx" ON "Entry"("status", "createdAt");
CREATE INDEX "Entry_groupId_createdAt_idx" ON "Entry"("groupId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- CreateTable
CREATE TABLE "LaneRound" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eveningId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaneRound_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "Evening" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LaneRound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaneAssignment" (
    "roundId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "lane" TEXT NOT NULL,

    PRIMARY KEY ("roundId", "playerId"),
    CONSTRAINT "LaneAssignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LaneRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LaneAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LaneRound_eveningId_number_key" ON "LaneRound"("eveningId", "number");

-- CreateIndex
CREATE INDEX "LaneAssignment_playerId_idx" ON "LaneAssignment"("playerId");

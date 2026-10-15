-- AlterTable
ALTER TABLE "User" ADD COLUMN "paypalMe" TEXT;

-- CreateTable
CREATE TABLE "EveningAttendee" (
    "eveningId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "paidAt" DATETIME,
    "paidById" INTEGER,

    PRIMARY KEY ("eveningId", "playerId"),
    CONSTRAINT "EveningAttendee_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "Evening" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EveningAttendee_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EveningAttendee_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsumptionShare" (
    "consumptionId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,

    PRIMARY KEY ("consumptionId", "playerId"),
    CONSTRAINT "ConsumptionShare_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "Consumption" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionShare_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consumption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eveningId" INTEGER NOT NULL,
    "playerId" INTEGER,
    "menuItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "containedInId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consumption_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "Evening" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consumption_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consumption_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consumption_containedInId_fkey" FOREIGN KEY ("containedInId") REFERENCES "Consumption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Consumption" ("createdAt", "eveningId", "id", "menuItemId", "playerId", "quantity", "unitCents") SELECT "createdAt", "eveningId", "id", "menuItemId", "playerId", "quantity", "unitCents" FROM "Consumption";
DROP TABLE "Consumption";
ALTER TABLE "new_Consumption" RENAME TO "Consumption";
CREATE INDEX "Consumption_eveningId_idx" ON "Consumption"("eveningId");
CREATE INDEX "Consumption_playerId_idx" ON "Consumption"("playerId");
CREATE TABLE "new_Evening" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "locationId" INTEGER,
    "label" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recipientId" INTEGER,
    "billedAt" DATETIME,
    CONSTRAINT "Evening_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evening_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Evening_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evening_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Evening" ("createdAt", "createdById", "date", "groupId", "id", "label", "locationId") SELECT "createdAt", "createdById", "date", "groupId", "id", "label", "locationId" FROM "Evening";
DROP TABLE "Evening";
ALTER TABLE "new_Evening" RENAME TO "Evening";
CREATE INDEX "Evening_groupId_date_idx" ON "Evening"("groupId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EveningAttendee_playerId_idx" ON "EveningAttendee"("playerId");

-- CreateIndex
CREATE INDEX "ConsumptionShare_playerId_idx" ON "ConsumptionShare"("playerId");

-- Wer schon Verzehr hat, wird Teilnehmer seines Abends
INSERT INTO "EveningAttendee" ("eveningId", "playerId")
SELECT DISTINCT "eveningId", "playerId" FROM "Consumption" WHERE "playerId" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consumption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eveningId" INTEGER NOT NULL,
    "playerId" INTEGER,
    "menuItemId" INTEGER,
    "name" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "containedInId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consumption_eveningId_fkey" FOREIGN KEY ("eveningId") REFERENCES "Evening" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consumption_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consumption_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consumption_containedInId_fkey" FOREIGN KEY ("containedInId") REFERENCES "Consumption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Geteilte Positionen (playerId NULL) übernehmen den Artikelnamen und lösen sich von der Karte
INSERT INTO "new_Consumption" ("containedInId", "createdAt", "eveningId", "id", "menuItemId", "name", "playerId", "quantity", "unitCents")
SELECT c."containedInId", c."createdAt", c."eveningId", c."id",
       CASE WHEN c."playerId" IS NULL THEN NULL ELSE c."menuItemId" END,
       CASE WHEN c."playerId" IS NULL THEN m."name" END,
       c."playerId", c."quantity", c."unitCents"
FROM "Consumption" c LEFT JOIN "MenuItem" m ON m."id" = c."menuItemId";
-- Kartenartikel, die nur von geteilten Positionen benutzt wurden, fliegen von der Karte
DELETE FROM "MenuItem"
WHERE "id" IN (SELECT "menuItemId" FROM "Consumption" WHERE "playerId" IS NULL)
  AND "id" NOT IN (SELECT "menuItemId" FROM "new_Consumption" WHERE "menuItemId" IS NOT NULL);
DROP TABLE "Consumption";
ALTER TABLE "new_Consumption" RENAME TO "Consumption";
CREATE INDEX "Consumption_eveningId_idx" ON "Consumption"("eveningId");
CREATE INDEX "Consumption_playerId_idx" ON "Consumption"("playerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

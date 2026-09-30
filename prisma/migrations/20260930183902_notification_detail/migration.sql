-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "level" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "patientId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "min" INTEGER NOT NULL DEFAULT 0,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Notification" ("createdAt", "entityId", "entityType", "id", "key", "level", "min", "patientId", "read", "userId") SELECT "createdAt", "entityId", "entityType", "id", "key", "level", "min", "patientId", "read", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

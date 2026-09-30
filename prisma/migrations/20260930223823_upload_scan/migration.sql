-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClaimDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedAs" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'clean',
    "scanEngine" TEXT NOT NULL DEFAULT 'noop',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClaimDocument" ("claimId", "createdAt", "fileName", "id", "mimeType", "sizeBytes", "storedAs", "uploadedBy") SELECT "claimId", "createdAt", "fileName", "id", "mimeType", "sizeBytes", "storedAs", "uploadedBy" FROM "ClaimDocument";
DROP TABLE "ClaimDocument";
ALTER TABLE "new_ClaimDocument" RENAME TO "ClaimDocument";
CREATE UNIQUE INDEX "ClaimDocument_storedAs_key" ON "ClaimDocument"("storedAs");
CREATE INDEX "ClaimDocument_claimId_idx" ON "ClaimDocument"("claimId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

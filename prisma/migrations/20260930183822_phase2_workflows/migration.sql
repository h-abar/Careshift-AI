-- AlterTable
ALTER TABLE "Handoff" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Handoff" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "Handoff" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Handoff" ADD COLUMN "sbarJson" TEXT;
ALTER TABLE "Handoff" ADD COLUMN "signedOffAt" DATETIME;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN "denialCode" TEXT;

-- CreateTable
CREATE TABLE "HandoffPatient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handoffId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sbarJson" TEXT NOT NULL DEFAULT '{}',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "HandoffPatient_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "Handoff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoffEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handoffId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoffEvent_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "Handoff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedAs" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "score" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InterventionOverride" (
    "stepId" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "escalatedTo" TEXT,
    "assigneeId" TEXT,
    "dueAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME,
    "doneAt" DATETIME,
    "resolvedAt" DATETIME,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionOverride_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InterventionOverride" ("escalatedTo", "patientId", "status", "stepId", "updatedAt", "updatedBy") SELECT "escalatedTo", "patientId", "status", "stepId", "updatedAt", "updatedBy" FROM "InterventionOverride";
DROP TABLE "InterventionOverride";
ALTER TABLE "new_InterventionOverride" RENAME TO "InterventionOverride";
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "level" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "patientId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "min" INTEGER NOT NULL DEFAULT 0,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Notification" ("id", "key", "level", "min", "patientId", "read") SELECT "id", "key", "level", "min", "patientId", "read" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HandoffPatient_handoffId_idx" ON "HandoffPatient"("handoffId");

-- CreateIndex
CREATE INDEX "HandoffEvent_handoffId_idx" ON "HandoffEvent"("handoffId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimDocument_storedAs_key" ON "ClaimDocument"("storedAs");

-- CreateIndex
CREATE INDEX "ClaimDocument_claimId_idx" ON "ClaimDocument"("claimId");

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_idx" ON "ClaimEvent"("claimId");

-- CreateIndex
CREATE INDEX "JourneyEvent_patientId_idx" ON "JourneyEvent"("patientId");

-- CreateTable
CREATE TABLE "ClinicalEvent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL DEFAULT '',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "sourceRecordId" TEXT,
    "ruleId" TEXT,
    "ruleVersion" INTEGER,
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL,
    "correctsId" TEXT,
    "correctionReason" TEXT,
    "lateEntry" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClinicalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEvent_hash_key" ON "ClinicalEvent"("hash");

-- CreateIndex
CREATE INDEX "ClinicalEvent_patientId_occurredAt_idx" ON "ClinicalEvent"("patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEvent_encounterId_occurredAt_idx" ON "ClinicalEvent"("encounterId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEvent_type_idx" ON "ClinicalEvent"("type");

-- CreateIndex
CREATE INDEX "ClinicalEvent_sourceRecordId_idx" ON "ClinicalEvent"("sourceRecordId");

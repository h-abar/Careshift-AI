ALTER TABLE "ClinicalEvent" ADD COLUMN "sourceSystem" TEXT;
CREATE UNIQUE INDEX "ClinicalEvent_sourceSystem_sourceRecordId_key" ON "ClinicalEvent"("sourceSystem", "sourceRecordId");
CREATE TABLE "IngestionDeadLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adapter" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IngestionDeadLetter_adapter_createdAt_idx" ON "IngestionDeadLetter"("adapter", "createdAt");

-- E6 — doctor action tasks (deterioration closed loop)
CREATE TABLE "DoctorTask" (
    "tenantId" TEXT NOT NULL DEFAULT 'demo',
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "acknowledgedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "recheckDueAt" TIMESTAMP(3),
    "ladderStep" INTEGER NOT NULL DEFAULT 0,
    "nextEscalateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "DoctorTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DoctorTask_doctorId_status_idx" ON "DoctorTask"("doctorId", "status");
CREATE INDEX "DoctorTask_patientId_status_idx" ON "DoctorTask"("patientId", "status");

ALTER TABLE "DoctorTask" ADD CONSTRAINT "DoctorTask_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
ALTER TABLE "Session" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");
ALTER TABLE "Patient" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Patient_tenantId_idx" ON "Patient"("tenantId");
ALTER TABLE "Shift" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Shift_tenantId_idx" ON "Shift"("tenantId");
ALTER TABLE "Assignment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Assignment_tenantId_idx" ON "Assignment"("tenantId");
ALTER TABLE "Notification" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
ALTER TABLE "NotificationReceipt" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "NotificationReceipt_tenantId_idx" ON "NotificationReceipt"("tenantId");
ALTER TABLE "ShiftHandoff" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "ShiftHandoff_tenantId_idx" ON "ShiftHandoff"("tenantId");
ALTER TABLE "Handoff" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "Handoff_tenantId_idx" ON "Handoff"("tenantId");
ALTER TABLE "HandoffPatient" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "HandoffPatient_tenantId_idx" ON "HandoffPatient"("tenantId");
ALTER TABLE "HandoffEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "HandoffEvent_tenantId_idx" ON "HandoffEvent"("tenantId");
ALTER TABLE "RiskAssessment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "RiskAssessment_tenantId_idx" ON "RiskAssessment"("tenantId");
ALTER TABLE "InsuranceClaim" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "InsuranceClaim_tenantId_idx" ON "InsuranceClaim"("tenantId");
ALTER TABLE "ClaimLine" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "ClaimLine_tenantId_idx" ON "ClaimLine"("tenantId");
ALTER TABLE "ClaimDocument" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "ClaimDocument_tenantId_idx" ON "ClaimDocument"("tenantId");
ALTER TABLE "ClaimEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "ClaimEvent_tenantId_idx" ON "ClaimEvent"("tenantId");
ALTER TABLE "InterventionOverride" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "InterventionOverride_tenantId_idx" ON "InterventionOverride"("tenantId");
ALTER TABLE "JourneyEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "JourneyEvent_tenantId_idx" ON "JourneyEvent"("tenantId");
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
ALTER TABLE "LoginAttempt" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "LoginAttempt_tenantId_idx" ON "LoginAttempt"("tenantId");
ALTER TABLE "RateBucket" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "RateBucket_tenantId_idx" ON "RateBucket"("tenantId");
ALTER TABLE "ClinicalEvent" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "ClinicalEvent_tenantId_idx" ON "ClinicalEvent"("tenantId");
ALTER TABLE "IngestionDeadLetter" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "IngestionDeadLetter_tenantId_idx" ON "IngestionDeadLetter"("tenantId");
ALTER TABLE "RuleExecution" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX "RuleExecution_tenantId_idx" ON "RuleExecution"("tenantId");
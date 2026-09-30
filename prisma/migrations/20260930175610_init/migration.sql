-- CreateTable
CREATE TABLE "Role" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "dept" TEXT NOT NULL,
    "specialtyEn" TEXT NOT NULL,
    "specialtyAr" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "Role" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "impersonatorId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "sex" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "dxKey" TEXT NOT NULL,
    "attending" TEXT NOT NULL,
    "admittedAt" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "dept" TEXT NOT NULL DEFAULT 'icu',
    "vitalsJson" TEXT NOT NULL,
    "labsJson" TEXT NOT NULL,
    "riskFlagsJson" TEXT NOT NULL,
    "medsJson" TEXT NOT NULL,
    "noteEn" TEXT NOT NULL,
    "noteAr" TEXT NOT NULL,
    "journeyJson" TEXT
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Assignment" (
    "patientId" TEXT NOT NULL PRIMARY KEY,
    "dept" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "physicianId" TEXT NOT NULL,
    "chargeNurseId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "patientId" TEXT,
    "min" INTEGER NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ShiftHandoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromShiftEn" TEXT NOT NULL,
    "fromShiftAr" TEXT NOT NULL,
    "toShiftEn" TEXT NOT NULL,
    "toShiftAr" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "outgoingTeam" TEXT NOT NULL,
    "incomingTeam" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dept" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "outgoingId" TEXT NOT NULL,
    "incomingId" TEXT NOT NULL,
    "patientIdsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewedJson" TEXT NOT NULL,
    "checklistJson" TEXT NOT NULL,
    "timelineJson" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "conditionKey" TEXT NOT NULL,
    "factorsJson" TEXT NOT NULL,
    "windowHrs" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT,
    "amountSar" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "dxKey" TEXT NOT NULL,
    "losDays" INTEGER NOT NULL,
    "icuDays" INTEGER NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "frictionJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "InsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterventionOverride" (
    "stepId" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "escalatedTo" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionOverride_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "prevJson" TEXT,
    "nextJson" TEXT,
    "ip" TEXT,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "RiskAssessment_patientId_idx" ON "RiskAssessment"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

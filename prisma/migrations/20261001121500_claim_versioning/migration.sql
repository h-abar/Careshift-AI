-- C6 — claim versioning + official NPHIES adjudication code column
ALTER TABLE "InsuranceClaim" ADD COLUMN "nphiesCode" TEXT;
ALTER TABLE "InsuranceClaim" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InsuranceClaim" ADD COLUMN "supersedesId" TEXT;
CREATE INDEX "InsuranceClaim_supersedesId_idx" ON "InsuranceClaim"("supersedesId");

-- E7 — automatic claim pipeline state
ALTER TABLE "InsuranceClaim" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "InsuranceClaim" ADD COLUMN "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InsuranceClaim" ADD COLUMN "exceptionJson" TEXT;

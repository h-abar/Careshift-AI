-- CreateTable
CREATE TABLE "ClaimLine" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "codeSystem" TEXT NOT NULL DEFAULT '',
    "codeVersion" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPriceSar" INTEGER,
    "simulatedPrice" BOOLEAN NOT NULL DEFAULT false,
    "serviceStart" TIMESTAMP(3),
    "serviceEnd" TIMESTAMP(3),
    "eventIdsJson" TEXT NOT NULL DEFAULT '[]',
    "necessityJson" TEXT NOT NULL DEFAULT '[]',
    "eventBacked" BOOLEAN NOT NULL DEFAULT true,
    "manualReason" TEXT,
    "flagsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimLine_claimId_idx" ON "ClaimLine"("claimId");

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

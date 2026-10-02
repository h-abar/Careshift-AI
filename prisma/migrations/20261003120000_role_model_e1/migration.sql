-- E1 role model: rename internal roles and add payer-org scoping.
--   physician → doctor   (login role + clinical actorRole strings)
--   insurance → payer    (internal insurance employee removed; the
--                         reviewer is now an EXTERNAL payer user)
-- New columns scope external payer access in E7.

ALTER TABLE "User"            ADD COLUMN IF NOT EXISTS "payerOrg" TEXT;
ALTER TABLE "InsuranceClaim"  ADD COLUMN IF NOT EXISTS "payerOrg" TEXT;

-- New role rows must exist before users are re-pointed (FK on roleKey).
INSERT INTO "Role" ("key", "nameEn", "nameAr") VALUES
  ('doctor', 'Doctor', 'طبيب'),
  ('payer', 'Payer Reviewer', 'مراجع شركة التأمين')
ON CONFLICT ("key") DO NOTHING;

UPDATE "User" SET "roleKey" = 'doctor' WHERE "roleKey" = 'physician';
UPDATE "User" SET "roleKey" = 'payer'  WHERE "roleKey" = 'insurance';

-- Clinical actorRole strings follow the renamed role.
UPDATE "ClinicalEvent" SET "actorRole" = 'doctor' WHERE "actorRole" = 'physician';
UPDATE "ClinicalEvent"
  SET "payloadJson" = REPLACE("payloadJson", '"physician"', '"doctor"')
  WHERE "payloadJson" LIKE '%"physician"%';
UPDATE "InterventionOverride" SET "escalatedTo" = 'doctor' WHERE "escalatedTo" = 'physician';

-- Old role rows removable once no user references them.
DELETE FROM "Role" WHERE "key" IN ('physician', 'insurance');

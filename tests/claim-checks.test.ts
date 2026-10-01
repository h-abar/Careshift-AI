/**
 * C4 — bidirectional consistency checks. Real DB (schema=test).
 * Never auto-changes codes; SE codes must resolve to the imported
 * official NPHIES adjudication-reason list.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import { prisma } from "@/lib/server/prisma";
import { runClaimChecks, CHECKS_LABEL } from "@/lib/server/claim-checks";
import { assembleClaim, addManualLine } from "@/lib/server/claim-assembly";
import { appendEvent } from "@/lib/server/events";

beforeAll(async () => {
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("test") }, stdio: "ignore",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
}, 180_000);

async function assembleFirst() {
  const c = await prisma.insuranceClaim.findFirst({
    where: { patientId: { not: null } }, orderBy: { id: "asc" },
  });
  await assembleClaim(c!.id);
  return c!;
}

describe("C4 consistency checks", () => {
  it("label + readiness + counts shape", async () => {
    const c = await assembleFirst();
    const r = await runClaimChecks(c.id);
    expect(r.label).toBe(CHECKS_LABEL);
    expect(r.readiness).toBeGreaterThanOrEqual(0);
    expect(r.readiness).toBeLessThanOrEqual(100);
    expect(r.counts.lines).toBeGreaterThan(0);
  });

  it("billed-not-lived: manual line flagged with BE-1-2 (official code)", async () => {
    const c = await assembleFirst();
    const manual = await addManualLine(c.id, {
      kind: "procedure", code: "T-XX", quantity: 1,
      reason: "test billed-not-lived",
    });
    const r = await runClaimChecks(c.id);
    const issue = r.issues.find(
      (i) => i.kind === "billed_not_lived" && i.lineId === manual.id,
    );
    expect(issue).toBeTruthy();
    expect(issue!.seCode).toBe("BE-1-2");
    // and the code really is in the imported official list
    const term = await prisma.terminology.findUnique({
      where: {
        provider_system_code: {
          provider: "nphies",
          system: "adjudication-reason",
          code: issue!.seCode!,
        },
      },
    });
    expect(term).toBeTruthy();
    await prisma.claimLine.delete({ where: { id: manual.id } });
  });

  it("lived-not-billed: an unbilled lab event surfaces as an issue", async () => {
    const c = await assembleFirst();
    await appendEvent({
      patientId: c.patientId!, type: "lab_result",
      occurredAt: new Date(), actorRole: "lab",
      payload: { synthetic: true, key: "crp", value: "40", flag: "high" },
    });
    const r = await runClaimChecks(c.id);
    const lived = r.issues.find(
      (i) => i.kind === "lived_not_billed" && i.eventType === "lab_result",
    );
    expect(lived).toBeTruthy();
    // under-billing shown equally — no seCode forced
    expect(lived!.seCode).toBeNull();
  });

  it("doc gaps map ONLY to codes present in the imported list", async () => {
    const c = await assembleFirst();
    const r = await runClaimChecks(c.id);
    for (const i of r.issues) {
      if (!i.seCode) continue;
      const term = await prisma.terminology.findUnique({
        where: {
          provider_system_code: {
            provider: "nphies",
            system: "adjudication-reason",
            code: i.seCode,
          },
        },
      });
      expect(term, `invented code ${i.seCode}`).toBeTruthy();
    }
  });

  it("does not auto-change any code or line", async () => {
    const c = await assembleFirst();
    const before = await prisma.claimLine.findMany({
      where: { claimId: c.id },
      select: { id: true, code: true, quantity: true },
    });
    await runClaimChecks(c.id);
    const after = await prisma.claimLine.findMany({
      where: { claimId: c.id },
      select: { id: true, code: true, quantity: true },
    });
    expect(after).toEqual(before);
  });
});

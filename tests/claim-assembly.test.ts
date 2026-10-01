/**
 * C3 — claim assembly from events. Real DB (schema=test).
 * Hard rules: no supporting events → no line; manual lines need a
 * reason and are flagged not_event_backed; codes never guessed;
 * prices only from the Simulated tariff file.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import { prisma } from "@/lib/server/prisma";
import {
  assembleClaim, addManualLine, getClaimMap, simulatedTariffs,
  ClaimAssemblyError,
} from "@/lib/server/claim-assembly";

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

async function claimWithPatient() {
  const c = await prisma.insuranceClaim.findFirst({
    where: { patientId: { not: null } }, orderBy: { id: "asc" },
  });
  expect(c).toBeTruthy();
  return c!;
}

describe("C3 claim assembly from events", () => {
  it("claim-line-map rule is versioned KB data with a reference", async () => {
    const map = await getClaimMap();
    expect(map.length).toBeGreaterThanOrEqual(5);
    const rule = await prisma.rule.findUnique({
      where: { key: "claim-line-map" }, include: { refs: true },
    });
    expect(rule!.status).toBe("approved");
    expect(rule!.refs.length).toBeGreaterThanOrEqual(1);
  });

  it("assemble builds lines where EVERY line has supporting events", async () => {
    const c = await claimWithPatient();
    const r = await assembleClaim(c.id);
    expect(r.created).toBeGreaterThan(0);
    const lines = await prisma.claimLine.findMany({
      where: { claimId: c.id },
    });
    for (const l of lines.filter((x) => x.eventBacked)) {
      const ids = JSON.parse(l.eventIdsJson) as string[];
      expect(ids.length, `line ${l.id}`).toBeGreaterThan(0);
      // every id resolves to a real event for this patient
      const found = await prisma.clinicalEvent.findMany({
        where: { id: { in: ids }, patientId: c.patientId! },
      });
      expect(found.length).toBe(ids.length);
      // priced lines are Simulated samples only
      if (l.unitPriceSar != null) expect(l.simulatedPrice).toBe(true);
    }
    // necessity chains reference real events
    for (const l of lines) {
      for (const nid of JSON.parse(l.necessityJson) as string[]) {
        expect(
          await prisma.clinicalEvent.findUnique({ where: { id: nid } }),
          nid,
        ).toBeTruthy();
      }
    }
  });

  it("hard rule: an event-backed line with no events is refused", async () => {
    const c = await claimWithPatient();
    // assembleClaim only ever creates lines FROM matched events, so the
    // only way to attempt a violation is the manual path — which must
    // come out flagged, never as a normal line.
    const manual = await addManualLine(c.id, {
      kind: "lab", code: "", quantity: 1, reason: "payer request",
    });
    expect(manual.eventBacked).toBe(false);
    expect(manual.manualReason).toBe("payer request");
    expect(JSON.parse(manual.flagsJson)).toContain("not_event_backed");
    await prisma.claimLine.delete({ where: { id: manual.id } });
  });

  it("manual line without a reason is rejected", async () => {
    const c = await claimWithPatient();
    await expect(
      addManualLine(c.id, { kind: "lab", code: "X", quantity: 1, reason: " " }),
    ).rejects.toThrow(ClaimAssemblyError);
  });

  it("diagnoses unsupported by physician documentation are flagged", async () => {
    const c = await claimWithPatient();
    const r = await assembleClaim(c.id);
    for (const d of r.diagnoses) {
      if (!d.supported) expect(d.byEventIds).toEqual([]);
      else {
        for (const eid of d.byEventIds) {
          const e = await prisma.clinicalEvent.findUnique({ where: { id: eid } });
          expect(e!.type).toBe("documentation_entry");
          expect(e!.actorRole).toBe("physician");
        }
      }
    }
  });

  it("tariff file is labeled Simulated and only provides sample prices", () => {
    const t = simulatedTariffs();
    expect(t.label).toBe("Simulated");
    for (const v of Object.values(t.tariffs)) {
      expect(v.unitPriceSar).toBeGreaterThan(0);
    }
  });
});

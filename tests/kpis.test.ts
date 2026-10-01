/**
 * C7 — KPIs computed from the event/claim registry. Values must be
 * DB-derived (not fabricated) and internally consistent.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import { prisma } from "@/lib/server/prisma";
import { claimKpis, KPI_LABEL } from "@/lib/server/kpis";
import { assembleClaim } from "@/lib/server/claim-assembly";

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
  // give the registry real lines to count
  const c = await prisma.insuranceClaim.findFirst({
    where: { patientId: { not: null } },
  });
  await assembleClaim(c!.id);
}, 180_000);

describe("C7 registry KPIs", () => {
  it("all values derived from DB rows, percentages in range", async () => {
    const k = await claimKpis();
    expect(k.label).toBe(KPI_LABEL);
    const linesTotal = await prisma.claimLine.count();
    const backed = await prisma.claimLine.count({
      where: { eventBacked: true },
    });
    expect(k.linesTotal).toBe(linesTotal);
    expect(k.linesEventBacked).toBe(backed);
    expect(k.eventBackedPct).toBe(
      linesTotal ? Math.round((backed / linesTotal) * 100) : 0,
    );
    expect(k.eventBackedPct).toBeGreaterThanOrEqual(0);
    expect(k.eventBackedPct).toBeLessThanOrEqual(100);

    const evTotal = await prisma.clinicalEvent.count();
    const late = await prisma.clinicalEvent.count({
      where: { lateEntry: true },
    });
    expect(k.eventsTotal).toBe(evTotal);
    expect(k.lateEntryCount).toBe(late);
    expect(k.lateEntryPct).toBe(
      evTotal ? Math.round((late / evTotal) * 100) : 0,
    );

    for (const d of k.denialsByCategory) {
      expect(d.category).toMatch(/^[A-Z]{2}$/);
      expect(d.count).toBeGreaterThan(0);
    }
    expect(k.billedNotLived).toBeGreaterThanOrEqual(0);
    expect(k.livedNotBilled).toBeGreaterThanOrEqual(0);
  });

  it("KPI definitions exist in the registry", async () => {
    const defs = await prisma.kpiDefinition.findMany();
    const keys = defs.map((d) => d.key);
    for (const k of [
      "claim-event-backed-pct", "claim-first-pass-pct",
      "claim-denials-by-category", "claim-readiness-mean",
      "claim-billed-not-lived", "claim-lived-not-billed",
      "event-late-entry-pct", "claim-event-to-claim-h",
    ]) {
      expect(keys).toContain(k);
    }
  });
});

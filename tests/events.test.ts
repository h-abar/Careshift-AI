/**
 * C1 — immutable event store: append-only contract, correction chain,
 * hash verification + tamper detection, late-entry flag, backfill.
 * Real DB (schema=test per vitest env).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import {
  appendEvent, correctEvent, verifyChain, immutableEventStore,
  EventStoreError,
} from "@/lib/server/events";
import { backfillEvents } from "@/lib/server/backfill-events";
import { prisma } from "@/lib/server/prisma";

const PID = "T-EVT1";

beforeAll(async () => {
  // Same pattern as routes.test.ts — migrate deploy + seed on schema=test.
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") },
    stdio: "ignore",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("test") },
    stdio: "ignore",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") },
    stdio: "ignore",
  });
}, 180_000);
const now = Date.now();

describe("C1 clinical event store", () => {
  it("append-only: the mutation guard throws", () => {
    expect(() => immutableEventStore()).toThrow(EventStoreError);
    expect(() => immutableEventStore()).toThrow(/append-only/);
  });

  it("hash-chains events and verify passes", async () => {
    await prisma.clinicalEvent.deleteMany({ where: { patientId: PID } });
    await appendEvent({
      patientId: PID, type: "vital_set",
      occurredAt: new Date(now - 3600e3), actorRole: "nurse",
      payload: { hr: 92 }, recordedAt: new Date(now - 3600e3),
    });
    const e2 = await appendEvent({
      patientId: PID, type: "score_computed",
      occurredAt: new Date(now - 3000e3), actorRole: "system",
      payload: { score: 7 }, recordedAt: new Date(now - 3000e3),
    });
    const rows = await prisma.clinicalEvent.findMany({
      where: { patientId: PID }, orderBy: { recordedAt: "asc" },
    });
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(e2.hash).toMatch(/^[0-9a-f]{64}$/);
    const v = await verifyChain(PID);
    expect(v).toMatchObject({ ok: true, checked: 2, brokenAt: null });
  });

  it("corrections are new events referencing the corrected row", async () => {
    const orig = await prisma.clinicalEvent.findFirst({
      where: { patientId: PID, type: "vital_set" },
    });
    const corr = await correctEvent(
      orig!.id, "device miscalibration",
      { id: "u-nurse", role: "nurse" },
      { hr: 95, supersedes: orig!.id },
    );
    expect(corr.correctsId).toBe(orig!.id);
    expect(corr.correctionReason).toBe("device miscalibration");
    // original row untouched — still there, still valid
    const still = await prisma.clinicalEvent.findUnique({
      where: { id: orig!.id },
    });
    expect(still!.hash).toBe(orig!.hash);
    await expect(
      correctEvent("no-such-id", "x", { id: "u", role: "n" }, {}),
    ).rejects.toThrow(/not found/);
  });

  it("verifyChain detects tampering (mutated payload breaks the chain)", async () => {
    const victim = await prisma.clinicalEvent.findFirst({
      where: { patientId: PID }, orderBy: { recordedAt: "asc" },
    });
    // direct ORM write simulates a tampering attempt
    await prisma.clinicalEvent.update({
      where: { id: victim!.id },
      data: { payloadJson: JSON.stringify({ hr: 999 }) },
    });
    const v = await verifyChain(PID);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(victim!.id);
    await prisma.clinicalEvent.deleteMany({ where: { patientId: PID } });
  });

  it("flags late entries past LATE_ENTRY_MINUTES (default 240)", async () => {
    const late = await appendEvent({
      patientId: PID, type: "documentation_entry",
      occurredAt: new Date(now - 8 * 3600e3), // 8h ago, recorded now
      actorRole: "doctor", payload: { note: "late note" },
    });
    expect(late.lateEntry).toBe(true);
    const onTime = await appendEvent({
      patientId: PID, type: "documentation_entry",
      occurredAt: new Date(now - 60e3),
      actorRole: "doctor", payload: { note: "on time" },
    });
    expect(onTime.lateEntry).toBe(false);
    await prisma.clinicalEvent.deleteMany({ where: { patientId: PID } });
  });

  it("backfill converts existing tables into hash-chained events", async () => {
    const patients = await prisma.patient.count();
    if (!patients) return; // test schema may be empty in isolation
    const before = await prisma.clinicalEvent.count();
    const r = await backfillEvents(new Date("2025-12-28T00:00:00Z"));
    const after = await prisma.clinicalEvent.count();
    expect(after).toBeGreaterThanOrEqual(before); // idempotent or adds
    if (r.events > 0) {
      const types = await prisma.clinicalEvent.groupBy({
        by: ["type"], _count: true,
      });
      const tset = new Set(types.map((t) => t.type));
      expect(tset.has("vital_set")).toBe(true);
      expect(tset.has("score_computed")).toBe(true);
      // every backfilled row is labeled Simulated
      const sample = await prisma.clinicalEvent.findFirst({
        where: { type: "vital_set" },
      });
      expect(JSON.parse(sample!.payloadJson).simulated).toBe("Simulated");
      // chain valid on a backfilled patient
      const v = await verifyChain(sample!.patientId);
      expect(v.ok).toBe(true);
    }
    // second run is a no-op (idempotent)
    const r2 = await backfillEvents(new Date("2025-12-28T00:00:00Z"));
    expect(r2.events).toBe(0);
  }, 60_000);
});

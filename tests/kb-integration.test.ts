/**
 * A6 — end-to-end rule evaluation integration test (real DB).
 * vitals → NEWS2 → tier → priority list → RuleExecution persisted.
 * Runs against an isolated "kbint" schema on the same Postgres server —
 * seeded via committed migrations + prisma/seed.ts, like production.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";

vi.hoisted(() => {
  // vitest env already carries schema=test (+pgbouncer); repoint it.
  process.env.DATABASE_URL = process.env.DATABASE_URL!.replace(
    /schema=\w+/,
    "schema=kbint",
  );
});

import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";
import { dbSnapshots } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";

beforeAll(async () => {
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("kbint") },
    stdio: "ignore",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("kbint") },
    stdio: "ignore",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("kbint") },
    stdio: "ignore",
  });
}, 120_000);

describe("evidence pipeline end-to-end (A6)", () => {
  it("priority list is produced by persisted rule executions", async () => {
    const snaps = await dbSnapshots();
    expect(snaps.length).toBeGreaterThan(0);
    // every patient carries rule-derived priority signals
    const withPrio = snaps.filter((s) => s.priority);
    expect(withPrio.length).toBe(snaps.length);
    // sorted by the validated-indicators sortKey, descending
    const keys = snaps.map((s) => s.priority!.sortKey);
    expect(keys).toEqual([...keys].sort((a, b) => b - a));
    // The septic patient P-2031 (NEWS2 9 + lactate) tops the list —
    // NOT P-1042, whose demo risk.score=87 is metabolic (glucose/ketones)
    // and deliberately does not drive ordering (3B2-16 principle).
    expect(snaps[0].patient.id).toBe("P-2031");
    expect(snaps[0].priority!.tier).toBe(3);
    const p1042 = snaps.find((s) => s.patient.id === "P-1042")!;
    expect(p1042.priority).toBeTruthy();
  }, 60_000); // ~22 patients × 6 rules, sequential on PGlite

  it("every computation wrote RuleExecution rows (id + version + inputs + output)", async () => {
    const total = await prisma.ruleExecution.count();
    expect(total).toBeGreaterThan(0);
    const execs = await prisma.ruleExecution.findMany({
      orderBy: { executedAt: "desc" },
      take: 10,
    });
    for (const e of execs) {
      expect(e.ruleId).toBeTruthy();
      expect(e.ruleVersion).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(e.inputsJson)).toBeTruthy();
      expect(JSON.parse(e.outputJson)).toBeTruthy();
    }
    // ordering specifically ran through the KB (ruleId stores Rule.id)
    const ord = await prisma.rule.findUnique({ where: { key: "patient-ordering" } });
    const ordering = await prisma.ruleExecution.findFirst({
      where: { ruleId: ord!.id },
    });
    expect(ordering).toBeTruthy();
    const out = JSON.parse(ordering!.outputJson);
    expect(typeof out.sortKey).toBe("number");
  });
});

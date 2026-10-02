/**
 * D2 — multi-tenant isolation. Real DB (schema=test): seed creates the
 * "demo" tenant plus "sim-east" (one user + one patient). The extended
 * prisma client scopes every tenant-owned query via AsyncLocalStorage;
 * these tests prove tenant A cannot read, update or delete tenant B's
 * rows through any prisma entry point.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";

import { prisma } from "@/lib/server/prisma";
import {
  withTenant, unscoped, currentTenant, TenantGuardError,
} from "@/lib/server/tenant";

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

describe("D2 tenant guard", () => {
  it("scopes reads to the active tenant", async () => {
    const demoPatients = await withTenant("demo", () =>
      prisma.patient.findMany({ select: { id: true, tenantId: true } }),
    );
    expect(demoPatients.length).toBeGreaterThan(0);
    expect(demoPatients.every((p) => p.tenantId === "demo")).toBe(true);
    expect(demoPatients.some((p) => p.id === "P-SE-1")).toBe(false);

    const eastPatients = await withTenant("sim-east", () =>
      prisma.patient.findMany({ select: { id: true } }),
    );
    expect(eastPatients.map((p) => p.id)).toEqual(["P-SE-1"]);
  });

  it("findUnique on a foreign id returns null", async () => {
    const hit = await withTenant("demo", () =>
      prisma.patient.findUnique({ where: { id: "P-SE-1" } }),
    );
    expect(hit).toBeNull();
    const own = await withTenant("sim-east", () =>
      prisma.patient.findUnique({ where: { id: "P-SE-1" } }),
    );
    expect(own?.id).toBe("P-SE-1");
  });

  it("blocks update/delete on a foreign row", async () => {
    await expect(
      withTenant("demo", () =>
        prisma.patient.update({
          where: { id: "P-SE-1" },
          data: { room: "HACK" },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantGuardError);
    await expect(
      withTenant("demo", () =>
        prisma.patient.delete({ where: { id: "P-SE-1" } }),
      ),
    ).rejects.toBeInstanceOf(TenantGuardError);
    // *Many ops scope the where instead of throwing — zero rows touched
    const del = await withTenant("demo", () =>
      prisma.clinicalEvent.deleteMany({
        where: { patientId: "P-SE-1" },
      }),
    );
    expect(del.count).toBe(0);
  });

  it("client-supplied tenantId in a where clause cannot widen scope", async () => {
    // Passing tenantId:"sim-east" in the where is AND-ed with the guard's
    // own tenantId:"demo" — it narrows to zero, never widens.
    const rows = await withTenant("demo", () =>
      prisma.patient.findMany({
        where: { tenantId: "sim-east" },
        select: { id: true },
      }),
    );
    expect(rows).toEqual([]);
  });

  it("stamps tenantId on create", async () => {
    const ev = await withTenant("sim-east", () =>
      prisma.clinicalEvent.create({
        data: {
          id: "EVT-SE-1",
          patientId: "P-SE-1",
          encounterId: "enc-P-SE-1",
          type: "documentation_entry",
          occurredAt: new Date(),
          payloadJson: "{}",
          hash: "x",
        },
      }),
    );
    expect(ev.tenantId).toBe("sim-east");
    // demo cannot see it; sim-east can
    expect(
      await withTenant("demo", () =>
        prisma.clinicalEvent.findUnique({ where: { id: "EVT-SE-1" } }),
      ),
    ).toBeNull();
    expect(
      await withTenant("sim-east", () =>
        prisma.clinicalEvent.findUnique({ where: { id: "EVT-SE-1" } }),
      ),
    ).not.toBeNull();
  });

  it("no context = unscoped (seed/migration path), cross-tenant queries never leak", async () => {
    expect(currentTenant()).toBeNull();
    const all = await unscoped(() =>
      prisma.patient.findMany({ select: { tenantId: true } }),
    );
    expect(new Set(all.map((p) => p.tenantId))).toEqual(
      new Set(["demo", "sim-east"]),
    );
    // users, audit, claims, clinical events all scoped
    const demoAudit = await withTenant("demo", () =>
      prisma.auditLog.findMany({ select: { tenantId: true } }),
    );
    expect(demoAudit.every((a) => a.tenantId === "demo")).toBe(true);
    const eastUsers = await withTenant("sim-east", () =>
      prisma.user.findMany({ select: { username: true } }),
    );
    expect(eastUsers.map((u) => u.username)).toEqual(["east.nurse"]);
  });

  it("shared knowledge base stays global (not tenant-scoped)", async () => {
    const rules = await withTenant("sim-east", () =>
      prisma.rule.findMany({ select: { id: true } }),
    );
    expect(rules.length).toBeGreaterThan(0);
  });
});

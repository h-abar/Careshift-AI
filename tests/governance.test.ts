/**
 * Prompt B — governance APIs. Real DB (schema=test).
 * B1: calculation rules come from the KB with classifications, version
 *     history and attached references; PDF export is a real PDF.
 * B2: RBAC matrix is derived from lib/permissions — never hand-typed.
 * B3: versioned terms — accept records version+timestamp, audited.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) =>
      cookieStore.has(n) ? { name: n, value: cookieStore.get(n)! } : undefined,
    set: (n: string, v: string) => void cookieStore.set(n, v),
    delete: (n: string) => void cookieStore.delete(n),
  }),
  headers: async () => new Headers(),
}));

import { prisma } from "@/lib/server/prisma";
import { GET as calcGet } from "@/app/api/rules/calculation/route";
import { GET as calcPdf } from "@/app/api/rules/calculation/pdf/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { diffJson } from "@/lib/governance";
import { GET as generalGet } from "@/app/api/rules/general/route";
import { ROLE_PERMISSIONS, PERMISSION_KEYS } from "@/lib/permissions";
import { GET as termsGet } from "@/app/api/terms/route";
import { POST as termsAccept } from "@/app/api/terms/accept/route";
import { TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";
import en from "@/lib/i18n/en";
import ar from "@/lib/i18n/ar";

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
  for (const k of ["RL_LOGIN"]) process.env[k] = "10000";
}, 180_000);

async function loginAs(u: string, p: string) {
  const r = await loginPost(
    new Request("http://test/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-forwarded-for": "10.0.0.7",
      },
      body: JSON.stringify({ username: u, password: p }),
    }),
  );
  expect(r.status).toBe(200);
}

const req = () => new Request("http://test/api/x");

describe("B1 calculation rules from the knowledge base", () => {
  it("requires authentication", async () => {
    cookieStore.clear();
    const res = await calcGet();
    expect(res.status).toBe(401);
  });

  it("returns every rule with classification, versions and refs", async () => {
    await loginAs("m.alotaibi", "Demo@5542");
    const res = await calcGet();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.rules.length).toBeGreaterThanOrEqual(5);
    const news2 = d.rules.find((r: { key: string }) => r.key === "news2-score");
    expect(news2.classification).toBe("validated");
    expect(news2.usedIn.length).toBeGreaterThan(0);
    expect(news2.versions[0].version).toBeGreaterThanOrEqual(1);
    expect(news2.refs.length).toBeGreaterThan(0);
    // versions sorted desc — newest first
    for (const r of d.rules) {
      const vs = r.versions.map((v: { version: number }) => v.version);
      expect(vs).toEqual([...vs].sort((a: number, b: number) => b - a));
    }
    const qsofa = d.rules.find(
      (r: { key: string }) => r.key === "qsofa-context",
    );
    expect(qsofa.classification).toBe("informational");
    expect(d.kpis.length).toBeGreaterThan(0);
    for (const k of d.kpis) expect(k.classification).toBe("kpi");
    for (const s of d.prototypeSettings) {
      expect(s.classification).toBe("prototype");
      expect(typeof s.effective).toBe("number");
    }
  });

  it("PDF route returns a real PDF document", async () => {
    await loginAs("m.alotaibi", "Demo@5542");
    const res = await calcPdf(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.toString("latin1")).toContain("%%EOF");
  });

  it("diffJson marks added and removed lines", () => {
    const d = diffJson('{\n "a": 1\n}', '{\n "a": 2\n}');
    expect(d.some((l) => l.kind === "del")).toBe(true);
    expect(d.some((l) => l.kind === "add")).toBe(true);
    expect(diffJson("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
  });
});


describe("B2 general rules from config + RBAC", () => {
  it("RBAC matrix matches lib/permissions exactly", async () => {
    await loginAs("m.alotaibi", "Demo@5542");
    const res = await generalGet();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.rbac.permissions).toEqual(PERMISSION_KEYS);
    expect(d.rbac.roles.sort()).toEqual(
      Object.keys(ROLE_PERMISSIONS).sort(),
    );
    for (const role of d.rbac.roles) {
      for (const p of d.rbac.permissions) {
        expect(
          d.rbac.matrix[role as keyof typeof ROLE_PERMISSIONS][p],
        ).toBe(
          ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS][
            p as keyof (typeof ROLE_PERMISSIONS)[keyof typeof ROLE_PERMISSIONS]
          ],
        );
      }
    }
    expect(d.prioritization.order.length).toBeGreaterThan(0);
    expect(d.audit.retentionDays.audit).toBeGreaterThan(0);
    expect(d.audit.lateEntryMinutes).toBeGreaterThan(0);
  });
});

describe("B3 versioned terms acceptance", () => {
  it("GET is public and returns the current version + sections", async () => {
    cookieStore.clear();
    const res = await termsGet();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.version).toBe(TERMS_VERSION);
    expect(d.sections).toEqual(TERMS_SECTIONS);
    for (const s of TERMS_SECTIONS) {
      expect(en[`terms.s.${s}.title`]).toBeTruthy();
      expect(ar[`terms.s.${s}.title`]).toBeTruthy();
      expect(en[`terms.s.${s}.body`]).toBeTruthy();
      expect(ar[`terms.s.${s}.body`]).toBeTruthy();
    }
  });

  it("accept records version+timestamp and writes an audit row", async () => {
    await loginAs("m.alotaibi", "Demo@5542");
    const res = await termsAccept();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.version).toBe(TERMS_VERSION);
    expect(d.user.termsVersion).toBe(TERMS_VERSION);
    const row = await prisma.user.findUniqueOrThrow({
      where: { username: "m.alotaibi" },
    });
    expect(row.termsVersion).toBe(TERMS_VERSION);
    expect(row.termsAcceptedAt).toBeTruthy();
    const a = await prisma.auditLog.findFirst({
      where: { action: "terms.accept", entityId: row.id },
    });
    expect(a).toBeTruthy();
    expect(JSON.parse(a!.nextJson!).version).toBe(TERMS_VERSION);
  });
});

/**
 * Route-level API tests — real handlers against a separate test DB
 * (prisma/test.db, reset + re-seeded per run). next/headers is mocked so
 * the session cookie lives in an in-memory store the tests control.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

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

import { GET as patientsGet } from "@/app/api/patients/route";
import { GET as patientGet } from "@/app/api/patients/[id]/route";
import { GET as claimsGet } from "@/app/api/claims/route";
import { PATCH as claimPatch } from "@/app/api/claims/[id]/route";
import { GET as snapshotsGet } from "@/app/api/snapshots/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";
import { POST as switchPost } from "@/app/api/auth/switch/route";
import { POST as switchStopPost } from "@/app/api/auth/switch/stop/route";
import { POST as acceptPost } from "@/app/api/handoffs/[id]/accept/route";
import { POST as interventionPost } from "@/app/api/interventions/[stepId]/route";
import { GET as usersGet, POST as usersPost } from "@/app/api/users/route";
import { PATCH as userPatch } from "@/app/api/users/[id]/route";
import { POST as resetPwPost } from "@/app/api/users/[id]/reset-password/route";
import { GET as auditGet } from "@/app/api/audit/route";
import { prisma } from "@/lib/server/prisma";
import { signSession } from "@/lib/server/session";

/* ── helpers ── */

const post = (body: unknown, ip = "10.0.0.1") =>
  new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
const patch = (body: unknown) =>
  new Request("http://test/api", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = () => new Request("http://test/api");
const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

const USERS = {
  admin: { u: "o.khalil", p: "Demo@8895" },       // U-008
  physician: { u: "a.salem", p: "Demo@1021" },    // U-001
  charge: { u: "k.mohammed", p: "Demo@3310" },    // U-003
  nurse: { u: "s.ahmed", p: "Demo@2088" },        // U-002
  nurse2: { u: "r.yousef", p: "Demo@7704" },      // U-007
  insurance: { u: "m.alotaibi", p: "Demo@5542" }, // U-005
  hosp: { u: "f.shammari", p: "Demo@6613" },      // U-006
};

async function login(u: string, p: string, ip = "10.0.0.1") {
  return loginPost(post({ username: u, password: p }, ip));
}
async function loginAs(who: keyof typeof USERS) {
  cookieStore.clear();
  const r = await login(USERS[who].u, USERS[who].p, `10.0.0.${who.length}`);
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  // Reset the dedicated test DB and re-seed it.
  rmSync("prisma/test.db", { force: true });
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  execSync("npx prisma db push --skip-generate", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
}, 120_000);

beforeEach(() => cookieStore.clear());

/* ── auth/session ── */

describe("auth endpoints", () => {
  it("GET session without cookie → 200 {user:null}", async () => {
    const r = await sessionGet();
    expect(r.status).toBe(200);
    expect((await r.json()).user).toBeNull();
  });

  it("login success → 200, cookie set, auth.login audited", async () => {
    const r = await login(USERS.admin.u, USERS.admin.p, "10.1.1.1");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.user.id).toBe("U-008");
    expect(cookieStore.has("cs_session")).toBe(true);
    const row = await prisma.auditLog.findFirst({
      where: { action: "auth.login", userId: "U-008" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
    expect(row!.ip).toBe("10.1.1.1");
  });

  it("wrong password → 401 + auth.login_failed audited", async () => {
    const r = await login(USERS.nurse.u, "wrong-pass", "10.1.1.2");
    expect(r.status).toBe(401);
    const row = await prisma.auditLog.findFirst({
      where: { action: "auth.login_failed" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
  });

  it("suspended user → 401", async () => {
    const r = await login("r.farouk", "Demo@9012", "10.1.1.3");
    expect(r.status).toBe(401);
  });

  it("5 failed logins → 429 lockout + auth.locked audited", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 5; i++) {
      await login(USERS.physician.u, "bad", ip);
    }
    const r = await login(USERS.physician.u, "bad", ip);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("locked");
    // Even the correct password is rejected while locked.
    const r2 = await login(USERS.physician.u, USERS.physician.p, ip);
    expect(r2.status).toBe(429);
    const row = await prisma.auditLog.findFirst({
      where: { action: "auth.locked" },
    });
    expect(row).toBeTruthy();
  });

  it("logout → 200, session row deleted, auth.logout audited", async () => {
    await loginAs("nurse");
    const r = await logoutPost(post({}));
    expect(r.status).toBe(200);
    const r2 = await patientsGet(get());
    expect(r2.status).toBe(401); // session row gone → unauthorized
    const row = await prisma.auditLog.findFirst({
      where: { action: "auth.logout" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
  });
});

/* ── session integrity ── */

describe("session integrity", () => {
  it("expired session → 401", async () => {
    const s = await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId: "U-008",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    cookieStore.set(
      "cs_session",
      await signSession({ sub: "U-008", sid: s.id, role: "admin" }),
    );
    const r = await patientsGet(get());
    expect(r.status).toBe(401);
  });

  it("deleted session row → 401", async () => {
    cookieStore.set(
      "cs_session",
      await signSession({ sub: "U-008", sid: "ghost", role: "admin" }),
    );
    const r = await patientsGet(get());
    expect(r.status).toBe(401);
  });
});

/* ── per-route RBAC matrix ── */

describe("API permission matrix", () => {
  it("GET /api/patients: 401 anon, 200 nurse, 403 insurance", async () => {
    expect((await patientsGet(get())).status).toBe(401);
    await loginAs("nurse");
    expect((await patientsGet(get())).status).toBe(200);
    await loginAs("insurance");
    expect((await patientsGet(get())).status).toBe(403);
  });

  it("GET /api/claims: 401 anon, 403 nurse, 200 insurance", async () => {
    expect((await claimsGet(get())).status).toBe(401);
    await loginAs("nurse");
    expect((await claimsGet(get())).status).toBe(403);
    await loginAs("insurance");
    expect((await claimsGet(get())).status).toBe(200);
  });

  it("GET /api/users: 401 anon, 403 nurse, 200 admin", async () => {
    expect((await usersGet(get())).status).toBe(401);
    await loginAs("nurse");
    expect((await usersGet(get())).status).toBe(403);
    await loginAs("admin");
    expect((await usersGet(get())).status).toBe(200);
  });

  it("GET /api/audit: 403 nurse, 200 hospital_admin", async () => {
    await loginAs("nurse");
    expect((await auditGet(get())).status).toBe(403);
    await loginAs("hosp");
    expect((await auditGet(get())).status).toBe(200);
  });

  it("GET /api/snapshots: no patient-level data without patients_view", async () => {
    // Insurance reviewer: aggregates + claim-linked minimum only — NO PHI.
    await loginAs("insurance");
    const ins = await (await snapshotsGet(get())).json();
    expect(ins.snaps).toBeUndefined();
    expect(ins.clinical.monitored).toBeGreaterThan(0);
    expect(ins.claimLinked.length).toBeGreaterThan(0);
    const allowed = [
      "claimId", "claimStatus", "claimRisk", "docCompleteness",
      "dxKey", "exposureSar", "patientId", "riskLevel",
    ];
    for (const c of ins.claimLinked) {
      expect(Object.keys(c).sort()).toEqual([...allowed].sort());
      expect(JSON.stringify(c)).not.toMatch(
        /nameAr|nameEn|vitals|labs|meds|mrn|dob/i,
      );
    }
    // Roles WITH patients_view still receive the full snapshots.
    for (const who of ["admin", "physician", "hosp"] as const) {
      await loginAs(who);
      const body = await (await snapshotsGet(get())).json();
      expect(Array.isArray(body.snaps)).toBe(true);
      expect(body.snaps[0].patient.id).toBeTruthy();
    }
  });
});

/* ── patient view audit ── */

describe("patient.view", () => {
  it("records a patient.view audit row + a RiskAssessment row", async () => {
    await loginAs("nurse");
    const r = await patientGet(get(), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.riskHistory)).toBe(true);
    const a = await prisma.auditLog.findFirst({
      where: { action: "patient.view", entityId: "P-1042" },
    });
    expect(a).toBeTruthy();
    const ra = await prisma.riskAssessment.findFirst({
      where: { patientId: "P-1042" },
    });
    expect(ra).toBeTruthy();
  });
});

/* ── interventions ── */

describe("interventions", () => {
  it("nurse executes a step → 200", async () => {
    await loginAs("nurse");
    const r = await interventionPost(
      post({ patientId: "P-1042", status: "done" }),
      ctx({ stepId: "P-1042-IV2" }),
    );
    expect(r.status).toBe(200);
  });

  it("nurse cannot escalate → 403; physician can → 200", async () => {
    await loginAs("nurse");
    const r1 = await interventionPost(
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "physician" }),
      ctx({ stepId: "P-1042-IV3" }),
    );
    expect(r1.status).toBe(403);
    await loginAs("physician");
    const r2 = await interventionPost(
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "physician" }),
      ctx({ stepId: "P-1042-IV3" }),
    );
    expect(r2.status).toBe(200);
    const a = await prisma.auditLog.findFirst({
      where: { action: "intervention.escalate", entityId: "P-1042-IV3" },
    });
    expect(a).toBeTruthy();
  });

  it("foreign stepId for patientId → 400", async () => {
    await loginAs("nurse");
    const r = await interventionPost(
      post({ patientId: "P-1042", status: "done" }),
      ctx({ stepId: "P-9999-IV1" }),
    );
    expect(r.status).toBe(400);
  });
});

/* ── claims ── */

describe("claims_edit", () => {
  it("nurse PATCH → 403; insurance PATCH legal transition → 200 + claim.status audit", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "pending" },
    });
    expect(claim).toBeTruthy();
    await loginAs("nurse");
    const r1 = await claimPatch(patch({ status: "review" }), ctx({ id: claim!.id }));
    expect(r1.status).toBe(403);
    await loginAs("insurance");
    const r2 = await claimPatch(patch({ status: "review" }), ctx({ id: claim!.id }));
    expect(r2.status).toBe(200);
    const a = await prisma.auditLog.findFirst({
      where: { action: "claim.status", entityId: claim!.id },
    });
    expect(a).toBeTruthy();
    expect(JSON.parse(a!.prevJson!)).toEqual({ status: "pending" });
    expect(JSON.parse(a!.nextJson!)).toEqual({ status: "review" });
  });

  it("illegal transition (approved → denied) → 400", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "approved" },
    });
    await loginAs("insurance");
    const r = await claimPatch(patch({ status: "denied" }), ctx({ id: claim!.id }));
    expect(r.status).toBe(400);
  });
});

/* ── handoff accept ── */

describe("handoff accept", () => {
  it("wrong incoming user → 403; assigned incoming → 200 + audit", async () => {
    // HF-2026-0929 is in_progress, incomingId = U-002 (s.ahmed).
    await loginAs("nurse2"); // U-007 — has handoff_accept perm, not the assignee
    const r1 = await acceptPost(post({}), ctx({ id: "HF-2026-0929" }));
    expect(r1.status).toBe(403);
    await loginAs("nurse"); // U-002 — the assigned incoming user
    const r2 = await acceptPost(post({}), ctx({ id: "HF-2026-0929" }));
    expect(r2.status).toBe(200);
    const a = await prisma.auditLog.findFirst({
      where: { action: "handoff.accept", entityId: "HF-2026-0929" },
    });
    expect(a).toBeTruthy();
  });

  it("charge nurse may accept on behalf (manager bypass)", async () => {
    await prisma.handoff.update({
      where: { id: "HF-2026-0929" },
      data: { status: "pending" },
    });
    await loginAs("charge");
    const r = await acceptPost(post({}), ctx({ id: "HF-2026-0929" }));
    expect(r.status).toBe(200);
  });
});

/* ── view-as ── */

describe("view-as", () => {
  it("non-admin → 403", async () => {
    await loginAs("nurse");
    const r = await switchPost(post({ userId: "U-007" }));
    expect(r.status).toBe(403);
  });

  it("admin start → 200 + auth.switch; stop → 200 + auth.switch_end", async () => {
    await loginAs("admin");
    const r = await switchPost(post({ userId: "U-007" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.user.id).toBe("U-007");
    expect(body.impersonator.id).toBe("U-008");
    expect(
      await prisma.auditLog.findFirst({ where: { action: "auth.switch" } }),
    ).toBeTruthy();

    // Starting another view-as while impersonating is blocked.
    const r2 = await switchPost(post({ userId: "U-002" }));
    expect(r2.status).toBe(409);

    const r3 = await switchStopPost(post({}));
    expect(r3.status).toBe(200);
    expect((await r3.json()).user.id).toBe("U-008");
    expect(
      await prisma.auditLog.findFirst({ where: { action: "auth.switch_end" } }),
    ).toBeTruthy();
  });
});

/* ── user administration ── */

describe("user admin", () => {
  it("create → 201 + user.create audit; patch → 200 + user.update audit; reset → 200 + user.password_reset audit", async () => {
    await loginAs("admin");
    const create = await usersPost(
      post({
        username: "test.nurse",
        nameEn: "Test Nurse",
        nameAr: "ممرضة اختبار",
        roleKey: "nurse",
        dept: "icu",
        employeeId: "EMP-9999",
        email: "test.nurse@careshift.demo",
        password: "Test@12345",
      }),
    );
    expect(create.status).toBe(201);
    const { id } = await create.json();
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "user.create", entityId: id },
      }),
    ).toBeTruthy();

    const upd = await userPatch(patch({ dept: "er" }), ctx({ id }));
    expect(upd.status).toBe(200);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "user.update", entityId: id },
      }),
    ).toBeTruthy();

    const rp = await resetPwPost(post({ password: "NewPass@999" }), ctx({ id }));
    expect(rp.status).toBe(200);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "user.password_reset", entityId: id },
      }),
    ).toBeTruthy();

    // New credentials actually work.
    cookieStore.clear();
    const r = await login("test.nurse", "NewPass@999", "10.2.2.2");
    expect(r.status).toBe(200);
  });

  it("non-admin create → 403; weak password → 400; duplicate username → 409", async () => {
    await loginAs("nurse");
    const r0 = await usersPost(post({ username: "x", password: "x" }));
    expect(r0.status).toBe(403);
    await loginAs("admin");
    const r1 = await usersPost(
      post({
        username: "weak", nameEn: "W", nameAr: "و", roleKey: "nurse",
        dept: "icu", employeeId: "EMP-0001", password: "short",
      }),
    );
    expect(r1.status).toBe(400);
    const r2 = await usersPost(
      post({
        username: "a.salem", nameEn: "Dup", nameAr: "د", roleKey: "nurse",
        dept: "icu", employeeId: "EMP-0002", password: "LongPass@1",
      }),
    );
    expect(r2.status).toBe(409);
  });

  it("self-suspend is blocked → 400", async () => {
    await loginAs("admin");
    const r = await userPatch(patch({ status: "suspended" }), ctx({ id: "U-008" }));
    expect(r.status).toBe(400);
  });

  it("A3: demoting the last active admin → 400 + audited attempt", async () => {
    await loginAs("admin");
    const r = await userPatch(patch({ roleKey: "physician" }), ctx({ id: "U-008" }));
    expect(r.status).toBe(400);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "user.last_admin_blocked", entityId: "U-008" },
      }),
    ).toBeTruthy();
    // Still an admin.
    const u = await prisma.user.findUnique({ where: { id: "U-008" } });
    expect(u!.roleKey).toBe("admin");
  });
});

/* ── A2: suspended users + session revocation ── */

describe("A2 suspended-user session revocation", () => {
  it("suspend → all sessions die; next request 401; both audited", async () => {
    // Nurse holds a live session cookie.
    const lr = await login(USERS.nurse.u, USERS.nurse.p, "10.9.9.1");
    expect(lr.status).toBe(200);
    const nurseCookie = cookieStore.get("cs_session")!;
    const nurse = await prisma.user.findUnique({
      where: { username: USERS.nurse.u },
    });

    await loginAs("admin");
    const pr = await userPatch(
      patch({ status: "suspended" }),
      ctx({ id: nurse!.id }),
    );
    expect(pr.status).toBe(200);
    expect(
      await prisma.session.count({ where: { userId: nurse!.id } }),
    ).toBe(0);

    // The dead cookie gets a 401 — and the rejection itself is audited.
    cookieStore.clear();
    cookieStore.set("cs_session", nurseCookie);
    expect((await patientsGet(get())).status).toBe(401);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "user.sessions_revoked", entityId: nurse!.id },
      }),
    ).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "auth.suspended_reject", entityId: nurse!.id },
      }),
    ).toBeTruthy();

    // Restore for the rest of the suite.
    await loginAs("admin");
    await userPatch(patch({ status: "active" }), ctx({ id: nurse!.id }));
  });

  it("role change → sessions revoked; old cookie 401s", async () => {
    const lr = await login(USERS.nurse2.u, USERS.nurse2.p, "10.9.9.2");
    expect(lr.status).toBe(200);
    const nurseCookie = cookieStore.get("cs_session")!;
    const nurse = await prisma.user.findUnique({
      where: { username: USERS.nurse2.u },
    });

    await loginAs("admin");
    expect(
      (
        await userPatch(patch({ roleKey: "physician" }), ctx({ id: nurse!.id }))
      ).status,
    ).toBe(200);
    expect(
      await prisma.session.count({ where: { userId: nurse!.id } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "user.sessions_revoked",
          entityId: nurse!.id,
        },
      }),
    ).toBeTruthy();

    cookieStore.clear();
    cookieStore.set("cs_session", nurseCookie);
    expect((await patientsGet(get())).status).toBe(401);

    // Restore.
    await loginAs("admin");
    await userPatch(patch({ roleKey: "nurse" }), ctx({ id: nurse!.id }));
  });
});

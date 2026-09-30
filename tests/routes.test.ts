/**
 * Route-level API tests — real handlers against a separate test DB
 * (prisma/test.db, reset + re-seeded per run). next/headers is mocked so
 * the session cookie lives in an in-memory store the tests control.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

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
import { PATCH as claimPatch, GET as claimGet } from "@/app/api/claims/[id]/route";
import { POST as claimAppeal } from "@/app/api/claims/[id]/appeal/route";
import { POST as claimResubmit } from "@/app/api/claims/[id]/resubmit/route";
import { POST as claimUpload } from "@/app/api/claims/[id]/documents/route";
import { GET as documentGet } from "@/app/api/documents/[docId]/route";
import { GET as snapshotsGet } from "@/app/api/snapshots/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";
import { POST as switchPost } from "@/app/api/auth/switch/route";
import { POST as switchStopPost } from "@/app/api/auth/switch/stop/route";
import { POST as acceptPost } from "@/app/api/handoffs/[id]/accept/route";
import { POST as handoffCreatePost } from "@/app/api/handoffs/create/route";
import { POST as signoffPost } from "@/app/api/handoffs/[id]/signoff/route";
import { POST as rejectPost } from "@/app/api/handoffs/[id]/reject/route";
import { PATCH as handoffPatch, GET as handoffGet } from "@/app/api/handoffs/[id]/route";
import { POST as interventionPost } from "@/app/api/interventions/[stepId]/route";
import { GET as usersGet, POST as usersPost } from "@/app/api/users/route";
import { PATCH as userPatch } from "@/app/api/users/[id]/route";
import { POST as resetPwPost } from "@/app/api/users/[id]/reset-password/route";
import { POST as unlockPost } from "@/app/api/users/[id]/unlock/route";
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
  // Reset the dedicated test DB and re-seed it — via COMMITTED migrations
  // (migrate deploy), so tests exercise exactly what production runs.
  rmSync("prisma/test.db", { force: true });
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
  process.env.UPLOAD_DIR = path.join(
    (await import("node:os")).tmpdir(),
    "cs-test-uploads",
  );
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

  it("5 failed logins → 429 lockout; admin unlock restores access", async () => {
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
    expect(
      await prisma.auditLog.findFirst({ where: { action: "auth.locked" } }),
    ).toBeTruthy();

    // Admin unlock clears the failed-attempt window — audited.
    await loginAs("admin");
    const target = await prisma.user.findUnique({
      where: { username: USERS.physician.u },
    });
    const ur = await unlockPost(post({}), ctx({ id: target!.id }));
    expect(ur.status).toBe(200);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "auth.unlock", entityId: target!.id },
      }),
    ).toBeTruthy();
    const ok2 = await login(USERS.physician.u, USERS.physician.p, ip);
    expect(ok2.status).toBe(200);
  });

  it("per-username lock counts failures across different IPs", async () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1"; // honour x-forwarded-for here
    try {
      const name = "locktest@x.io";
      for (let i = 0; i < 5; i++) await login(name, "bad", `10.8.8.${i}`);
      // 6th failure comes from yet another IP — the per-username
      // counter (independent of IP) has already tripped.
      const r = await login(name, "bad", "10.8.8.99");
      expect(r.status).toBe(429);
    } finally {
      process.env.TRUSTED_PROXY = old;
      await prisma.loginAttempt.deleteMany({
        where: { username: "locktest@x.io" },
      });
    }
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

  it("B3 lifecycle: start → overdue (derived) → escalate → resolve", async () => {
    const step = "P-1042-IV4";
    await prisma.interventionOverride.deleteMany({ where: { stepId: step } });

    // Start the step with an already-past dueAt -> derived overdue.
    await loginAs("nurse");
    const start = await interventionPost(
      post({
        patientId: "P-1042", status: "in_progress", assigneeId: "U-002",
        dueAt: new Date(Date.now() - 60_000).toISOString(), note: "started",
      }),
      ctx({ stepId: step }),
    );
    expect(start.status).toBe(200);

    // Nurse still cannot escalate (perm) even though overdue is derived.
    const deny = await interventionPost(
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "physician" }),
      ctx({ stepId: step }),
    );
    expect(deny.status).toBe(403);

    // Physician escalates the (derived) overdue step -> notify physician.
    await loginAs("physician");
    const esc = await interventionPost(
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "physician" }),
      ctx({ stepId: step }),
    );
    expect(esc.status).toBe(200);
    expect(
      await prisma.notification.findFirst({
        where: { userId: "U-001", entityId: step, key: "notif.interventionEscalated" },
      }),
    ).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "intervention.escalate", entityId: step },
      }),
    ).toBeTruthy();

    // Resolve closes the loop.
    const res = await interventionPost(
      post({ patientId: "P-1042", status: "resolved" }),
      ctx({ stepId: step }),
    );
    expect(res.status).toBe(200);
    const row = await prisma.interventionOverride.findUnique({
      where: { stepId: step },
    });
    expect(row!.resolvedAt).toBeTruthy();
    // Terminal — further transitions rejected.
    expect(
      (
        await interventionPost(
          post({ patientId: "P-1042", status: "done" }),
          ctx({ stepId: step }),
        )
      ).status,
    ).toBe(409);
  });

  it("foreign stepId for patientId → 400", async () => {
    await loginAs("nurse");
    const r = await interventionPost(
      post({ patientId: "P-1042", status: "done" }),
      ctx({ stepId: "P-9999-IV1" }),
    );
    expect(r.status).toBe(400);
  });

  it("A6: well-formed stepId NOT in the generated plan → 400", async () => {
    await loginAs("nurse");
    const r = await interventionPost(
      post({ patientId: "P-1042", status: "done" }),
      ctx({ stepId: "P-1042-IV999" }),
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
    expect(JSON.parse(a!.nextJson!)).toEqual({
      status: "review",
      denialCode: null,
    });
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

/* ── B4: claims lifecycle + documents + appeal/resubmit ── */

const uploadReq = (file: File | null, kind = "") => {
  const fd = new FormData();
  if (file) fd.append("file", file);
  if (kind) fd.append("kind", kind);
  return new Request("http://test/api", { method: "POST", body: fd });
};

describe("B4 claims lifecycle", () => {
  it("denied requires a valid denialCode; stores it + ClaimEvent", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "pending" },
    });
    await loginAs("insurance");
    // No code → 400
    expect(
      (
        await claimPatch(
          patch({ status: "denied" }),
          ctx({ id: claim!.id }),
        )
      ).status,
    ).toBe(400);
    // Bogus code → 400
    expect(
      (
        await claimPatch(
          patch({ status: "denied", denialCode: "nonsense" }),
          ctx({ id: claim!.id }),
        )
      ).status,
    ).toBe(400);
    const r = await claimPatch(
      patch({ status: "denied", denialCode: "missing_docs" }),
      ctx({ id: claim!.id }),
    );
    expect(r.status).toBe(200);
    const row = await prisma.insuranceClaim.findUnique({
      where: { id: claim!.id },
    });
    expect(row!.denialCode).toBe("missing_docs");
    const ev = await prisma.claimEvent.findFirst({
      where: { claimId: claim!.id, action: "status" },
    });
    expect(ev!.detail).toContain("missing_docs");
    // Other claims viewers were notified.
    expect(
      await prisma.notification.findFirst({
        where: { entityId: claim!.id, key: "notif.claimStatus" },
      }),
    ).toBeTruthy();
  });

  it("appeal: denied → review, reason required + audited", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "denied" },
    });
    await loginAs("insurance");
    expect(
      (await claimAppeal(post({}), ctx({ id: claim!.id }))).status,
    ).toBe(400);
    const r = await claimAppeal(
      post({ reason: "Additional records attached" }),
      ctx({ id: claim!.id }),
    );
    expect(r.status).toBe(200);
    expect(
      (await prisma.insuranceClaim.findUnique({ where: { id: claim!.id } }))!
        .status,
    ).toBe("review");
    expect(
      await prisma.claimEvent.findFirst({
        where: { claimId: claim!.id, action: "appeal" },
      }),
    ).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "claim.appeal", entityId: claim!.id },
      }),
    ).toBeTruthy();
    // A non-denied claim cannot be appealed.
    expect(
      (await claimAppeal(post({ reason: "x" }), ctx({ id: claim!.id }))).status,
    ).toBe(409);
  });

  it("resubmit: denied → review with note + audit", async () => {
    const claim = await prisma.insuranceClaim.create({
      data: {
        id: "CL-TEST-RS",
        amountSar: 5000, status: "denied", dxKey: "dka",
        losDays: 2, icuDays: 0,
        evidenceJson: '["diagnosis"]', frictionJson: "[]",
        denialCode: "coding_error",
      },
    });
    await loginAs("insurance");
    expect(
      (await claimResubmit(post({}), ctx({ id: claim.id }))).status,
    ).toBe(400);
    const r = await claimResubmit(
      post({ note: "Codes corrected" }),
      ctx({ id: claim.id }),
    );
    expect(r.status).toBe(200);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "claim.resubmit", entityId: claim.id },
      }),
    ).toBeTruthy();
  });

  it("documents: type/size validated, evidence updates readiness", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "review" },
    });
    await loginAs("nurse"); // no claims_edit
    const bad = new File(["x"], "x.txt", { type: "text/plain" });
    expect(
      (
        await claimUpload(uploadReq(bad), ctx({ id: claim!.id }))
      ).status,
    ).toBe(403);
    await loginAs("insurance");
    expect(
      (await claimUpload(uploadReq(bad), ctx({ id: claim!.id }))).status,
    ).toBe(400);
    const big = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "big.pdf",
      { type: "application/pdf" },
    );
    expect(
      (await claimUpload(uploadReq(big), ctx({ id: claim!.id }))).status,
    ).toBe(400);

    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "lab.pdf", {
      type: "application/pdf",
    });
    const r = await claimUpload(
      uploadReq(pdf, "lab"),
      ctx({ id: claim!.id }),
    );
    expect(r.status).toBe(200);
    const { document } = await r.json();
    const row = await prisma.insuranceClaim.findUnique({
      where: { id: claim!.id },
    });
    expect(JSON.parse(row!.evidenceJson)).toContain("lab");

    // Authenticated download → 200 + mime; anonymous → 401.
    const dl = await documentGet(get(), ctx({ docId: document.id }));
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("application/pdf");
    cookieStore.clear();
    expect(
      (await documentGet(get(), ctx({ docId: document.id }))).status,
    ).toBe(401);
  });

  it("GET claim detail → documents + events + readiness", async () => {
    await loginAs("insurance");
    const claims = await prisma.insuranceClaim.findFirst({
      where: { status: "review" },
    });
    const r = await claimGet(get(), ctx({ id: claims!.id }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.claim.id).toBe(claims!.id);
    expect(body.documents.length).toBeGreaterThan(0);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.readiness.score).toBeGreaterThan(0);
  });
});

/* ── handoff accept ── */

describe("handoff accept", () => {
  it("wrong incoming user → 403; assigned incoming → 200 + audit", async () => {
    // HF-2026-0929: drive it to signed_off, then accept as the assignee.
    const seeded = await prisma.handoff.findUnique({
      where: { id: "HF-2026-0929" },
    });
    const seededIds = JSON.parse(seeded!.patientIdsJson) as string[];
    await prisma.handoff.update({
      where: { id: "HF-2026-0929" },
      data: {
        status: "pending",
        reviewedJson: JSON.stringify(
          Object.fromEntries(seededIds.map((p) => [p, true])),
        ),
        checklistJson: JSON.stringify([
          "criticalReviewed", "pendingReviewed",
          "escalationsReviewed", "recommendationsReviewed",
        ]),
      },
    });
    await loginAs("charge");
    await signoffPost(post({}), ctx({ id: "HF-2026-0929" }));

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
      data: { status: "signed_off" },
    });
    await loginAs("charge");
    const r = await acceptPost(post({}), ctx({ id: "HF-2026-0929" }));
    expect(r.status).toBe(200);
  });

  it("B1 full flow: create → SBAR → review → signoff → reject; create → signoff → accept → completed", async () => {
    // Charge nurse creates — per-patient rows get auto SBAR + notify incoming.
    await loginAs("charge");
    const created = await handoffCreatePost(
      post({
        dept: "icu", shift: "day",
        outgoingId: "U-003", incomingId: "U-002",
        patientIds: ["P-1042"],
      }),
    );
    expect(created.status).toBe(200);
    const { handoff } = await created.json();
    expect(handoff.status).toBe("pending");
    const hp = await prisma.handoffPatient.findFirst({
      where: { handoffId: handoff.id },
    });
    expect(hp).toBeTruthy();
    const sbar = JSON.parse(hp!.sbarJson);
    expect(sbar.ar.s.length).toBeGreaterThan(5);
    expect(sbar.en.s.length).toBeGreaterThan(5);
    expect(
      await prisma.notification.findFirst({
        where: { userId: "U-002", entityId: handoff.id },
      }),
    ).toBeTruthy();

    // Sign-off blocked until review + checklist are complete.
    const early = await signoffPost(post({}), ctx({ id: handoff.id }));
    expect(early.status).toBe(400);

    // Outgoing edits SBAR + marks reviewed + completes checklist.
    const pr = await handoffPatch(
      patch({
        reviewed: { "P-1042": true },
        checklist: [
          "criticalReviewed", "pendingReviewed",
          "escalationsReviewed", "recommendationsReviewed",
        ],
        sbar: { patientId: "P-1042", lang: "en", s: "Edited S", bb: "B", a: "A", r: "R" },
      }),
      ctx({ id: handoff.id }),
    );
    expect(pr.status).toBe(200);
    const detail = await handoffGet(get(), ctx({ id: handoff.id }));
    const det = await detail.json();
    expect(det.handoff.patients[0].sbar.en.s).toBe("Edited S");

    // Incoming rejects WITHOUT sign-off → allowed from pending; reason required.
    await loginAs("nurse");
    const noReason = await rejectPost(post({}), ctx({ id: handoff.id }));
    expect(noReason.status).toBe(400);
    const rejected = await rejectPost(
      post({ reason: "Missing recent labs" }),
      ctx({ id: handoff.id }),
    );
    expect(rejected.status).toBe(200);
    expect(
      await prisma.notification.findFirst({
        where: { userId: "U-003", entityId: handoff.id, key: "notif.handoffRejectedBy" },
      }),
    ).toBeTruthy();
    // Terminal state — no sign-off on a rejected handoff.
    expect((await signoffPost(post({}), ctx({ id: handoff.id }))).status).toBe(409);

    // Second handoff completes the happy path.
    await loginAs("charge");
    const c2 = await handoffCreatePost(
      post({
        dept: "icu", shift: "day",
        outgoingId: "U-003", incomingId: "U-002",
        patientIds: ["P-1042"],
      }),
    );
    const { handoff: h2 } = await c2.json();
    await handoffPatch(
      patch({
        reviewed: { "P-1042": true },
        checklist: [
          "criticalReviewed", "pendingReviewed",
          "escalationsReviewed", "recommendationsReviewed",
        ],
      }),
      ctx({ id: h2.id }),
    );
    // Accept before sign-off → 409 (machine enforced).
    await loginAs("nurse");
    expect((await acceptPost(post({}), ctx({ id: h2.id }))).status).toBe(409);
    await loginAs("charge");
    expect((await signoffPost(post({}), ctx({ id: h2.id }))).status).toBe(200);
    await loginAs("nurse");
    const acc = await acceptPost(post({}), ctx({ id: h2.id }));
    expect(acc.status).toBe(200);
    const done = await prisma.handoff.findUnique({ where: { id: h2.id } });
    expect(done!.status).toBe("completed");
    expect(done!.completedAt).toBeTruthy();
    // Persisted timeline events exist.
    const evts = await prisma.handoffEvent.count({ where: { handoffId: h2.id } });
    expect(evts).toBeGreaterThanOrEqual(4); // created+reviewed+checklist+signoff+accept
  });

  it("A6: outgoingId === incomingId → 400", async () => {
    await loginAs("charge");
    const r = await handoffCreatePost(
      post({
        dept: "icu", shift: "day",
        outgoingId: "U-002", incomingId: "U-002",
        patientIds: ["P-1042"],
      }),
    );
    expect(r.status).toBe(400);
  });
});

/* ── A6: audit dedupe ── */

describe("audit dedupe (A6)", () => {
  it("repeated list views inside the window → a single audit row", async () => {
    await prisma.auditLog.deleteMany({
      where: { action: "patients.list" },
    });
    await loginAs("nurse");
    await patientsGet(get());
    await patientsGet(get());
    await patientsGet(get());
    expect(
      await prisma.auditLog.count({
        where: { action: "patients.list", userId: "U-002" },
      }),
    ).toBe(1);
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

  it("B6: users list carries locked flag + real lastLoginMin; edit contact audited", async () => {
    await loginAs("admin");
    const list = await (await usersGet(get())).json();
    const target = list.users.find((u: { id: string }) => u.id === "U-002");
    expect(typeof target.locked).toBe("boolean");
    expect(target.lastLoginMin === null || target.lastLoginMin >= 0).toBe(true);

    const r = await userPatch(
      patch({ email: "s.ahmed2@careshift.demo", phone: "+966500001", specialtyEn: "ICU RN" }),
      ctx({ id: "U-002" }),
    );
    expect(r.status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: "U-002" } });
    expect(row!.email).toBe("s.ahmed2@careshift.demo");
    const a = await prisma.auditLog.findFirst({
      where: { action: "user.update", entityId: "U-002" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(a!.nextJson!).email).toBe("s.ahmed2@careshift.demo");
    // invalid email → 400
    expect(
      (await userPatch(patch({ email: "nope" }), ctx({ id: "U-002" }))).status,
    ).toBe(400);
  });

  it("B6: generated temp password shown once + works for login", async () => {
    await loginAs("admin");
    const r = await resetPwPost(post({}), ctx({ id: "U-002" }));
    expect(r.status).toBe(200);
    const { tempPassword } = await r.json();
    expect(tempPassword.length).toBeGreaterThanOrEqual(8);
    cookieStore.clear();
    const lr = await login(USERS.nurse.u, tempPassword, "10.3.3.3");
    expect(lr.status).toBe(200);
    // Second reset returns a NEW one-time password.
    await loginAs("admin");
    const r2 = await resetPwPost(post({}), ctx({ id: "U-002" }));
    const { tempPassword: p2 } = await r2.json();
    expect(p2).not.toBe(tempPassword);
    // Old temp no longer works.
    cookieStore.clear();
    expect((await login(USERS.nurse.u, tempPassword, "10.3.3.4")).status).toBe(401);
    // Restore the seeded password for other tests.
    await loginAs("admin");
    await resetPwPost(post({ password: USERS.nurse.p }), ctx({ id: "U-002" }));
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

/* ── B2: risk reassessment + threshold alerts ── */

import { POST as reassessPost } from "@/app/api/patients/[id]/reassess/route";
import { PATCH as patientPatch } from "@/app/api/patients/[id]/route";
import { PATCH as notifPatch } from "@/app/api/notifications/[id]/route";
import { GET as notifGet } from "@/app/api/notifications/route";

describe("B2 risk reassessment", () => {
  it("insurance (no risk_view) → 403; nurse → 200 + RiskAssessment row", async () => {
    await loginAs("insurance");
    expect(
      (await reassessPost(post({}), ctx({ id: "P-1042" }))).status,
    ).toBe(403);
    await loginAs("nurse");
    const r = await reassessPost(post({}), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.risk.score).toBeGreaterThan(0);
    expect(body.riskHistory.length).toBeGreaterThan(0);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "risk.reassess", entityId: "P-1042" },
      }),
    ).toBeTruthy();
  });

  it("threshold crossing alerts assigned nurse + physician", async () => {
    // Force a "low" baseline so the next (high) run crosses UP.
    await prisma.riskAssessment.create({
      data: {
        patientId: "P-1042", score: 10, level: "low",
        conditionKey: "routine", factorsJson: "[]",
        windowHrs: 24, confidence: 50,
      },
    });
    await loginAs("physician");
    const r = await reassessPost(post({}), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.crossedUp).toBe(true);
    // U-002 = assigned nurse, U-001 = assigned physician for P-1042.
    for (const uid of ["U-002", "U-001"]) {
      const n = await prisma.notification.findFirst({
        where: { userId: uid, patientId: "P-1042", key: "notif.riskAlert" },
      });
      expect(n).toBeTruthy();
    }
  });

  it("vitals update persists + reassesses (charge only)", async () => {
    const vitals = [
      { t: "12:00", hr: 130, sbp: 80, rr: 32, temp: 39.4, spo2: 88, glucose: 480 },
    ];
    await loginAs("nurse"); // no patients_edit
    expect(
      (await patientPatch(patch({ vitals }), ctx({ id: "P-1042" }))).status,
    ).toBe(403);
    await loginAs("charge");
    const r = await patientPatch(patch({ vitals }), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const row = await prisma.patient.findUnique({ where: { id: "P-1042" } });
    expect(JSON.parse(row!.vitalsJson)[0].glucose).toBe(480);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "patient.update", entityId: "P-1042" },
      }),
    ).toBeTruthy();
  });

  it("alert acknowledge is audited + only own notifications", async () => {
    const n = await prisma.notification.create({
      data: {
        id: "ntf-test-1", userId: "U-002", level: "warning",
        key: "notif.riskAlert", patientId: "P-1042", detail: "90",
      },
    });
    await loginAs("nurse2"); // U-007 — not the owner
    expect(
      (await notifPatch(patch({ action: "ack" }), ctx({ id: n.id }))).status,
    ).toBe(403);
    await loginAs("nurse"); // U-002 owner
    const r = await notifPatch(patch({ action: "ack" }), ctx({ id: n.id }));
    expect(r.status).toBe(200);
    expect(
      (await prisma.notification.findUnique({ where: { id: n.id } }))!.read,
    ).toBe(true);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "alert.ack", entityId: n.id },
      }),
    ).toBeTruthy();
    // GET returns the row to its owner; unread mirrors unread rows.
    const list = await (await notifGet()).json();
    expect(list.notifications.some((x: { id: string }) => x.id === n.id)).toBe(true);
    expect(list.unread).toBe(
      list.notifications.filter((x: { read: boolean }) => !x.read).length,
    );
  });
});

/* ── B7: computed savings trend + live journey events ── */

import { dbSavingsTrend } from "@/lib/server/data";

describe("B7 computed static-data replacements", () => {
  it("savingsTrend is computed from claim rows (6 months, real sums)", async () => {
    const trend = await dbSavingsTrend();
    expect(trend).toHaveLength(6);
    const rows = await prisma.insuranceClaim.findMany();
    const approved = rows
      .filter((c) => c.status === "approved")
      .reduce((a, c) => a + c.amountSar, 0);
    const trendAvoided = trend.reduce((a, b) => a + b.avoided, 0);
    // Within rounding tolerance (SAR thousands per bucket).
    expect(Math.abs(trendAvoided - approved / 1000)).toBeLessThan(6);
    expect(trend.every((b) => b.month && b.monthAr)).toBe(true);
  });

  it("reassessment crossing appends a journey event to the DB row", async () => {
    await prisma.riskAssessment.create({
      data: {
        patientId: "P-6304", score: 5, level: "low",
        conditionKey: "routine", factorsJson: "[]",
        windowHrs: 24, confidence: 50,
      },
    });
    const before = await prisma.patient.findUnique({
      where: { id: "P-6304" }, select: { journeyJson: true },
    });
    const beforeLen = JSON.parse(before!.journeyJson ?? "[]").length;
    await loginAs("physician");
    const r = await reassessPost(post({}), ctx({ id: "P-6304" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    if (body.crossedUp && (body.risk.level === "high" || body.risk.level === "critical")) {
      const after = await prisma.patient.findUnique({
        where: { id: "P-6304" }, select: { journeyJson: true },
      });
      const arr = JSON.parse(after!.journeyJson ?? "[]");
      expect(arr.length).toBeGreaterThan(beforeLen);
      expect(arr[arr.length - 1].kind).toBe("risk");
    } else {
      // No crossing → no fabricated event.
      const after = await prisma.patient.findUnique({
        where: { id: "P-6304" }, select: { journeyJson: true },
      });
      expect(JSON.parse(after!.journeyJson ?? "[]").length).toBe(beforeLen);
    }
  });
});

/* ── B5: dismiss + mark-all-read ── */

import { POST as notifMarkAll } from "@/app/api/notifications/route";

describe("B5 notification center", () => {
  it("dismiss hides the row; mark-all marks everything", async () => {
    const n = await prisma.notification.create({
      data: {
        id: "ntf-test-2", userId: "U-002", level: "info",
        key: "notif.claimStatus", entityId: "CL-1", detail: "review",
      },
    });
    await loginAs("nurse");
    expect(
      (await notifPatch(patch({ action: "dismiss" }), ctx({ id: n.id }))).status,
    ).toBe(200);
    const list = await (await notifGet()).json();
    expect(
      list.notifications.some((x: { id: string }) => x.id === n.id),
    ).toBe(false);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "alert.dismiss", entityId: n.id },
      }),
    ).toBeTruthy();

    const r = await notifMarkAll(post({}));
    expect(r.status).toBe(200);
    // Broadcasts (userId=null) are shared — only MY rows are marked.
    const broadcastUnread = await prisma.notification.count({
      where: { userId: null, read: false, dismissed: false },
    });
    const after = await (await notifGet()).json();
    expect(after.unread).toBe(broadcastUnread);
    expect(
      await prisma.notification.count({
        where: { userId: "U-002", read: false, dismissed: false },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "alert.read_all", userId: "U-002" },
      }),
    ).toBeTruthy();
  });
});

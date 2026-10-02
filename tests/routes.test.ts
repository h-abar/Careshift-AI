/**
 * Route-level API tests — real handlers against a separate test DB
 * (prisma/test.db, reset + re-seeded per run). next/headers is mocked so
 * the session cookie lives in an in-memory store the tests control.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
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
import { GET as handoffsGet } from "@/app/api/handoffs/route";
import { POST as interventionPost } from "@/app/api/interventions/[stepId]/route";
import { GET as usersGet, POST as usersPost } from "@/app/api/users/route";
import { PATCH as userPatch } from "@/app/api/users/[id]/route";
import { POST as resetPwPost } from "@/app/api/users/[id]/reset-password/route";
import { POST as unlockPost } from "@/app/api/users/[id]/unlock/route";
import { GET as auditGet } from "@/app/api/audit/route";
import { GET as auditExportGet } from "@/app/api/audit/export/route";
import { GET as accessReviewGet } from "@/app/api/admin/access-review/route";
import { POST as consentPost } from "@/app/api/consent/route";
import { purgeExpired } from "@/lib/server/retention";
import { prisma } from "@/lib/server/prisma";
import { signSession } from "@/lib/server/session";
import { __setCaptchaVerifierForTests } from "@/lib/server/captcha";
import { checkRate } from "@/lib/server/ratelimit";

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
  doctor: { u: "a.salem", p: "Demo@1021" },    // U-001
  charge: { u: "k.mohammed", p: "Demo@3310" },    // U-003
  nurse: { u: "s.ahmed", p: "Demo@2088" },        // U-002
  nurse2: { u: "r.yousef", p: "Demo@7704" },      // U-007
  payer: { u: "m.alotaibi", p: "Demo@5542" }, // U-005
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
  // Reset the dedicated "test" schema and re-seed it — via COMMITTED
  // migrations (migrate deploy), so tests exercise what production runs.
  // The seed truncates every table, which is the reset.
  // PGlite leaks prepared statements — clear them before migrate deploy.
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
  process.env.UPLOAD_DIR = path.join(
    (await import("node:os")).tmpdir(),
    "cs-test-uploads",
  );
  // Raise rate limits for the suite — the dedicated rate-limit test
  // lowers its own bucket back down locally.
  for (const k of ["RL_LOGIN", "RL_USERADMIN", "RL_UPLOAD", "RL_REASSESS", "RL_CLAIMWRITE"]) {
    process.env[k] = "10000";
  }
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
    // TRUSTED_PROXY is off by default → spoofed XFF is ignored ("local").
    const noProxy = await login(USERS.admin.u, USERS.admin.p, "10.1.1.1");
    expect(noProxy.status).toBe(200);
    let row = await prisma.auditLog.findFirst({
      where: { action: "auth.login", userId: "U-008" },
      orderBy: { createdAt: "desc" },
    });
    expect(row!.ip).toBe("local");

    // With a trusted proxy, the forwarded client IP is recorded.
    const old = process.env.TRUSTED_PROXY;
    try {
      process.env.TRUSTED_PROXY = "1";
      const r = await login(USERS.admin.u, USERS.admin.p, "10.1.1.1");
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.user.id).toBe("U-008");
      expect(cookieStore.has("cs_session")).toBe(true);
      row = await prisma.auditLog.findFirst({
        where: { action: "auth.login", userId: "U-008" },
        orderBy: { createdAt: "desc" },
      });
      expect(row).toBeTruthy();
      expect(row!.ip).toBe("10.1.1.1");
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
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
      await login(USERS.doctor.u, "bad", ip);
    }
    const r = await login(USERS.doctor.u, "bad", ip);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("locked");
    // Even the correct password is rejected while locked.
    const r2 = await login(USERS.doctor.u, USERS.doctor.p, ip);
    expect(r2.status).toBe(429);
    expect(
      await prisma.auditLog.findFirst({ where: { action: "auth.locked" } }),
    ).toBeTruthy();

    // Admin unlock clears the failed-attempt window — audited.
    await loginAs("admin");
    const target = await prisma.user.findUnique({
      where: { username: USERS.doctor.u },
    });
    const ur = await unlockPost(post({}), ctx({ id: target!.id }));
    expect(ur.status).toBe(200);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "auth.unlock", entityId: target!.id },
      }),
    ).toBeTruthy();
    const ok2 = await login(USERS.doctor.u, USERS.doctor.p, ip);
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
    await loginAs("payer");
    expect((await patientsGet(get())).status).toBe(403);
  }, 20_000);

  it("GET /api/claims: 401 anon, 403 nurse, 200 insurance", async () => {
    expect((await claimsGet(get())).status).toBe(401);
    await loginAs("nurse");
    expect((await claimsGet(get())).status).toBe(403);
    await loginAs("payer");
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
    // hospital_admin: aggregates + claim-linked minimum only — NO PHI.
    // The external payer gets nothing here (claims come via /api/claims*).
    await loginAs("payer");
    expect((await snapshotsGet(get())).status).toBe(403);
    await loginAs("hosp");
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
    for (const who of ["nurse", "doctor", "charge"] as const) {
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
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "doctor" }),
      ctx({ stepId: step }),
    );
    expect(deny.status).toBe(403);

    // Physician escalates the (derived) overdue step -> notify physician.
    await loginAs("doctor");
    const esc = await interventionPost(
      post({ patientId: "P-1042", status: "escalated", escalatedTo: "doctor" }),
      ctx({ stepId: step }),
    );
    expect(esc.status).toBe(200);
    expect(
      await prisma.notification.findFirst({
        where: { receipts: { some: { userId: "U-001" } }, entityId: step, key: "notif.interventionEscalated" },
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

describe("claims payer actions", () => {
  it("nurse PATCH → 403; payer PATCH legal transition → 200 + claim.status audit", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "pending", payerOrg: "payer-sim-a" },
    });
    expect(claim).toBeTruthy();
    await loginAs("nurse");
    const r1 = await claimPatch(patch({ status: "review" }), ctx({ id: claim!.id }));
    expect(r1.status).toBe(403);
    await loginAs("payer");
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
      where: { status: "approved", payerOrg: "payer-sim-a" },
    });
    await loginAs("payer");
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
      where: { status: "pending", payerOrg: "payer-sim-a" },
    });
    await loginAs("payer");
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
    await loginAs("hosp");
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
    await loginAs("hosp"); // resubmission is the hospital's appeal flow
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
      where: { status: "review", payerOrg: "payer-sim-a" },
      orderBy: { id: "asc" },
    });
    await loginAs("nurse"); // no appeal_approve
    const bad = new File(["x"], "x.txt", { type: "text/plain" });
    expect(
      (
        await claimUpload(uploadReq(bad), ctx({ id: claim!.id }))
      ).status,
    ).toBe(403);
    await loginAs("hosp");
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
    ).toBe(413);

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

    // Authenticated download → 200 + safe headers; anonymous → 401.
    const dl = await documentGet(get(), ctx({ docId: document.id }));
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("application/pdf");
    expect(dl.headers.get("Content-Disposition")).toContain("attachment");
    expect(dl.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(dl.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    cookieStore.clear();
    expect(
      (await documentGet(get(), ctx({ docId: document.id }))).status,
    ).toBe(401);
  });

  it("magic bytes: spoofed type rejected; oversized Content-Length → 413 early", async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "review" },
    });
    await loginAs("hosp");
    // PDF bytes declared as PNG → mime_mismatch
    const spoof = new File([new Uint8Array([37, 80, 68, 70])], "x.png", {
      type: "image/png",
    });
    const sm = await claimUpload(uploadReq(spoof), ctx({ id: claim!.id }));
    expect(sm.status).toBe(400);
    expect((await sm.json()).code).toBe("mime_mismatch");

    // Content-Length over the cap is rejected BEFORE buffering.
    const fd = new FormData();
    fd.append("file", new File(["x"], "x.png", { type: "image/png" }));
    const early = new Request("http://test/api", {
      method: "POST",
      body: fd,
      headers: { "content-length": String(6 * 1024 * 1024) },
    });
    expect((await claimUpload(early, ctx({ id: claim!.id }))).status).toBe(413);
  });

  it("AV scan: infected verdict rejects the file and removes it", async () => {
    const { __setAvScannerForTests } = await import("@/lib/server/avscan");
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "review" },
    });
    __setAvScannerForTests({
      name: "test-av",
      scan: async () => ({ clean: false, signature: "Eicar-Test", engine: "test-av" }),
    });
    try {
      await loginAs("hosp");
      const png = new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "eicar.png",
        { type: "image/png" },
      );
      const r = await claimUpload(uploadReq(png), ctx({ id: claim!.id }));
      expect(r.status).toBe(422);
      expect((await r.json()).code).toBe("av_infected");
      // Row exists but is marked infected — never downloadable.
      const doc = await prisma.claimDocument.findFirst({
        where: { fileName: "eicar.png" },
      });
      expect(doc!.scanStatus).toBe("infected");
      expect(
        (await documentGet(get(), ctx({ docId: doc!.id }))).status,
      ).toBe(404);
      expect(
        await prisma.auditLog.findFirst({
          where: { action: "claim.upload_blocked" },
        }),
      ).toBeTruthy();
    } finally {
      __setAvScannerForTests(null);
    }
  });

  it("GET claim detail → documents + events + readiness", async () => {
    await loginAs("payer");
    // Deterministic: pick a payer-scoped claim that actually has
    // documents — Postgres findFirst order is arbitrary without orderBy.
    const claims = await prisma.insuranceClaim.findFirst({
      where: { payerOrg: "payer-sim-a", documents: { some: {} } },
      orderBy: { id: "asc" },
    });
    expect(claims).toBeTruthy();
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
    await prisma.handoff.update({
      where: { id: "HF-2026-0929" },
      data: { status: "signed_off" },
    });

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
        where: { receipts: { some: { userId: "U-002" } }, entityId: handoff.id },
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
        where: { receipts: { some: { userId: "U-003" } }, entityId: handoff.id, key: "notif.handoffRejectedBy" },
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
  }, 15_000); // PGlite: two full handoff lifecycles exceed the 5s default

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
    const r = await userPatch(patch({ roleKey: "doctor" }), ctx({ id: "U-008" }));
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
        await userPatch(patch({ roleKey: "doctor" }), ctx({ id: nurse!.id }))
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
    await loginAs("payer");
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
  }, 20_000);

  it("threshold crossing alerts assigned nurse + physician", async () => {
    // Force a "low" baseline so the next (high) run crosses UP.
    await prisma.riskAssessment.create({
      data: {
        patientId: "P-1042", score: 10, level: "low",
        conditionKey: "routine", factorsJson: "[]",
        windowHrs: 24, confidence: 50,
      },
    });
    await loginAs("doctor");
    const r = await reassessPost(post({}), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.crossedUp).toBe(true);
    // U-002 = assigned nurse, U-001 = assigned physician for P-1042.
    for (const uid of ["U-002", "U-001"]) {
      const n = await prisma.notification.findFirst({
        where: { receipts: { some: { userId: uid } }, patientId: "P-1042", key: "notif.riskAlert" },
      });
      expect(n).toBeTruthy();
    }
  }, 20_000);

  it("vitals update persists + reassesses (charge only)", async () => {
    const vitals = [
      { t: "12:00", hr: 130, sbp: 80, rr: 32, temp: 39.4, spo2: 88, glucose: 480 },
    ];
    await loginAs("payer"); // no patients_edit
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
  }, 20_000);

  it("alert acknowledge is audited + only own notifications", async () => {
    const n = await prisma.notification.create({
      data: {
        id: "ntf-test-1", level: "warning",
        key: "notif.riskAlert", patientId: "P-1042", detail: "90",
        receipts: { create: { id: "ntf-test-1-r1", userId: "U-002" } },
      },
    });
    await loginAs("nurse2"); // U-007 — not a recipient
    expect(
      (await notifPatch(patch({ action: "ack" }), ctx({ id: n.id }))).status,
    ).toBe(403);
    await loginAs("nurse"); // U-002 recipient
    const r = await notifPatch(patch({ action: "ack" }), ctx({ id: n.id }));
    expect(r.status).toBe(200);
    expect(
      (await prisma.notificationReceipt.findUnique({
        where: { notificationId_userId: { notificationId: n.id, userId: "U-002" } },
      }))!.readAt,
    ).not.toBeNull();
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

/* ── C1: zod validation — unknown fields + consistent error shape ── */

describe("C1 shared validation", () => {
  it("unknown fields rejected with {error, code, fields} shape", async () => {
    await loginAs("payer");
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "pending", payerOrg: "payer-sim-a" },
    });
    const r = await claimPatch(
      patch({ status: "review", bogus: "field" }),
      ctx({ id: claim!.id }),
    );
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.code).toBe("validation");
    expect(body.fields).toBeTruthy();
    // Unrecognized key reported.
    expect(JSON.stringify(body.fields)).toContain("bogus");
  });

  it("bad JSON body → 400 bad_json; schema violation → 400 with fields", async () => {
    await loginAs("admin");
    const badJson = new Request("http://test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const r1 = await usersPost(badJson);
    expect(r1.status).toBe(400);
    expect((await r1.json()).code).toBe("bad_json");

    const r2 = await usersPost(post({ username: "x" }));
    expect(r2.status).toBe(400);
    const b2 = await r2.json();
    expect(b2.code).toBe("validation");
    expect(Object.keys(b2.fields).length).toBeGreaterThan(1);
  });
});

/* ── B7: computed savings trend + live journey events ── */

import { dbSavingsTrend } from "@/lib/server/data";
import { notifyPerm } from "@/lib/server/notify";

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
    await loginAs("doctor");
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
  }, 20_000);
});

/* ── B5: dismiss + mark-all-read ── */

import { POST as notifMarkAll } from "@/app/api/notifications/route";

describe("B5 notification center", () => {
  it("dismiss hides the row; mark-all marks everything", async () => {
    const n = await prisma.notification.create({
      data: {
        id: "ntf-test-2", level: "info",
        key: "notif.claimStatus", entityId: "CL-1", detail: "review",
        receipts: {
          create: [
            { id: "ntf-test-2-r1", userId: "U-002" },
            { id: "ntf-test-2-r2", userId: "U-007" },
          ],
        },
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

    // U-002's dismiss must not touch U-007's receipt for the same row.
    const other = await prisma.notificationReceipt.findUnique({
      where: { notificationId_userId: { notificationId: n.id, userId: "U-007" } },
    });
    expect(other!.readAt).toBeNull();
    expect(other!.dismissedAt).toBeNull();

    const r = await notifMarkAll(post({}));
    expect(r.status).toBe(200);
    const after = await (await notifGet()).json();
    expect(after.unread).toBe(0);
    expect(
      await prisma.notificationReceipt.count({
        where: { userId: "U-002", readAt: null, dismissedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "alert.read_all", userId: "U-002" },
      }),
    ).toBeTruthy();
  });

  it("patient-linked notifications never reach roles without patients_view", async () => {
    // A patient-linked audience send resolves to patients_view holders only —
    // the insurance reviewer (insurance_view, no patients_view) gets nothing.
    const n = await notifyPerm("patients_view", "notif.riskAlert", "critical", {
      patientId: "P-1042",
      entityType: "patient",
      entityId: "P-1042",
      detail: "99",
    });
    expect(n).toBeTruthy();
    const receipts = await prisma.notificationReceipt.findMany({
      where: { notificationId: n!.id },
    });
    const ins = await prisma.user.findFirst({ where: { roleKey: "payer" } });
    expect(ins).toBeTruthy();
    expect(receipts.some((r) => r.userId === ins!.id)).toBe(false);
    expect(receipts.some((r) => r.userId === "U-002")).toBe(true);

    // And the insurance user's notification list has no patient-linked rows.
    await loginAs("payer");
    const list = await (await notifGet()).json();
    expect(
      list.notifications.some(
        (x: { patientId?: string }) => x.patientId !== undefined,
      ),
    ).toBe(false);
  });

  it("dismissing as user A does not affect user B", async () => {
    const n = await prisma.notification.create({
      data: {
        id: "ntf-test-3", level: "info", key: "notif.claimStatus",
        receipts: {
          create: [
            { id: "ntf-test-3-rA", userId: "U-002" },
            { id: "ntf-test-3-rB", userId: "U-001" },
          ],
        },
      },
    });
    await loginAs("nurse"); // U-002
    expect(
      (await notifPatch(patch({ action: "dismiss" }), ctx({ id: n.id }))).status,
    ).toBe(200);
    const b = await prisma.notificationReceipt.findUnique({
      where: { notificationId_userId: { notificationId: n.id, userId: "U-001" } },
    });
    expect(b!.dismissedAt).toBeNull();
    // B still sees it in their list.
    await loginAs("doctor"); // U-001
    const list = await (await notifGet()).json();
    expect(list.notifications.some((x: { id: string }) => x.id === n.id)).toBe(
      true,
    );
  });
});

/* ── 0.4: staff pickers carry minimum-necessary identity ── */

describe("0.4 minimum-necessary users", () => {
  it("GET /api/handoffs users expose only id/names/role/dept", async () => {
    await loginAs("charge");
    const r = await handoffsGet();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.users.length).toBeGreaterThan(0);
    for (const u of body.users) {
      expect(Object.keys(u).sort()).toEqual(
        ["dept", "id", "nameAr", "nameEn", "role"].sort(),
      );
    }
    // Admin list still returns the full record.
    await loginAs("admin");
    const full = await (await usersGet(get())).json();
    expect(full.users[0].email).toBeTruthy();
  });
});

/* ── 0.3: audit IP honours TRUSTED_PROXY via clientIp() ── */

describe("0.3 audit IP", () => {
  it("audit() records the trusted clientIp on the row", async () => {
    const { audit } = await import("@/lib/server/audit");
    const old = process.env.TRUSTED_PROXY;
    try {
      process.env.TRUSTED_PROXY = "1";
      const req = new Request("http://test/api", {
        headers: { "x-forwarded-for": "192.0.2.77" },
      });
      await audit(
        {
          userId: "U-008", action: "test.ip", entityType: "test",
          entityId: "ip-check",
        },
        req,
      );
      const row = await prisma.auditLog.findFirst({
        where: { action: "test.ip", entityId: "ip-check" },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.ip).toBe("192.0.2.77");
      // Without TRUSTED_PROXY the same spoofed header is ignored.
      delete process.env.TRUSTED_PROXY;
      await audit(
        {
          userId: "U-008", action: "test.ip", entityType: "test",
          entityId: "ip-check-2",
        },
        req,
      );
      const row2 = await prisma.auditLog.findFirst({
        where: { entityId: "ip-check-2" },
      });
      expect(row2?.ip).toBe("local");
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
  });
});

/* ── C6: server-side pagination ── */

describe("pagination", () => {
  const getQ = (url: string) => new Request(url);

  it("users: filters + page/pageSize + total are server-side", async () => {
    await loginAs("admin");
    const r = await usersGet(
      getQ("http://test/api/users?role=nurse&pageSize=2&page=1"),
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.page).toBe(1);
    expect(d.pageSize).toBe(2);
    expect(d.users.length).toBeLessThanOrEqual(2);
    expect(d.total).toBeGreaterThanOrEqual(d.users.length);
    expect(d.users.every((u: { role: string }) => u.role === "nurse")).toBe(
      true,
    );
    const r2 = await usersGet(getQ("http://test/api/users?q=zzz-nomatch"));
    expect((await r2.json()).users).toHaveLength(0);
  });

  it("audit: page slices differ and total is stable", async () => {
    await loginAs("admin");
    // generate some audit rows
    await auditGet(getQ("http://test/api/audit"));
    const p1 = await (
      await auditGet(getQ("http://test/api/audit?pageSize=3&page=1"))
    ).json();
    const p2 = await (
      await auditGet(getQ("http://test/api/audit?pageSize=3&page=2"))
    ).json();
    expect(p1.entries).toHaveLength(3);
    expect(p1.total).toBeGreaterThan(3);
    expect(p2.entries.length).toBeGreaterThan(0);
    expect(p1.entries[0].id).not.toBe(p2.entries[0].id);
    const filtered = await (
      await auditGet(getQ("http://test/api/audit?action=auth.login"))
    ).json();
    expect(
      filtered.entries.every((e: { action: string }) =>
        e.action.includes("auth.login"),
      ),
    ).toBe(true);
  });

  it("claims: pageSize honoured + status filter", async () => {
    await loginAs("payer");
    const r = await claimsGet(
      getQ("http://test/api/claims?pageSize=5&page=1&status=denied"),
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.claims.length).toBeLessThanOrEqual(5);
    expect(d.claims.every((c: { status: string }) => c.status === "denied")).toBe(
      true,
    );
  });

  it("patients: ?page returns a slice; default returns all", async () => {
    await loginAs("nurse");
    const all = await (await patientsGet(getQ("http://test/api/patients"))).json();
    const p1 = await (
      await patientsGet(getQ("http://test/api/patients?page=1&pageSize=5"))
    ).json();
    expect(p1.snaps).toHaveLength(5);
    expect(p1.total).toBe(all.snaps.length);
    expect(all.snaps.length).toBeGreaterThan(5);
  });
});

/* ── 0.6: lockout DoS — CAPTCHA gate + progressive Retry-After ── */
describe("0.6 lockout DoS", () => {
  it("sprayed username lock degrades to CAPTCHA gate; pair lock stays absolute", async () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";
    __setCaptchaVerifierForTests({
      name: "test",
      verify: async () => true,
    });
    try {
      // Spray a username from rotating IPs → per-username lock only.
      const name = "sprayvictim@x.io";
      for (let i = 0; i < 5; i++) await login(name, "bad", `10.7.7.${i}`);
      // Fresh IP: locked, but the server offers a CAPTCHA challenge.
      const r = await login(name, "bad", "10.7.7.99");
      expect(r.status).toBe(429);
      const body = await r.json();
      expect(body.code).toBe("captcha_required");
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      // A valid token passes the username-wide gate → real credential check.
      const r2 = await loginPost(
        post(
          { username: name, password: "bad", captchaToken: "tok" },
          "10.7.7.100",
        ),
      );
      expect(r2.status).toBe(401);
      // The tight per-username+IP lock is NEVER captcha-bypassed.
      const pairIp = "10.7.8.1";
      for (let i = 0; i < 5; i++) {
        await loginPost(
          post(
            { username: "pairlock@x.io", password: "bad", captchaToken: "tok" },
            pairIp,
          ),
        );
      }
      const r3 = await loginPost(
        post(
          { username: "pairlock@x.io", password: "bad", captchaToken: "tok" },
          pairIp,
        ),
      );
      expect(r3.status).toBe(429);
    } finally {
      process.env.TRUSTED_PROXY = old;
      __setCaptchaVerifierForTests(undefined);
    }
  });

  it("legit user completes login through a sprayed username lock", async () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";
    __setCaptchaVerifierForTests({
      name: "test",
      verify: async () => true,
    });
    try {
      for (let i = 0; i < 5; i++) {
        await login(USERS.nurse2.u, "bad", `10.6.6.${i}`);
      }
      const r = await loginPost(
        post(
          {
            username: USERS.nurse2.u,
            password: USERS.nurse2.p,
            captchaToken: "tok",
          },
          "10.6.6.99",
        ),
      );
      expect(r.status).toBe(200);
      // Successful login clears the sprayed failures.
    } finally {
      process.env.TRUSTED_PROXY = old;
      __setCaptchaVerifierForTests(undefined);
    }
  });

  it("without a verifier configured, username lock is a hard 429", async () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";
    try {
      for (let i = 0; i < 5; i++) {
        await login("noverifier@x.io", "bad", `10.5.5.${i}`);
      }
      const r = await loginPost(
        post(
          { username: "noverifier@x.io", password: "x", captchaToken: "tok" },
          "10.5.5.99",
        ),
      );
      expect(r.status).toBe(429);
      expect((await r.json()).code).toBeUndefined();
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
  });
});

/* ── 4: instance-safe rate limiting ── */
describe("4 rate limiting", () => {
  it("checkRate: fixed window — limit reached → denied + retryAfter", async () => {
    const b = "t.bucket", k = `k-${Date.now()}`;
    const r1 = await checkRate(b, k, 2, 60_000);
    const r2 = await checkRate(b, k, 2, 60_000);
    expect(r1.allowed && r2.allowed).toBe(true);
    const r3 = await checkRate(b, k, 2, 60_000);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
    // a different key is independent
    expect((await checkRate(b, k + "x", 2, 60_000)).allowed).toBe(true);
  });

  // 4 full reassess calls (~2s each on the PGlite dev server) exceed the
  // default 5s vitest timeout — explicit budget, assertions unchanged.
  it("reassess is rate-limited: beyond the limit → 429 + Retry-After", async () => {
    const old = process.env.RL_REASSESS;
    process.env.RL_REASSESS = "3"; // shrink the window's cap for the test
    try {
      await loginAs("charge");
      const ctxP = ctx({ id: "P-1042" });
      // Prime U-003's bucket to the cap directly — real reassess calls take
      // seconds on PGlite, so counting full requests across a 60s window
      // straddles the window boundary and flakes.
      for (let i = 0; i < 3; i++) {
        await checkRate("reassess", "U-003:P-1042", 3, 60_000);
      }
      const blocked = await reassessPost(post({}), ctxP);
      expect(blocked.status).toBe(429);
      expect((await blocked.json()).code).toBe("rate_limited");
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
      // a different user has an independent bucket
      await loginAs("nurse");
      expect((await reassessPost(post({}), ctxP)).status).toBe(200);
    } finally {
      process.env.RL_REASSESS = old;
    }
  }, 30_000);
});

/* ── 7: PDPL/NCA controls — consent, audit export, access review, purge ── */

describe("7: compliance controls", () => {
  it("POST /api/consent records consentAt once and audits it", async () => {
    await loginAs("nurse");
    const r1 = await consentPost(post({}));
    expect(r1.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: "U-002" } });
    expect(u?.consentAt).toBeTruthy();
    const row = await prisma.auditLog.findFirst({
      where: { userId: "U-002", action: "user.consent" },
    });
    expect(row).toBeTruthy();
    // second call is idempotent — no duplicate audit row
    await consentPost(post({}));
    expect(
      await prisma.auditLog.count({
        where: { userId: "U-002", action: "user.consent" },
      }),
    ).toBe(1);
  });

  it("GET /api/audit/export returns CSV for admin, 403 otherwise, and is itself audited", async () => {
    await loginAs("nurse");
    expect((await auditExportGet(new Request("http://test/api"))).status).toBe(403);

    await loginAs("admin");
    const res = await auditExportGet(
      new Request("http://test/api?format=csv&userId=U-002"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv.split("\n")[0]).toContain("createdAt,userId,action");
    expect(csv).toContain("user.consent");
    const json = await auditExportGet(
      new Request("http://test/api?format=json"),
    );
    const body = await json.json();
    expect(Array.isArray(body.rows)).toBe(true);
    const auditRow = await prisma.auditLog.findFirst({
      where: { userId: "U-008", action: "audit.export" },
    });
    expect(auditRow).toBeTruthy();
  });

  it("GET /api/admin/access-review lists accounts with dormant flag; non-admin 403", async () => {
    await loginAs("nurse");
    expect(
      (await accessReviewGet(new Request("http://test/api"))).status,
    ).toBe(403);

    await loginAs("admin");
    const res = await accessReviewGet(
      new Request("http://test/api?format=json"),
    );
    const body = await res.json();
    expect(body.accounts.length).toBeGreaterThanOrEqual(10);
    const admin = body.accounts.find((a: { username: string }) => a.username === "o.khalil");
    expect(admin.role).toBe("admin");
    expect(admin.permissions).toContain("audit_view");
    expect(
      await prisma.auditLog.count({
        where: { userId: "U-008", action: "admin.access_review" },
      }),
    ).toBe(1);
  });

  it("purgeExpired removes rows past retention and audits the run", async () => {
    const old = new Date(Date.now() - 800 * 86_400_000);
    await prisma.loginAttempt.create({
      data: { username: "purge-test", ip: "1.1.1.1", success: false, createdAt: old },
    });
    await prisma.auditLog.create({
      data: {
        userId: "purge-test", action: "x", entityType: "x", entityId: "x",
        createdAt: old,
      },
    });
    const result = await purgeExpired();
    expect(result.loginAttempt).toBeGreaterThanOrEqual(1);
    expect(result.auditLog).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.loginAttempt.count({ where: { username: "purge-test" } }),
    ).toBe(0);
    const purgeAudit = await prisma.auditLog.findFirst({
      where: { action: "system.purge" },
    });
    expect(purgeAudit).toBeTruthy();
  });
});

/* ── 8: observability — health/ready/metrics + instrumentation ── */

describe("8: observability", () => {
  it("GET /api/health is unauthenticated and returns ok", async () => {
    cookieStore.clear();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://test/api/health"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("GET /api/ready reports db up + migrations applied on test.db", async () => {
    cookieStore.clear();
    const { GET } = await import("@/app/api/ready/route");
    const res = await GET(new Request("http://test/api/ready"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.db).toBe("up");
    expect(body.migrations).toBe("applied");
  });

  it("handle() stamps x-request-id, records metrics, and metrics route is admin-gated", async () => {
    const { __resetMetricsForTests, metricsText } = await import(
      "@/lib/server/metrics"
    );
    __resetMetricsForTests();
    await loginAs("admin");
    await consentPost(post({})); // any wrapped handler call
    const text = metricsText();
    expect(text).toContain("careshift_http_requests_total");
    expect(text).toContain("/api"); // route label present
    // nurse lacks audit_view → metrics 403
    await loginAs("nurse");
    const { GET } = await import("@/app/api/metrics/route");
    expect((await GET(new Request("http://test/api/metrics"))).status).toBe(403);
    await loginAs("admin");
    const res = await GET(new Request("http://test/api/metrics"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("careshift_http_requests_total");
  });

  it("logger redacts secrets and PHI-ish fields", async () => {
    const { createLogger } = await import("@/lib/server/log");
    const { Writable } = await import("node:stream");
    const chunks: string[] = [];
    const sink = new Writable({
      write: (c, _e, cb) => (chunks.push(String(c)), cb()),
    });
    const testLogger = createLogger(sink);
    testLogger.info(
      { password: "hunter2", nested: { token: "abc" }, route: "/x" },
      "t",
    );
    const line = chunks.join("");
    expect(line).toContain("[redacted]");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain('"abc"');
    expect(line).toContain("/x");
  });
});

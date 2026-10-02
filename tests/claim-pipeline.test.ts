/**
 * E7 — automatic claims pipeline. Real handlers + lib functions against
 * the dedicated "test" schema (migrated + re-seeded per run).
 *
 * Covers: draft → assemble → check → auto-submit, exceptions routed to
 * the owning role, fix → resubmit, auto-appeal on covered denials,
 * uncovered denials parked for humans, and the payer's
 * request-evidence action including cross-payer 403.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

import { GET as claimsGet } from "@/app/api/claims/route";
import { POST as requestEvidencePost } from "@/app/api/claims/[id]/request-evidence/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { processClaim, autoAppeal } from "@/lib/server/claim-pipeline";

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const USERS = {
  nurse: { u: "s.ahmed", p: "Demo@2088" }, // U-002
  hosp: { u: "f.shammari", p: "Demo@6613" }, // U-006 hospital_admin
  payer: { u: "m.alotaibi", p: "Demo@5542" }, // U-005 payer-sim-a
  payerB: { u: "t.saleh", p: "Demo@1212" }, // U-011 payer-sim-b
};

async function loginAs(who: keyof typeof USERS) {
  cookieStore.clear();
  const r = await loginPost(
    post({ username: USERS[who].u, password: USERS[who].p }),
  );
  expect(r.status).toBe(200);
}

beforeAll(async () => {
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
}, 120_000);

beforeEach(() => cookieStore.clear());

let seq = 0;
/** Fresh patient + claim fixture per test — pipeline mutates state. */
async function fixture(opts: {
  docEvent?: boolean;
  orderEvent?: boolean;
  claimStatus?: string;
  nphiesCode?: string | null;
  amount?: number;
}) {
  const pid = `P-T7-${++seq}`;
  const cid = `CL-T7-${seq}`;
  await prisma.patient.create({
    data: {
      id: pid, nameEn: "Pipeline Test", nameAr: "اختبار الأنبوب",
      age: 55, sex: "M", room: "T-1", dxKey: "sepsis",
      attending: "Dr Test", admittedAt: "08:00", shift: "day",
      vitalsJson: "[]", labsJson: "[]", riskFlagsJson: "[]",
      medsJson: "[]", noteEn: "Simulated", noteAr: "افتراضي",
    },
  });
  // Events first so none are "recorded after claim update".
  const t0 = new Date();
  await appendEvent({
    patientId: pid, type: "vital_set", occurredAt: t0,
    actorRole: "nurse",
    payload: { hr: 110, sbp: 100, simulated: "Simulated" },
  });
  await appendEvent({
    patientId: pid, type: "lab_result", occurredAt: t0,
    actorRole: "system", payload: { key: "lactate", value: "3.1" },
  });
  if (opts.orderEvent !== false) {
    await appendEvent({
      patientId: pid, type: "order", occurredAt: t0,
      actorRole: "doctor", payload: { order: "sepsis bundle" },
    });
  }
  if (opts.docEvent) {
    await appendEvent({
      patientId: pid, type: "documentation_entry", occurredAt: t0,
      actorRole: "doctor", payload: { kind: "diagnosis", text: "sepsis" },
    });
  }
  const claim = await prisma.insuranceClaim.create({
    data: {
      id: cid, patientId: pid, amountSar: opts.amount ?? 9000,
      status: opts.claimStatus ?? "draft", dxKey: "sepsis",
      losDays: 2, icuDays: 0, evidenceJson: "[]", frictionJson: "[]",
      payerOrg: "payer-sim-a",
      nphiesCode: opts.nphiesCode ?? null,
    },
  });
  return { pid, claim };
}

describe("E7 automatic claims pipeline", () => {
  it("a clean draft claim is assembled, checked, and auto-submitted", { timeout: 30_000 }, async () => {
    const { pid, claim } = await fixture({ docEvent: true });
    const out = await processClaim(claim.id);
    expect(out).toBe("submitted");
    const after = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
      include: { lines: true },
    });
    expect(after?.status).toBe("pending");
    expect(after?.autoSubmitted).toBe(true);
    expect(after?.submittedAt).toBeTruthy();
    expect(after?.lines.length).toBeGreaterThan(0);
    const ev = await prisma.clinicalEvent.findFirst({
      where: { patientId: pid, type: "claim_submitted" },
    });
    expect(ev).toBeTruthy();
    const hist = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, action: "auto_submitted" },
    });
    expect(hist).toBeTruthy();
  });

  it("missing doctor diagnosis doc → exception routed to doctor", { timeout: 30_000 }, async () => {
    const { claim } = await fixture({ docEvent: false });
    const out = await processClaim(claim.id);
    expect(out).toBe("exception");
    const after = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(after?.status).toBe("exception");
    const items = JSON.parse(after!.exceptionJson!) as {
      kind: string; owner: string; seCode?: string;
    }[];
    expect(items.some((i) => i.owner === "doctor")).toBe(true);
    const notif = await prisma.notification.findFirst({
      where: { key: "notif.claimException", entityId: claim.id },
    });
    expect(notif).toBeTruthy();
  });

  it("fixing the gap lets the pipeline resubmit on the next sweep", { timeout: 30_000 }, async () => {
    const { pid, claim } = await fixture({ docEvent: false });
    await processClaim(claim.id);
    // The doctor documents the diagnosis → event store now covers it.
    await appendEvent({
      patientId: pid, type: "documentation_entry",
      occurredAt: new Date(),
      actorRole: "doctor", payload: { kind: "diagnosis", text: "sepsis" },
    });
    const out = await processClaim(claim.id);
    expect(out).toBe("submitted");
    const after = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(after?.status).toBe("pending");
    expect(after?.exceptionJson).toBeNull();
  });

  it("covered denial auto-appeals into a new submitted version", { timeout: 30_000 }, async () => {
    const { claim } = await fixture({
      docEvent: true, claimStatus: "denied", nphiesCode: "SE-1-8",
    });
    const out = await autoAppeal(claim.id);
    expect(out).toBe("resubmitted");
    const v2 = await prisma.insuranceClaim.findFirst({
      where: { supersedesId: claim.id },
    });
    expect(v2).toBeTruthy();
    expect(v2!.version).toBe(2);
    expect(v2!.status).toBe("pending");
    expect(v2!.autoSubmitted).toBe(true);
    const hist = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, action: "auto_appeal" },
    });
    expect(hist).toBeTruthy();
  });

  it("uncovered denial parks in exception for hospital_admin", { timeout: 30_000 }, async () => {
    const { claim } = await fixture({
      claimStatus: "denied", nphiesCode: "MN-1-1", // needs deterioration events
    });
    const out = await autoAppeal(claim.id);
    expect(out).toBe("exception");
    const after = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(after?.status).toBe("exception");
    const items = JSON.parse(after!.exceptionJson!) as { owner: string }[];
    expect(items[0]?.owner).toBe("hospital_admin");
  });

  it("payer requests evidence; nurse and foreign payer are 403", { timeout: 30_000 }, async () => {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { status: "pending", payerOrg: "payer-sim-a" },
    });
    expect(claim).toBeTruthy();

    await loginAs("nurse");
    const denied = await requestEvidencePost(
      post({ detail: "need lab trace" }), ctx(claim!.id),
    );
    expect(denied.status).toBe(403);

    await loginAs("payerB");
    const foreign = await requestEvidencePost(
      post({ detail: "need lab trace" }), ctx(claim!.id),
    );
    expect(foreign.status).toBe(403);

    await loginAs("payer");
    const r = await requestEvidencePost(
      post({ detail: "please attach lactate orders" }), ctx(claim!.id),
    );
    expect(r.status).toBe(200);
    const ev = await prisma.claimEvent.findFirst({
      where: { claimId: claim!.id, action: "evidence_requested" },
    });
    expect(ev).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "claim.request_evidence", entityId: claim!.id },
    });
    expect(audit).toBeTruthy();
  });

  it("claims GET sweeps drafts and returns pipeline KPIs", { timeout: 30_000 }, async () => {
    const { claim } = await fixture({ docEvent: true });
    await loginAs("hosp");
    const r = await claimsGet(new Request("http://test/api/claims"));
    expect(r.status).toBe(200);
    const j = await r.json();
    const after = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(after?.status).toBe("pending");
    expect(j.pipeline).toBeTruthy();
    expect(j.pipeline.autoRate).toBeGreaterThan(0);
    expect(typeof j.pipeline.exceptionCount).toBe("number");
  });
});

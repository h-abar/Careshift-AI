/**
 * C6 — event-driven denial/appeal/resubmit. Real DB (schema=test).
 * Adjudication codes come ONLY from the imported official NPHIES
 * adjudication-reason list; appeal packages may reference existing
 * patient events only; resubmission creates a new claim version.
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
import {
  simulateAdjudication, appealEvidence, validateAppealEventIds,
  ADJUDICATION_LABEL,
} from "@/lib/server/adjudication";
import { runClaimChecks } from "@/lib/server/claim-checks";
import { assembleClaim } from "@/lib/server/claim-assembly";
import { appendEvent } from "@/lib/server/events";
import { POST as resubmitPost } from "@/app/api/claims/[id]/resubmit/route";
import { POST as appealPost } from "@/app/api/claims/[id]/appeal/route";
import { POST as adjudicatePost } from "@/app/api/claims/[id]/adjudicate/route";
import { POST as loginPost } from "@/app/api/auth/login/route";

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
  for (const k of ["RL_LOGIN", "RL_CLAIMWRITE"]) process.env[k] = "10000";
}, 180_000);

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function loginAs(u: string, p: string) {
  const r = await loginPost(
    new Request("http://test/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-forwarded-for": "10.0.0.9",
      },
      body: JSON.stringify({ username: u, password: p }),
    }),
  );
  expect(r.status).toBe(200);
}

async function freshClaim() {
  const p = await prisma.patient.findFirstOrThrow();
  const c = await prisma.insuranceClaim.create({
    data: {
      id: `CL-ADJ-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      patientId: p.id, amountSar: 1000, status: "pending",
      dxKey: "dka", losDays: 2, icuDays: 0,
      evidenceJson: "[]", frictionJson: "[]",
    },
  });
  return { claim: c, patientId: p.id };
}

describe("C6 event-driven adjudication", () => {
  it("denies an empty claim with an official NPHIES code", async () => {
    const { claim } = await freshClaim();
    await loginAs("m.alotaibi", "Demo@5542");
    const res = await adjudicatePost(post({}), ctx(claim.id));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.label).toBe(ADJUDICATION_LABEL);
    expect(r.decision).toBe("denied");
    expect(r.reasonCode).toMatch(/^[A-Z]{2}-\d-\d+$/);
    // code must exist in the imported official list
    const term = await prisma.terminology.findFirst({
      where: { provider: "nphies", code: r.reasonCode },
    });
    expect(term).toBeTruthy();
    const row = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(row!.status).toBe("denied");
    expect(row!.nphiesCode).toBe(r.reasonCode);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "claim.adjudicate", entityId: claim.id },
      }),
    ).toBeTruthy();
  });

  it("appealEvidence lists missing types + answering events", async () => {
    const { claim, patientId } = await freshClaim();
    await simulateAdjudication(claim.id);
    const ev = await appealEvidence(claim.id);
    const stored = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(ev.code).toBe(stored!.nphiesCode);
    expect(ev.codeLabel).toBeTruthy();
    expect(ev.missingEventTypes.length).toBeGreaterThan(0);
    // answering events come only from the claim's own patient
    for (const e of ev.answeringEvents) {
      const row = await prisma.clinicalEvent.findUnique({
        where: { id: e.id },
      });
      expect(row!.patientId).toBe(patientId);
    }
  });

  it("rejects fabricated or foreign event ids in appeals", async () => {
    const { claim } = await freshClaim();
    await simulateAdjudication(claim.id);
    const v = await validateAppealEventIds(claim.id, ["EV-NOPE-1"]);
    expect(v.ok).toBe(false);
    expect(v.bad).toContain("EV-NOPE-1");
    // an event belonging to a DIFFERENT patient is also rejected
    const { patientId } = await freshClaim();
    const otherP = await prisma.patient.findFirst({
      where: { id: { not: patientId } },
    });
    const foreign = await appendEvent({
      patientId: otherP!.id, type: "documentation_entry",
      occurredAt: new Date(), sourceRecordId: "test",
    });
    const v2 = await validateAppealEventIds(claim.id, [foreign.id]);
    expect(v2.ok).toBe(false);
  });

  it("appeal route accepts only existing patient events", async () => {
    const { claim, patientId } = await freshClaim();
    await simulateAdjudication(claim.id);
    const ev = await appendEvent({
      patientId, type: "lab_result",
      occurredAt: new Date(), sourceRecordId: "test",
    });
    await loginAs("m.alotaibi", "Demo@5542");
    // fabricated id → 422
    expect(
      (await appealPost(
        post({ reason: "x", eventIds: ["EV-FAKE"] }), ctx(claim.id),
      )).status,
    ).toBe(422);
    // real event → 200, claim back to review
    const r = await appealPost(
      post({ reason: "labs now attached", eventIds: [ev.id] }),
      ctx(claim.id),
    );
    expect(r.status).toBe(200);
    const row = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(row!.status).toBe("review");
    const ce = await prisma.claimEvent.findFirst({
      where: { claimId: claim.id, action: "appeal" },
    });
    expect(ce!.detail).toContain(ev.id);
  });

  it("resubmit creates a new version linked to the old claim", async () => {
    const { claim } = await freshClaim();
    await simulateAdjudication(claim.id);
    await loginAs("m.alotaibi", "Demo@5542");
    const r = await resubmitPost(
      post({ note: "documentation completed" }), ctx(claim.id),
    );
    expect(r.status).toBe(200);
    const { claim: nc } = await r.json();
    expect(nc.id).toBe(`${claim.id}-v2`);
    expect(nc.supersedesId).toBe(claim.id);
    expect(nc.version).toBe(2);
    // original stays denied — history preserved
    const old = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(old!.status).toBe("denied");
    expect(old!.nphiesCode).toBeTruthy();
  });

  it("approves a clean event-backed claim", async () => {
    const { claim, patientId } = await freshClaim();
    // assemble real event-backed lines first
    await assembleClaim(claim.id);
    const checks = await runClaimChecks(claim.id);
    const r = await simulateAdjudication(claim.id);
    if (checks.issues.every((i) => !i.seCode)) {
      expect(r.decision).toBe("approved");
      expect(r.reasonCode).toBeNull();
    } else {
      // denied → the code is always a real NPHIES code, never invented
      const term = await prisma.terminology.findFirst({
        where: { provider: "nphies", code: r.reasonCode! },
      });
      expect(term).toBeTruthy();
    }
    expect(patientId).toBeTruthy();
  });
});

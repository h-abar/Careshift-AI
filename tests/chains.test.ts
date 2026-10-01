/**
 * C9 — handoff/deterioration/priority as EVENTS + closed-loop chain.
 * Real routes write live ClinicalEvents; the chain detects breaks.
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
import { closedLoopChain, safetyKpis } from "@/lib/server/chains";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as handoffCreatePost } from "@/app/api/handoffs/create/route";
import { PATCH as handoffPatch } from "@/app/api/handoffs/[id]/route";
import { POST as signoffPost } from "@/app/api/handoffs/[id]/signoff/route";
import { POST as acceptPost } from "@/app/api/handoffs/[id]/accept/route";
import { POST as interventionPost } from "@/app/api/interventions/[stepId]/route";
import { POST as reassessPost } from "@/app/api/patients/[id]/reassess/route";

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (body: unknown) =>
  new Request("http://test/api", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});
const U = {
  charge: { u: "k.mohammed", p: "Demo@3310" },
  nurse: { u: "s.ahmed", p: "Demo@2088" },
};

async function loginAs(who: keyof typeof U) {
  cookieStore.clear();
  const r = await loginPost(
    new Request("http://test/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-forwarded-for": "10.0.0.9",
      },
      body: JSON.stringify({ username: U[who].u, password: U[who].p }),
    }),
  );
  expect(r.status).toBe(200);
}

const evs = (patientId: string, type?: string, since = new Date(0)) =>
  prisma.clinicalEvent.findMany({
    where: {
      patientId, recordedAt: { gt: since },
      ...(type ? { type } : {}),
    },
  });

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
  for (const k of ["RL_LOGIN", "RL_CLAIMWRITE", "RL_REASSESS"])
    process.env[k] = "10000";
}, 180_000);

describe("C9 live safety events", () => {
  it("handoff create→signoff→accept emits handoff_* events + carry-over", async () => {
    const since = new Date();
    await loginAs("charge");
    const c = await handoffCreatePost(post({
      dept: "icu", shift: "night",
      outgoingId: "U-003", incomingId: "U-002",
      patientIds: ["P-1042"],
    }));
    expect(c.status).toBe(200);
    const { handoff } = await c.json();
    expect(
      (await evs("P-1042", "handoff_started", since)).length,
    ).toBeGreaterThanOrEqual(1);

    // review only 2 of 4 checklist items → sign-off still passes review?
    // sign-off REQUIRES full checklist; provide all, then accept with a
    // reduced checklist so two items carry over to the receiver.
    await handoffPatch(patch({
      reviewed: { "P-1042": true },
      checklist: [
        "criticalReviewed", "pendingReviewed",
        "escalationsReviewed", "recommendationsReviewed",
      ],
    }), ctx({ id: handoff.id }));
    expect((await signoffPost(post({}), ctx({ id: handoff.id }))).status).toBe(200);
    expect(
      (await evs("P-1042", "handoff_signed", since)).length,
    ).toBeGreaterThanOrEqual(1);

    await loginAs("nurse");
    const acc = await acceptPost(
      post({ checklist: ["criticalReviewed", "pendingReviewed"] }),
      ctx({ id: handoff.id }),
    );
    expect(acc.status).toBe(200);
    expect(
      (await evs("P-1042", "handoff_accepted", since)).length,
    ).toBeGreaterThanOrEqual(1);
    // two unchecked items carried over to the receiver (U-002)
    const carried = await evs("P-1042", "action_item_created", since);
    expect(carried.length).toBe(2);
    for (const e of carried) {
      const p = JSON.parse(e.payloadJson);
      expect(p.ownerUserId).toBe("U-002");
      expect(["escalationsReviewed", "recommendationsReviewed"])
        .toContain(p.item);
    }
  });

  it("intervention lifecycle emits intervention_* events", async () => {
    const since = new Date();
    // pick a real plan step for P-1042
    const { dbPatient } = await import("@/lib/server/data");
    const { assessClinicalRisk } = await import("@/lib/engines/clinical-risk");
    const { buildInterventionPlan } = await import("@/lib/engines/interventions");
    const p = await dbPatient("P-1042");
    const plan = buildInterventionPlan(p!, assessClinicalRisk(p!));
    const pending = plan.find((s) => s.status === "pending") ?? plan[0];
    const stepId = pending.id;
    await prisma.interventionOverride.deleteMany({ where: { stepId } });
    await loginAs("nurse");
    expect(
      (await interventionPost(
        post({ patientId: "P-1042", status: "in_progress" }),
        ctx({ stepId }),
      )).status,
    ).toBe(200);
    expect(
      (await interventionPost(
        post({ patientId: "P-1042", status: "done" }),
        ctx({ stepId }),
      )).status,
    ).toBe(200);
    expect(
      (await evs("P-1042", "intervention_started", since)).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (await evs("P-1042", "intervention_completed", since)).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("reassess emits score + priority snapshot (validated indicators only)", async () => {
    const since = new Date();
    await loginAs("nurse");
    const r = await reassessPost(post({}), ctx({ id: "P-1042" }));
    expect(r.status).toBe(200);
    const scores = await evs("P-1042", "score_computed", since);
    expect(scores.length).toBeGreaterThanOrEqual(1);
    const snaps = await evs("P-1042", "priority_snapshot", since);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    const p = JSON.parse(snaps[0].payloadJson);
    // only validated indicators — never nurse concern / overdue tasks
    expect(p).toHaveProperty("news2");
    expect(p).toHaveProperty("tier");
    expect(p).toHaveProperty("sortKey");
    expect(p).toHaveProperty("rank");
    expect(p).not.toHaveProperty("nurseConcern");
    expect(p).not.toHaveProperty("overdueTasks");
    expect(p.rank).toBeGreaterThanOrEqual(1);
  });

  it("closedLoopChain returns ordered steps with gaps", async () => {
    const c = await closedLoopChain("P-1042");
    const order = [
      "risk", "alert", "acknowledged", "intervention",
      "completed", "documented", "claim",
    ];
    expect(c.steps.map((s) => s.step)).toEqual(order);
    for (const s of c.steps) {
      expect(["ok", "gap", "na"]).toContain(s.status);
    }
    // P-1042 seed has vitals+scores backfilled → risk step fires
    expect(c.steps[0].status).toBe("ok");
  });

  it("safetyKpis are registry-derived numbers", async () => {
    const k = await safetyKpis();
    expect(k.openActionItems).toBeGreaterThanOrEqual(0);
    const started = await prisma.clinicalEvent.count({
      where: { type: "handoff_started" },
    });
    const accepted = await prisma.clinicalEvent.count({
      where: { type: "handoff_accepted" },
    });
    expect(k.handoffAcceptedPct).toBe(
      started ? Math.round((accepted / started) * 100) : null,
    );
  });
});

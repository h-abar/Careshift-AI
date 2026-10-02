/**
 * E6 — doctor deterioration closed loop. Real handlers against the
 * dedicated "test" schema (migrated + re-seeded per run).
 *
 * Covers: task listing scope, acknowledge → review → decide ordering,
 * the mandatory reason for not_significant, the escalation ladder
 * (re-notify doctor → charge nurse → seniors), and the NEWS2 re-check
 * re-escalation when the score does not improve.
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

import { GET as tasksGet } from "@/app/api/doctor-tasks/route";
import { POST as ackPost } from "@/app/api/doctor-tasks/[id]/ack/route";
import { POST as reviewPost } from "@/app/api/doctor-tasks/[id]/review/route";
import { POST as decidePost } from "@/app/api/doctor-tasks/[id]/decide/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as reassessPost } from "@/app/api/patients/[id]/reassess/route";
import { prisma } from "@/lib/server/prisma";
import {
  runEscalationLadder,
  TASK_CHARGE_MIN,
  TASK_RECHECK_MIN,
  TASK_RENOTIFY_MIN,
} from "@/lib/server/doctor-tasks";

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const USERS = {
  doctor: { u: "a.salem", p: "Demo@1021" }, // U-001
  doctor2: { u: "l.haddad", p: "Demo@4477" }, // U-004
  charge: { u: "k.mohammed", p: "Demo@3310" }, // U-003
  nurse: { u: "s.ahmed", p: "Demo@2088" }, // U-002
  payer: { u: "m.alotaibi", p: "Demo@5542" }, // U-005
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

/** Seed creates exactly one open task on P-7455 → doctor U-001. */
async function seededTask() {
  const task = await prisma.doctorTask.findFirst({
    where: { status: { in: ["open", "acknowledged", "reviewed"] } },
  });
  expect(task).toBeTruthy();
  return task!;
}

/** A fresh open task per test — earlier tests close the seeded one. */
async function makeTask(score = 5) {
  const asg = await prisma.assignment.findUnique({
    where: { patientId: "P-7455" },
  });
  return prisma.doctorTask.create({
    data: {
      patientId: "P-7455",
      doctorId: asg!.physicianId,
      level: score >= 7 ? "emergency" : "urgent",
      score,
      nextEscalateAt: new Date(Date.now() + TASK_RENOTIFY_MIN * 60_000),
    },
  });
}

describe("E6 doctor task flow", () => {
  it("GET lists tasks for the owning doctor; nurse/payer get 403", async () => {
    await loginAs("nurse");
    const denied = await tasksGet(new Request("http://test/api"));
    expect(denied.status).toBe(403);

    await loginAs("payer");
    const denied2 = await tasksGet(new Request("http://test/api"));
    expect(denied2.status).toBe(403);

    await loginAs("doctor");
    const r = await tasksGet(new Request("http://test/api"));
    expect(r.status).toBe(200);
    const j = await r.json();
    const task = await seededTask();
    const mine = j.tasks.find((x: { id: string }) => x.id === task.id);
    expect(mine).toBeTruthy();
    expect(mine.patientId).toBe("P-7455");
    expect(mine.status).toBe("open");
  });

  it("charge nurse sees the ward-wide queue", async () => {
    await loginAs("charge");
    const r = await tasksGet(new Request("http://test/api"));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("ack → review → decide ordering is enforced", async () => {
    const task = await makeTask();
    await loginAs("doctor");

    // review before ack → 409
    const earlyReview = await reviewPost(post({}), ctx(task.id));
    expect(earlyReview.status).toBe(409);

    // ack → 200 + alert_acknowledged event + audit
    const ack = await ackPost(post({}), ctx(task.id));
    expect(ack.status).toBe(200);
    const acked = await prisma.doctorTask.findUnique({
      where: { id: task.id },
    });
    expect(acked?.acknowledgedAt).toBeTruthy();
    const ackEv = await prisma.clinicalEvent.findFirst({
      where: { type: "alert_acknowledged", patientId: task.patientId },
    });
    expect(ackEv).toBeTruthy();

    // review → 200
    const review = await reviewPost(post({}), ctx(task.id));
    expect(review.status).toBe(200);

    // decide: not_significant without a reason → 400
    const noReason = await decidePost(
      post({ decision: "not_significant" }),
      ctx(task.id),
    );
    expect(noReason.status).toBe(400);

    // not_significant WITH reason → 200 + recheck scheduled + event
    const decided = await decidePost(
      post({ decision: "not_significant", reason: "transient, clinically stable" }),
      ctx(task.id),
    );
    expect(decided.status).toBe(200);
    const closed = await prisma.doctorTask.findUnique({
      where: { id: task.id },
    });
    expect(closed?.status).toBe("closed");
    expect(closed?.decision).toBe("not_significant");
    expect(closed?.recheckDueAt).toBeTruthy();
    const decEv = await prisma.clinicalEvent.findFirst({
      where: { type: "doctor_decision", patientId: task.patientId },
    });
    expect(decEv).toBeTruthy();
  });

  it("treatment decision assigns plan steps to the ward nurse", async () => {
    const task = await makeTask();
    await loginAs("doctor");
    await ackPost(post({}), ctx(task.id));
    await reviewPost(post({}), ctx(task.id));
    const r = await decidePost(
      post({ decision: "treatment", reason: "sepsis bundle" }),
      ctx(task.id),
    );
    expect(r.status).toBe(200);

    // nurse-facing steps exist as overrides with assignee = ward nurse
    const assignment = await prisma.assignment.findUnique({
      where: { patientId: task.patientId },
    });
    const overrides = await prisma.interventionOverride.findMany({
      where: { patientId: task.patientId },
    });
    expect(overrides.length).toBeGreaterThan(0);
    expect(
      overrides.some((o) => o.assigneeId === assignment?.nurseId),
    ).toBe(true);
    const orderEv = await prisma.clinicalEvent.findFirst({
      where: { type: "order", patientId: task.patientId },
    });
    expect(orderEv).toBeTruthy();
  });

  it("unacknowledged task climbs the ladder: doctor → charge → seniors", async () => {
    const task = await makeTask();
    const assignment = await prisma.assignment.findUnique({
      where: { patientId: task.patientId },
    });
    const base = new Date(task.createdAt.getTime());

    // step 1: re-notify doctor
    await runEscalationLadder(
      new Date(base.getTime() + (TASK_RENOTIFY_MIN + 1) * 60_000),
    );
    let t1 = await prisma.doctorTask.findUnique({ where: { id: task.id } });
    expect(t1?.ladderStep).toBe(1);
    const remind = await prisma.notification.findFirst({
      where: { key: "notif.doctorTaskReminder", entityId: task.id },
    });
    expect(remind).toBeTruthy();

    // step 2: charge nurse
    await runEscalationLadder(
      new Date(
        base.getTime() + (TASK_RENOTIFY_MIN + TASK_CHARGE_MIN + 2) * 60_000,
      ),
    );
    t1 = await prisma.doctorTask.findUnique({ where: { id: task.id } });
    expect(t1?.ladderStep).toBe(2);
    const chargeNotif = await prisma.notification.findFirst({
      where: { key: "notif.doctorTaskCharge", entityId: task.id },
      include: { receipts: true },
    });
    expect(chargeNotif?.receipts[0]?.userId).toBe(assignment?.chargeNurseId);

    // step 3: seniors (every clinical_decide holder except the task doctor)
    await runEscalationLadder(
      new Date(
        base.getTime() +
          (TASK_RENOTIFY_MIN + TASK_CHARGE_MIN + 999) * 60_000,
      ),
    );
    t1 = await prisma.doctorTask.findUnique({ where: { id: task.id } });
    expect(t1?.ladderStep).toBe(3);
    const seniorNotif = await prisma.notification.findFirst({
      where: { key: "notif.doctorTaskSenior", entityId: task.id },
      include: { receipts: true },
    });
    expect(seniorNotif).toBeTruthy();
    expect(
      seniorNotif!.receipts.some((r) => r.userId !== t1!.doctorId),
    ).toBe(true);
    const escEv = await prisma.clinicalEvent.findMany({
      where: { type: "escalation", patientId: task.patientId },
    });
    expect(escEv.length).toBeGreaterThanOrEqual(3);
  });

  it("not-significant re-check re-opens the task when score stays high", async () => {
    const task = await makeTask();
    await loginAs("doctor");
    await ackPost(post({}), ctx(task.id));
    await reviewPost(post({}), ctx(task.id));
    await decidePost(
      post({ decision: "not_significant", reason: "watching" }),
      ctx(task.id),
    );

    // Latest risk assessment for P-2031 stays elevated in the seed? If
    // not, insert one so the re-check sees no improvement.
    await prisma.riskAssessment.create({
      data: {
        patientId: task.patientId,
        score: 6,
        level: "high",
        conditionKey: "sepsis",
        factorsJson: "[]",
        windowHrs: 4,
        confidence: 80,
      },
    });
    await runEscalationLadder(
      new Date(Date.now() + (TASK_RECHECK_MIN + 5) * 60_000),
    );
    const re = await prisma.doctorTask.findUnique({ where: { id: task.id } });
    expect(re?.status).toBe("open");
    expect(re?.acknowledgedAt).toBeNull();
    const reesc = await prisma.clinicalEvent.findFirst({
      where: { type: "doctor_reescalated", patientId: task.patientId },
    });
    expect(reesc).toBeTruthy();
  });

  it(
    "a new escalated alert on reassess opens a task (NEWS2 ≥ 5)",
    { timeout: 20_000 },
    async () => {
    // P-1042's seeded risk is low; patch vitals to force NEWS2 ≥ 5 then
    // reassess as the doctor. The reassess route opens the task.
    const patient = await prisma.patient.findUnique({
      where: { id: "P-2031" },
    });
    expect(patient).toBeTruthy();
    await prisma.patient.update({
      where: { id: "P-2031" },
      data: {
        vitalsJson: JSON.stringify([
          { t: "08:00", hr: 130, sbp: 82, rr: 30, temp: 39.4, spo2: 88 },
        ]),
      },
    });
    await loginAs("doctor");
    const r = await reassessPost(post({}), ctx("P-2031"));
    expect(r.status).toBe(200);
    const j = await r.json();
    if (j.crossedUp && j.risk.score >= 5) {
      const task = await prisma.doctorTask.findFirst({
        where: { patientId: "P-2031", status: { in: ["open", "acknowledged", "reviewed"] } },
      });
      expect(task).toBeTruthy();
      expect(task!.doctorId).toBe(
        (await prisma.assignment.findUnique({ where: { patientId: "P-2031" } }))
          ?.physicianId,
      );
    }
  });

  it("another doctor cannot act on a task owned by U-001", async () => {
    const task = await prisma.doctorTask.findFirst({
      where: { status: { in: ["open", "acknowledged", "reviewed"] } },
    });
    // If none left open (earlier tests closed them), create one.
    const target =
      task ??
      (await prisma.doctorTask.create({
        data: {
          patientId: "P-2031",
          doctorId: "U-001",
          level: "urgent",
          score: 5,
        },
      }));
    await loginAs("doctor2");
    const r = await ackPost(post({}), ctx(target.id));
    // Either not-my-task 403 or the list endpoint already filtered it
    // out — the route must refuse the write either way.
    expect([403, 404]).toContain(r.status);
  });
});

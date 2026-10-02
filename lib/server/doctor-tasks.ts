/**
 * E6 — doctor deterioration closed loop.
 *
 * Every escalated alert opens a DoctorTask that stays open until the
 * assigned doctor records acknowledge → bedside review → decision.
 * The escalation ladder (prototype timings, env-overridable):
 *   open past RENOTIFY  → re-notify the doctor
 *   still open          → notify the charge nurse
 *   still open          → notify every clinical_decide holder (senior/on-call)
 * Decisions "monitor" / "not_significant" schedule a NEWS2 re-check; if
 * the score has not improved by then, the task re-opens to the doctor.
 *
 * All actions are hash-chained ClinicalEvents and audited — the task row
 * is workflow state, the event store is the record.
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { notify, notifyPerm } from "@/lib/server/notify";

if (typeof window !== "undefined") {
  throw new Error("lib/server/doctor-tasks.ts is server-only");
}

/* Prototype escalation timings — minutes, env-overridable. */
export const TASK_RENOTIFY_MIN = Number(process.env.TASK_RENOTIFY_MIN ?? 5);
export const TASK_CHARGE_MIN = Number(process.env.TASK_CHARGE_MIN ?? 10);
export const TASK_SENIOR_MIN = Number(process.env.TASK_SENIOR_MIN ?? 15);
export const TASK_RECHECK_MIN = Number(process.env.TASK_RECHECK_MIN ?? 30);

const MINUTES = 60_000;
const OPEN_STATUSES = ["open", "acknowledged", "reviewed"];

/** Open a doctor task for an escalated alert. Idempotent per open task. */
export async function openDoctorTask(
  patientId: string,
  score: number,
  maxSingle = 0,
): Promise<string | null> {
  if (score < 5 && maxSingle < 3) return null;
  const assignment = await prisma.assignment.findUnique({
    where: { patientId },
  });
  if (!assignment) return null;
  const existing = await prisma.doctorTask.findFirst({
    where: { patientId, status: { in: OPEN_STATUSES } },
  });
  if (existing) return existing.id;
  const level = score >= 7 ? "emergency" : "urgent";
  const now = new Date();
  const task = await prisma.doctorTask.create({
    data: {
      patientId,
      doctorId: assignment.physicianId,
      level,
      score,
      nextEscalateAt: new Date(now.getTime() + TASK_RENOTIFY_MIN * MINUTES),
    },
  });
  await appendEvent({
    patientId,
    type: "doctor_task_opened",
    occurredAt: now,
    actorRole: "system",
    payload: { taskId: task.id, score, level, simulated: "Simulated" },
    sourceRecordId: `dtask:${task.id}:open`,
  });
  await notify(task.doctorId, "notif.doctorTask", "critical", {
    patientId,
    entityType: "doctor_task",
    entityId: task.id,
    detail: String(score),
  });
  return task.id;
}

/**
 * Nurse-initiated critical escalation (Nurse Concern).
 * Creates a critical DoctorTask (level: "emergency", score: >=7 or current NEWS2)
 * and writes a hash-chained ClinicalEvent "nurse_escalation".
 */
export async function openNurseEscalationTask(
  patientId: string,
  nurseId: string,
  category: string,
  reason: string,
): Promise<string> {
  const assignment = await prisma.assignment.findUnique({
    where: { patientId },
  });
  const now = new Date();
  const doctorId = assignment?.physicianId ?? "a.salem";

  const task = await prisma.doctorTask.create({
    data: {
      patientId,
      doctorId,
      level: "emergency",
      score: 7,
      decisionReason: `Nurse Concern [${category}]: ${reason}`,
      nextEscalateAt: new Date(now.getTime() + TASK_RENOTIFY_MIN * MINUTES),
    },
  });

  await appendEvent({
    patientId,
    type: "nurse_escalation",
    occurredAt: now,
    actorUserId: nurseId,
    actorRole: "nurse",
    payload: {
      taskId: task.id,
      category,
      reason,
      simulated: "Simulated",
    },
    sourceRecordId: `nesc:${task.id}`,
  });

  await notify(doctorId, "notif.doctorTask", "critical", {
    patientId,
    entityType: "doctor_task",
    entityId: task.id,
    detail: `Nurse Concern: ${category}`,
  });

  return task.id;
}

/**
 * Ladder sweep — called on read paths (doctor-tasks & notifications GET)
 * and directly by tests. Advances each open task one step at a time:
 *   0→1 re-notify doctor, 1→2 charge nurse, 2→3 senior/on-call.
 * Also fires scheduled NEWS2 re-checks; a score that did not improve
 * re-opens the task to the doctor.
 */
export async function runEscalationLadder(now = new Date()): Promise<number> {
  let advanced = 0;
  const open = await prisma.doctorTask.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { patient: { select: { id: true } } },
  });

  for (const task of open) {
    // Unacknowledged tasks climb the ladder.
    if (
      !task.acknowledgedAt &&
      task.nextEscalateAt &&
      task.nextEscalateAt <= now
    ) {
      const assignment = await prisma.assignment.findUnique({
        where: { patientId: task.patientId },
      });
      const step = task.ladderStep + 1;
      await prisma.doctorTask.update({
        where: { id: task.id },
        data: {
          ladderStep: step,
          nextEscalateAt:
            step === 1
              ? new Date(now.getTime() + TASK_CHARGE_MIN * MINUTES)
              : step === 2
                ? new Date(now.getTime() + TASK_SENIOR_MIN * MINUTES)
                : null,
        },
      });
      const opts = {
        patientId: task.patientId,
        entityType: "doctor_task",
        entityId: task.id,
        detail: String(task.score),
      };
      if (step === 1) {
        await notify(task.doctorId, "notif.doctorTaskReminder", "critical", opts);
      } else if (step === 2) {
        if (assignment?.chargeNurseId)
          await notify(
            assignment.chargeNurseId,
            "notif.doctorTaskCharge",
            "critical",
            opts,
          );
      } else {
        await notifyPerm("clinical_decide", "notif.doctorTaskSenior", "critical", {
          ...opts,
          excludeUserId: task.doctorId,
        });
      }
      await appendEvent({
        patientId: task.patientId,
        type: "escalation",
        occurredAt: now,
        actorRole: "system",
        payload: {
          taskId: task.id,
          ladderStep: step,
          simulated: "Simulated",
        },
        sourceRecordId: `dtask:${task.id}:ladder:${step}`,
      });
      advanced++;
    }
  }

  // Scheduled NEWS2 re-checks on closed monitor / not_significant tasks.
  const rechecks = await prisma.doctorTask.findMany({
    where: {
      status: "closed",
      recheckDueAt: { not: null, lte: now },
      decision: { in: ["monitor", "not_significant"] },
    },
  });
  for (const task of rechecks) {
    const latest = await prisma.riskAssessment.findFirst({
      where: { patientId: task.patientId },
      orderBy: { assessedAt: "desc" },
    });
    await prisma.doctorTask.update({
      where: { id: task.id },
      data: { recheckDueAt: null },
    });
    if (latest && latest.score >= 5) {
      // Score did not improve → re-open to the doctor, ladder resets.
      await prisma.doctorTask.update({
        where: { id: task.id },
        data: {
          status: "open",
          acknowledgedAt: null,
          reviewedAt: null,
          decision: null,
          decisionReason: null,
          decidedAt: null,
          closedAt: null,
          ladderStep: 0,
          nextEscalateAt: new Date(
            now.getTime() + TASK_RENOTIFY_MIN * MINUTES,
          ),
        },
      });
      await appendEvent({
        patientId: task.patientId,
        type: "doctor_reescalated",
        occurredAt: now,
        actorRole: "system",
        payload: {
          taskId: task.id,
          score: latest.score,
          simulated: "Simulated",
        },
        sourceRecordId: `dtask:${task.id}:reesc:${now.getTime()}`,
      });
      await notify(task.doctorId, "notif.doctorReescalated", "critical", {
        patientId: task.patientId,
        entityType: "doctor_task",
        entityId: task.id,
        detail: String(latest.score),
      });
      advanced++;
    }
  }
  return advanced;
}

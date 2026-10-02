/**
 * E6 — side effects of a doctor decision. Kept out of the route so the
 * flow is testable and each branch stays small:
 *   treatment → order event + every pending plan step assigned to the
 *               ward nurse with a due time (SSC hour-1 style offsets
 *               come from the generated intervention plan)
 *   escalate  → escalation event + charge nurse notified (RRT/ICU)
 *   monitor / not_significant → handled by recheckDueAt on the task row
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { notify } from "@/lib/server/notify";
import { dbPatient, invalidateSnapshots } from "@/lib/server/data";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import type { DoctorTask } from "@prisma/client";

if (typeof window !== "undefined") {
  throw new Error("lib/server/doctor-task-actions.ts is server-only");
}

export async function doctorTasksDecide(args: {
  task: DoctorTask;
  decision: "treatment" | "escalate" | "monitor" | "not_significant";
  reason?: string;
  actor: { id: string; role: string };
  now: Date;
}) {
  const { task, decision, reason, actor, now } = args;
  const assignment = await prisma.assignment.findUnique({
    where: { patientId: task.patientId },
  });

  if (decision === "treatment") {
    const patient = await dbPatient(task.patientId);
    if (patient) {
      const plan = buildInterventionPlan(patient, assessClinicalRisk(patient));
      // Non-completed steps — the doctor's order activates them all with
      // accountable owners and due times.
      const pending = plan.filter((s) => s.status !== "done");
      for (const step of pending) {
        await prisma.interventionOverride.upsert({
          where: { stepId: step.id },
          create: {
            stepId: step.id,
            patientId: task.patientId,
            status: "pending",
            // Doctor's order routes each step to the role the plan
            // template assigns (nurse executes, doctor reviews, etc.).
            assigneeId:
              step.role === "doctor"
                ? task.doctorId
                : step.role === "charge_nurse"
                  ? (assignment?.chargeNurseId ?? null)
                  : (assignment?.nurseId ?? null),
            dueAt: new Date(now.getTime() + (step.offsetMin || 15) * 60_000),
            note: reason?.slice(0, 500) ?? "",
            updatedBy: actor.id,
          },
          update: {
            assigneeId:
              step.role === "doctor"
                ? task.doctorId
                : step.role === "charge_nurse"
                  ? (assignment?.chargeNurseId ?? null)
                  : (assignment?.nurseId ?? null),
            dueAt: new Date(now.getTime() + (step.offsetMin || 15) * 60_000),
            updatedBy: actor.id,
          },
        });
      }
      invalidateSnapshots();
      await appendEvent({
        patientId: task.patientId,
        type: "order",
        occurredAt: now,
        actorUserId: actor.id,
        actorRole: actor.role,
        payload: {
          taskId: task.id,
          order: "treatment_plan",
          stepIds: pending.map((s) => s.id),
          simulated: "Simulated",
        },
        sourceRecordId: `dtask:${task.id}:order`,
      });
      if (assignment?.nurseId) {
        await notify(assignment.nurseId, "notif.planStarted", "warning", {
          patientId: task.patientId,
          entityType: "doctor_task",
          entityId: task.id,
          detail: String(pending.length),
        });
      }
    }
  }

  if (decision === "escalate") {
    await appendEvent({
      patientId: task.patientId,
      type: "escalation",
      occurredAt: now,
      actorUserId: actor.id,
      actorRole: actor.role,
      payload: {
        taskId: task.id,
        target: "rrt_icu",
        reason: reason ?? "",
        simulated: "Simulated",
      },
      sourceRecordId: `dtask:${task.id}:rrt`,
    });
    if (assignment?.chargeNurseId) {
      await notify(
        assignment.chargeNurseId,
        "notif.rrtEscalation",
        "critical",
        {
          patientId: task.patientId,
          entityType: "doctor_task",
          entityId: task.id,
        },
      );
    }
  }
}

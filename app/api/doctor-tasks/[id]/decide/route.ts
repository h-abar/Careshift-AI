import { requirePerm, ApiError } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { audit } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { doctorDecisionSchema } from "@/lib/schemas";
import { doctorTasksDecide } from "@/lib/server/doctor-task-actions";
import { TASK_RECHECK_MIN } from "@/lib/server/doctor-tasks";

const MINUTES = 60_000;

/**
 * E6 — step 3: the mandatory decision. The task stays open until one of:
 *   treatment        → order event + plan steps assigned to the nurse
 *   escalate         → RRT/ICU consult, charge nurse notified
 *   monitor          → increased monitoring interval + re-check scheduled
 *   not_significant  → free-text reason REQUIRED + NEWS2 re-check scheduled
 * Every decision is a hash-chained doctor_decision event + audit entry.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { data: body, error } = await parseBody(req, doctorDecisionSchema);
    if (error) return error;
    const auth = await requirePerm("clinical_decide");

    const task = await prisma.doctorTask.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "task not found");
    if (task.doctorId !== auth.user.id) throw new ApiError(403, "not your task");
    if (task.status === "closed") throw new ApiError(409, "task closed");

    // "not clinically significant" requires a recorded reason; every other
    // decision accepts an optional justification.
    if (body.decision === "not_significant" && !body.reason?.trim()) {
      throw new ApiError(400, "reason required for not_significant");
    }
    if (body.decision === "monitor" && !body.intervalMin) {
      throw new ApiError(400, "intervalMin required for monitor");
    }

    const now = new Date();
    const recheck =
      body.decision === "monitor"
        ? new Date(now.getTime() + body.intervalMin! * MINUTES)
        : body.decision === "not_significant"
          ? new Date(now.getTime() + TASK_RECHECK_MIN * MINUTES)
          : null;

    const row = await prisma.doctorTask.update({
      where: { id },
      data: {
        status: "closed",
        decision: body.decision,
        decisionReason: body.reason?.slice(0, 500) ?? null,
        decidedAt: now,
        closedAt: now,
        recheckDueAt: recheck,
        nextEscalateAt: null,
      },
    });

    const payload = {
      taskId: task.id,
      decision: body.decision,
      reason: body.reason ?? "",
      intervalMin: body.intervalMin ?? null,
      simulated: "Simulated",
    };
    await appendEvent({
      patientId: task.patientId,
      type: "doctor_decision",
      occurredAt: now,
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload,
      sourceRecordId: `dtask:${task.id}:decide`,
    });

    // Decision side-effects — orders, escalation, monitoring, re-check.
    await doctorTasksDecide({
      task,
      decision: body.decision,
      reason: body.reason,
      actor: { id: auth.user.id, role: auth.user.role },
      now,
    });

    await audit(
      {
        userId: auth.user.id,
        action: "doctor_task.decide",
        entityType: "doctor_task",
        entityId: id,
        next: {
          patientId: task.patientId,
          decision: body.decision,
          recheckDueAt: recheck?.toISOString() ?? null,
        },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ task: row });
  },
);

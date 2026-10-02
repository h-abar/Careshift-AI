import { requirePerm, ApiError } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/** E6 — step 1: one-tap acknowledge; records time-to-acknowledge. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("clinical_decide");
    const { id } = await ctx.params;
    const task = await prisma.doctorTask.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "task not found");
    if (task.doctorId !== auth.user.id) throw new ApiError(403, "not your task");
    if (task.acknowledgedAt || task.status === "closed")
      throw new ApiError(409, "already acknowledged");

    const now = new Date();
    const row = await prisma.doctorTask.update({
      where: { id },
      data: {
        status: "acknowledged",
        acknowledgedAt: now,
        // ack stops the ladder — the decision clock is tracked separately
        nextEscalateAt: null,
      },
    });
    await appendEvent({
      patientId: task.patientId,
      type: "alert_acknowledged",
      occurredAt: now,
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        taskId: task.id,
        score: task.score,
        ackAfterMin: Math.round(
          (now.getTime() - task.createdAt.getTime()) / 60_000,
        ),
        simulated: "Simulated",
      },
      sourceRecordId: `dtask:${task.id}:ack`,
    });
    await audit(
      {
        userId: auth.user.id,
        action: "doctor_task.ack",
        entityType: "doctor_task",
        entityId: id,
        next: { patientId: task.patientId, score: task.score },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ task: row });
  },
);

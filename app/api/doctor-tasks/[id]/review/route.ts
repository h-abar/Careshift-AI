import { requirePerm, ApiError } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/**
 * E6 — step 2: bedside review done (records time-to-review).
 * RCP NEWS2 guidance: emergency (>=7) = immediate, urgent (5-6) = urgent.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("clinical_decide");
    const { id } = await ctx.params;
    const task = await prisma.doctorTask.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "task not found");
    if (task.doctorId !== auth.user.id) throw new ApiError(403, "not your task");
    if (task.status === "closed") throw new ApiError(409, "task closed");
    if (!task.acknowledgedAt)
      throw new ApiError(409, "acknowledge first");
    if (task.reviewedAt) throw new ApiError(409, "already reviewed");

    const now = new Date();
    const row = await prisma.doctorTask.update({
      where: { id },
      data: { status: "reviewed", reviewedAt: now },
    });
    await appendEvent({
      patientId: task.patientId,
      type: "doctor_review",
      occurredAt: now,
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        taskId: task.id,
        reviewAfterMin: Math.round(
          (now.getTime() - task.createdAt.getTime()) / 60_000,
        ),
        simulated: "Simulated",
      },
      sourceRecordId: `dtask:${task.id}:review`,
    });
    await audit(
      {
        userId: auth.user.id,
        action: "doctor_task.review",
        entityType: "doctor_task",
        entityId: id,
        next: { patientId: task.patientId },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ task: row });
  },
);

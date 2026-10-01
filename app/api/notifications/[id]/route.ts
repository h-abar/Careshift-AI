import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { notifPatchSchema } from "@/lib/schemas";
import { appendEvent } from "@/lib/server/events";

/**
 * Acknowledge / dismiss a notification — writes MY receipt only, so one
 * user can never hide an alert for anyone else. Audited as
 * alert.ack / alert.dismiss.
 */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth();
    const { id } = await ctx.params;
    const { data, error } = await parseBody(req, notifPatchSchema);
    if (error) return error;
    const action = data.action;

    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n) return Response.json({ error: "not found" }, { status: 404 });
    // Only recipients may touch a notification.
    const mine = await prisma.notificationReceipt.findUnique({
      where: { notificationId_userId: { notificationId: id, userId: auth.user.id } },
    });
    if (!mine) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    await prisma.notificationReceipt.update({
      where: { id: mine.id },
      data: {
        readAt: mine.readAt ?? new Date(),
        dismissedAt: action === "dismiss" ? new Date() : mine.dismissedAt,
      },
    });
    await audit(
      {
        userId: auth.user.id,
        action: `alert.${action}`,
        entityType: "notification",
        entityId: id,
        next: { key: n.key, patientId: n.patientId },
        sessionId: auth.sid,
      },
      req,
    );
    // C9 — acknowledgement of a patient alert is itself a clinical event.
    if (action === "ack" && n.patientId) {
      await appendEvent({
        patientId: n.patientId, type: "alert_acknowledged",
        occurredAt: new Date(),
        actorUserId: auth.user.id, actorRole: auth.user.role,
        payload: { notificationId: id, simulated: "Simulated" },
        sourceRecordId: `live:ack:${id}:${auth.user.id}`,
      });
    }
    return ok({ id, read: true });
  },
);

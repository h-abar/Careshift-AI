import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { notifPatchSchema } from "@/lib/schemas";

/**
 * Acknowledge / dismiss a notification. Only MY notifications (or unit
 * broadcasts) may be touched — audited as alert.ack / alert.dismiss.
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
    if (n.userId !== null && n.userId !== auth.user.id) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    await prisma.notification.update({
      where: { id },
      data: { read: true, dismissed: action === "dismiss" },
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
    return ok({ id, read: true });
  },
);

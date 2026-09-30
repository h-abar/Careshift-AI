import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { handoffEvent } from "@/lib/server/handoffs";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/permissions";
import { handle, ok } from "@/lib/server/json";

/** Incoming staff rejects the handoff — a reason is mandatory. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("handoff_accept");
    const { id } = await ctx.params;
    const { reason } = (await req.json().catch(() => ({}))) as {
      reason?: string;
    };
    if (!reason?.trim()) {
      return Response.json({ error: "rejection reason required" }, { status: 400 });
    }

    const h = await prisma.handoff.findUnique({ where: { id } });
    if (!h) return Response.json({ error: "not found" }, { status: 404 });
    if (h.status !== "pending" && h.status !== "signed_off") {
      return Response.json(
        { error: `cannot reject a ${h.status} handoff` },
        { status: 409 },
      );
    }
    const isManager = can(auth.user.role, "handoff_manage");
    if (!isManager && auth.user.id !== h.incomingId) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const updated = await prisma.handoff.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: reason.trim().slice(0, 500),
      },
    });
    await handoffEvent(id, auth.user.id, "rejected", reason.trim().slice(0, 200));
    await notify(h.outgoingId, "notif.handoffRejectedBy", "critical", {
      entityType: "handoff",
      entityId: id,
      detail: reason.trim().slice(0, 200),
    });
    await audit(
      {
        userId: auth.user.id,
        action: "handoff.reject",
        entityType: "handoff",
        entityId: id,
        prev: { status: h.status },
        next: { status: "rejected", reason: reason.trim().slice(0, 200) },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ handoff: updated });
  },
);

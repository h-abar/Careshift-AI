import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { handoffEvent } from "@/lib/server/handoffs";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { can } from "@/lib/permissions";

/**
 * Incoming staff accepts a SIGNED-OFF handoff → completed.
 * Status machine: pending →(signoff)→ signed_off →(accept)→ completed.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("handoff_accept");
    const { id } = await ctx.params;
    const { checklist } = (await req.json().catch(() => ({}))) as {
      checklist?: string[];
    };

    const h = await prisma.handoff.findUnique({ where: { id } });
    if (!h) return Response.json({ error: "not found" }, { status: 404 });
    if (h.status === "completed") {
      return Response.json({ error: "already completed" }, { status: 409 });
    }
    if (h.status === "rejected") {
      return Response.json({ error: "handoff was rejected" }, { status: 409 });
    }
    if (h.status !== "signed_off") {
      return Response.json(
        { error: "outgoing sign-off required before acceptance" },
        { status: 409 },
      );
    }

    // Only the assigned incoming staff member — or admin/charge nurse —
    // may accept a handoff on their behalf.
    const isManager = can(auth.user.role, "handoff_manage");
    if (!isManager && auth.user.id !== h.incomingId) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const timeline = JSON.parse(h.timelineJson) as { t: string; key: string }[];
    timeline.push({ t: new Date().toISOString().slice(11, 16), key: "hftl.accepted" });

    const updated = await prisma.handoff.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
        checklistJson: JSON.stringify(checklist ?? JSON.parse(h.checklistJson)),
        timelineJson: JSON.stringify(timeline),
      },
    });
    await handoffEvent(id, auth.user.id, "accepted");
    await notify(h.outgoingId, "notif.handoffAcceptedNotif", "info", {
      entityType: "handoff",
      entityId: id,
    });

    await audit(
      {
        userId: auth.user.id,
        action: "handoff.accept",
        entityType: "handoff",
        entityId: id,
        prev: { status: h.status, from: h.outgoingId },
        next: { status: "completed", to: h.incomingId },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({
      handoff: {
        ...updated,
        patientIds: JSON.parse(updated.patientIdsJson),
        reviewed: JSON.parse(updated.reviewedJson),
        checklist: JSON.parse(updated.checklistJson),
        timeline: JSON.parse(updated.timelineJson),
      },
    });
  },
);

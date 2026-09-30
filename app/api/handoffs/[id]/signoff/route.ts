import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { REQUIRED_CHECKLIST, handoffEvent } from "@/lib/server/handoffs";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/permissions";
import { handle, ok } from "@/lib/server/json";

const J = <T>(s: string | null | undefined, fb: T): T =>
  s ? (JSON.parse(s) as T) : fb;

/**
 * Outgoing staff signs off — requires every included patient reviewed and
 * every required checklist item ticked. pending → signed_off.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("handoff_view");
    const { id } = await ctx.params;

    const h = await prisma.handoff.findUnique({ where: { id } });
    if (!h) return Response.json({ error: "not found" }, { status: 404 });
    if (h.status !== "pending") {
      return Response.json(
        { error: `cannot sign off a ${h.status} handoff` },
        { status: 409 },
      );
    }
    const isManager = can(auth.user.role, "handoff_manage");
    if (!isManager && auth.user.id !== h.outgoingId) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const patientIds = J<string[]>(h.patientIdsJson, []);
    const reviewed = J<Record<string, boolean>>(h.reviewedJson, {});
    const checklist = J<string[]>(h.checklistJson, []);

    const unreviewed = patientIds.filter((p) => !reviewed[p]);
    const missing = REQUIRED_CHECKLIST.filter((k) => !checklist.includes(k));
    if (unreviewed.length || missing.length) {
      return Response.json(
        { error: "review incomplete", unreviewed, missingChecklist: missing },
        { status: 400 },
      );
    }

    const timeline = J<{ t: string; key: string }[]>(h.timelineJson, []);
    timeline.push({
      t: new Date().toISOString().slice(11, 16),
      key: "hftl.signedOff",
    });

    const updated = await prisma.handoff.update({
      where: { id },
      data: {
        status: "signed_off",
        signedOffAt: new Date(),
        timelineJson: JSON.stringify(timeline),
      },
    });
    await handoffEvent(id, auth.user.id, "signed_off");
    await notify(h.incomingId, "notif.signedOff", "warning", {
      entityType: "handoff",
      entityId: id,
    });
    await audit(
      {
        userId: auth.user.id,
        action: "handoff.signoff",
        entityType: "handoff",
        entityId: id,
        next: { status: "signed_off" },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ handoff: { ...updated, status: updated.status } });
  },
);

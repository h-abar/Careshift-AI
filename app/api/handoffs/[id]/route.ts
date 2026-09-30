import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { dbSnapshots, dbStaffPickers } from "@/lib/server/data";
import { REQUIRED_CHECKLIST, handoffEvent } from "@/lib/server/handoffs";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/permissions";
import { handle, ok, parseBody } from "@/lib/server/json";
import { handoffPatchSchema } from "@/lib/schemas";

const J = <T>(s: string | null | undefined, fb: T): T =>
  s ? (JSON.parse(s) as T) : fb;

export function mapHandoff(h: {
  id: string; dept: string; shift: string; date: string;
  outgoingId: string; incomingId: string; patientIdsJson: string;
  status: string; reviewedJson: string; checklistJson: string;
  timelineJson: string; rejectionReason: string | null;
  signedOffAt: Date | null; completedAt: Date | null;
  patients?: { patientId: string; reviewed: boolean; sbarJson: string }[];
  events?: { actorId: string; action: string; detail: string; createdAt: Date }[];
}) {
  return {
    id: h.id, dept: h.dept, shift: h.shift, date: h.date,
    outgoingId: h.outgoingId, incomingId: h.incomingId,
    patientIds: J<string[]>(h.patientIdsJson, []),
    status: h.status,
    reviewed: J<Record<string, boolean>>(h.reviewedJson, {}),
    checklist: J<string[]>(h.checklistJson, []),
    timeline: J<{ t: string; key: string }[]>(h.timelineJson, []),
    rejectionReason: h.rejectionReason ?? undefined,
    signedOffAt: h.signedOffAt?.toISOString(),
    completedAt: h.completedAt?.toISOString(),
    patients: h.patients?.map((p) => ({
      patientId: p.patientId,
      reviewed: p.reviewed,
      sbar: J(p.sbarJson, {}),
    })),
    events: h.events?.map((e) => ({
      actorId: e.actorId, action: e.action, detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("handoff_view");
    const { id } = await ctx.params;
    const [h, snaps, users] = await Promise.all([
      prisma.handoff.findUnique({
        where: { id },
        include: {
          patients: true,
          events: { orderBy: { createdAt: "asc" } },
        },
      }),
      dbSnapshots(),
      dbStaffPickers(),
    ]);
    if (!h) return Response.json({ error: "not found" }, { status: 404 });
    const mapped = mapHandoff(h);
    return ok({
      handoff: mapped,
      users,
      snaps: snaps.filter((s) => mapped.patientIds.includes(s.patient.id)),
    });
  },
);

/**
 * Editable review state — SBAR text, per-patient reviewed flags, checklist.
 * Only while the handoff is still pending; both parties (and managers) may
 * annotate, but the outgoing user owns sign-off.
 */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("handoff_view");
    const { id } = await ctx.params;
    const { data: b, error } = await parseBody(req, handoffPatchSchema);
    if (error) return error;

    const h = await prisma.handoff.findUnique({ where: { id } });
    if (!h) return Response.json({ error: "not found" }, { status: 404 });
    if (h.status !== "pending") {
      return Response.json(
        { error: `handoff is ${h.status} — review closed` },
        { status: 409 },
      );
    }
    const isParty =
      auth.user.id === h.outgoingId || auth.user.id === h.incomingId;
    if (!isParty && !can(auth.user.role, "handoff_manage")) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const patientIds = J<string[]>(h.patientIdsJson, []);

    if (b.reviewed) {
      const merged = { ...J<Record<string, boolean>>(h.reviewedJson, {}) };
      for (const [pid, v] of Object.entries(b.reviewed)) {
        if (patientIds.includes(pid)) merged[pid] = v;
      }
      await prisma.handoff.update({
        where: { id },
        data: { reviewedJson: JSON.stringify(merged) },
      });
      await prisma.handoffPatient.updateMany({
        where: { handoffId: id, patientId: { in: patientIds } },
        data: {}, // flags live in reviewedJson; rows carry sbar only
      });
      await handoffEvent(id, auth.user.id, "reviewed");
    }
    if (b.checklist) {
      const clean = b.checklist.filter((k) =>
        (REQUIRED_CHECKLIST as readonly string[]).includes(k),
      );
      await prisma.handoff.update({
        where: { id },
        data: { checklistJson: JSON.stringify(clean) },
      });
      await handoffEvent(id, auth.user.id, "checklist", clean.join(","));
    }
    if (b.sbar && patientIds.includes(b.sbar.patientId)) {
      const row = await prisma.handoffPatient.findFirst({
        where: { handoffId: id, patientId: b.sbar.patientId },
      });
      if (row) {
        const cur = J<Record<string, unknown>>(row.sbarJson, {});
        cur[b.sbar.lang] = {
          s: b.sbar.s, b: b.sbar.bb, a: b.sbar.a, r: b.sbar.r,
        };
        await prisma.handoffPatient.update({
          where: { id: row.id },
          data: { sbarJson: JSON.stringify(cur) },
        });
        await handoffEvent(id, auth.user.id, "sbar", b.sbar.patientId);
      }
    }

    await audit(
      {
        userId: auth.user.id,
        action: "handoff.update",
        entityType: "handoff",
        entityId: id,
        next: {
          reviewed: b.reviewed ? Object.keys(b.reviewed) : undefined,
          checklist: b.checklist,
          sbarEdited: b.sbar?.patientId,
        },
        sessionId: auth.sid,
      },
      req,
    );

    const fresh = await prisma.handoff.findUnique({
      where: { id },
      include: { patients: true, events: { orderBy: { createdAt: "asc" } } },
    });
    return ok({ handoff: mapHandoff(fresh!) });
  },
);

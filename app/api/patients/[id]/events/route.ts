/**
 * C2 — per-patient clinical event timeline.
 * Clinical roles (patients_view) see the full chain; insurance sees
 * only the billing-relevant, claim-linkable subset — minimum necessary
 * (PDPL need-to-know), and every insurer read is audited.
 */
import { requireAnyPerm } from "@/lib/server/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { BILLING_TYPES, eventCategories } from "@/lib/event-taxonomy";
import { closedLoopChain } from "@/lib/server/chains";

export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAnyPerm(["patients_view", "claims_view"]);
    const { id } = await ctx.params;
    const category = new URL(req.url).searchParams.get("category");
    const insurer = !can(auth.user.role, "patients_view");

    const rows = await prisma.clinicalEvent.findMany({
      where: insurer
        ? { patientId: id, type: { in: [...BILLING_TYPES] } }
        : { patientId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    if (!rows.length) {
      const exists = await prisma.patient.findUnique({
        where: { id }, select: { id: true },
      });
      if (!exists) return Response.json({ error: "not found" }, { status: 404 });
    }

    // actor display names — clinical roles only (insurer gets role only)
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[];
    const actors = insurer
      ? new Map<string, string>()
      : new Map(
          (await prisma.user.findMany({ where: { id: { in: actorIds } } }))
            .map((u) => [u.id, u.nameEn]),
        );

    // rule keys for evidence links
    const ruleIds = [...new Set(rows.map((r) => r.ruleId).filter(Boolean))] as string[];
    const rules = new Map(
      (await prisma.rule.findMany({ where: { id: { in: ruleIds } } }))
        .map((r) => [r.id, r.key]),
    );

    const events = rows
      .map((e) => {
        const payload = JSON.parse(e.payloadJson) as Record<string, unknown>;
        return {
          id: e.id,
          type: e.type,
          occurredAt: e.occurredAt.toISOString(),
          recordedAt: e.recordedAt.toISOString(),
          lateEntry: e.lateEntry,
          actorRole: e.actorRole,
          actor: e.actorUserId ? (actors.get(e.actorUserId) ?? null) : null,
          payload,
          ruleId: e.ruleId,
          ruleKey: e.ruleId ? (rules.get(e.ruleId) ?? null) : null,
          ruleVersion: e.ruleVersion,
          correctsId: e.correctsId,
          correctionReason: e.correctionReason,
          claimId: (payload.claimId as string) ?? null,
          hash: e.hash.slice(0, 12),
          categories: eventCategories({ type: e.type, actorRole: e.actorRole, payload }),
        };
      })
      .filter((e) => !category || e.categories.includes(category as never));

    if (insurer) {
      await audit({
        userId: auth.user.id,
        action: "timeline_view",
        entityType: "patient",
        entityId: id,
        next: { scope: "claim-linked-subset", events: events.length },
        sessionId: auth.sid,
      }, req);
    }

    return ok({
      scope: insurer ? "claim-linked-subset" : "full",
      events,
      // C9 — closed-loop safety chain (clinical roles only; the insurer
      // gets claim-linked proof via the package, not the safety chain)
      chain: insurer ? null : await closedLoopChain(id),
    });
  },
);

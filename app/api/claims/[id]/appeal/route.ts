import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { claimEvent, notifyClaimWatchers } from "@/lib/server/claims";
import { handle, ok, parseBody } from "@/lib/server/json";
import { appealSchema } from "@/lib/schemas";
import { rateGuard } from "@/lib/server/ratelimit";
import { validateAppealEventIds } from "@/lib/server/adjudication";

/**
 * Appeal a denied claim — requires a reason, returns the claim to "review".
 * Separate from PATCH status so the appeal intent is preserved in history.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("appeal_approve");
    const rg = await rateGuard(auth.user.id, "claimWrite");
    if (rg) return rg;
    const { id } = await ctx.params;
    const { data, error } = await parseBody(req, appealSchema);
    if (error) return error;
    const { reason, eventIds } = data;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });
    if (claim.status !== "denied") {
      return Response.json(
        { error: "only denied claims can be appealed", code: "invalid_state" },
        { status: 409 },
      );
    }

    // C6 — an appeal package may contain ONLY existing events that
    // belong to this claim's patient (clinician-approved = this call
    // itself, made under appeal_approve and audited).
    if (eventIds?.length) {
      const v = await validateAppealEventIds(id, eventIds);
      if (!v.ok) {
        return Response.json(
          { error: "appeal may only reference existing events", code: "bad_event_ids", fields: { eventIds: v.bad.join(",") } },
          { status: 422 },
        );
      }
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: { status: "review", updatedBy: auth.user.id },
    });

    await claimEvent(
      id, auth.user.id, "appeal",
      JSON.stringify({ reason: reason.trim(), eventIds: eventIds ?? [] }),
    );
    await audit(
      {
        userId: auth.user.id,
        action: "claim.appeal",
        entityType: "claim",
        entityId: id,
        prev: { status: "denied", denialCode: claim.denialCode },
        next: {
          status: "review", reason: reason.trim(),
          appealEventIds: eventIds ?? [],
        },
        sessionId: auth.sid,
      },
      req,
    );
    await notifyClaimWatchers(id, auth.user.id, "warning", "appeal");

    return ok({ claim: updated });
  },
);

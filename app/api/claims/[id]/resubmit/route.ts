import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { claimEvent, notifyClaimWatchers } from "@/lib/server/claims";
import { handle, ok, parseBody } from "@/lib/server/json";
import { resubmitSchema } from "@/lib/schemas";
import { rateGuard } from "@/lib/server/ratelimit";

/**
 * Resubmit a denied claim after fixing the deficiency — a note describing
 * what was corrected is required and kept in the claim history.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const rg = await rateGuard(auth.user.id, "claimWrite");
    if (rg) return rg;
    const { id } = await ctx.params;
    const { data, error } = await parseBody(req, resubmitSchema);
    if (error) return error;
    const { note } = data;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });
    if (claim.status !== "denied") {
      return Response.json(
        { error: "only denied claims can be resubmitted", code: "invalid_state" },
        { status: 409 },
      );
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: { status: "review", denialCode: null, updatedBy: auth.user.id },
    });

    await claimEvent(id, auth.user.id, "resubmit", note.trim());
    await audit(
      {
        userId: auth.user.id,
        action: "claim.resubmit",
        entityType: "claim",
        entityId: id,
        prev: { status: "denied", denialCode: claim.denialCode },
        next: { status: "review", note: note.trim() },
        sessionId: auth.sid,
      },
      req,
    );
    await notifyClaimWatchers(id, auth.user.id, "info", "resubmit");

    return ok({ claim: updated });
  },
);

import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import type { ClaimStatus } from "@/lib/types";

/** Legal claim lifecycle — anything not listed is rejected with 400. */
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ["review", "approved", "denied"],
  review: ["approved", "denied"],
  denied: ["review"],
  approved: [],
};

/** Claim status transitions — claims_edit only, recorded in the audit trail. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const { id } = await ctx.params;
    const { status } = (await req.json().catch(() => ({}))) as {
      status?: ClaimStatus;
    };

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

    const allowed = TRANSITIONS[claim.status as ClaimStatus] ?? [];
    if (!status || !allowed.includes(status)) {
      return Response.json(
        { error: `invalid transition ${claim.status} → ${status}` },
        { status: 400 },
      );
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: { status, updatedBy: auth.user.id },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "claim.status",
        entityType: "claim",
        entityId: id,
        prev: { status: claim.status },
        next: { status },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({ claim: updated });
  },
);

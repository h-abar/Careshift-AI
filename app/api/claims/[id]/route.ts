import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import type { ClaimStatus } from "@/lib/types";

const ALLOWED: ClaimStatus[] = ["approved", "pending", "review", "denied"];

/** Claim status transitions — recorded in the audit trail. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("insurance_view");
    const { id } = await ctx.params;
    const { status } = (await req.json()) as { status?: ClaimStatus };
    if (!status || !ALLOWED.includes(status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

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

/**
 * E7 — payer action: request additional evidence on a submitted claim.
 * The claim stays in its current status; the request lands on the
 * hospital's claims monitor as a ClaimEvent + notification to every
 * claims_view holder. Audited like every payer touch.
 */
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import {
  assertPayerClaim,
  claimEvent,
  notifyClaimWatchers,
} from "@/lib/server/claims";
import { handle, ok, parseBody } from "@/lib/server/json";
import { rateGuard } from "@/lib/server/ratelimit";

const schema = z.object({
  detail: z.string().trim().min(3).max(500),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("payer_claims");
    const rg = await rateGuard(auth.user.id, "claimWrite");
    if (rg) return rg;
    const { id } = await ctx.params;
    const { data, error } = await parseBody(req, schema);
    if (error) return error;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });
    assertPayerClaim(auth, claim);
    if (claim.status !== "pending" && claim.status !== "review") {
      return Response.json(
        { error: "evidence can only be requested on submitted claims", code: "invalid_state" },
        { status: 409 },
      );
    }

    await claimEvent(id, auth.user.id, "evidence_requested", data.detail);
    await notifyClaimWatchers(id, auth.user.id, "warning", "evidence_requested");
    await audit(
      {
        userId: auth.user.id,
        action: "claim.request_evidence",
        entityType: "claim",
        entityId: id,
        next: { detail: data.detail },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ requested: true });
  },
);

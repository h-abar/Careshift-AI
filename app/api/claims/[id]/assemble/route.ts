/**
 * C3 — "Assemble claim": rebuild event-backed claim lines from the
 * patient's immutable event store. Hard rule enforced server-side:
 * no supporting events → no line. Requires claims_view; audited.
 */
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { assembleClaim, ClaimAssemblyError } from "@/lib/server/claim-assembly";
import { handle, ok } from "@/lib/server/json";

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_view");
    const { id } = await ctx.params;
    try {
      const result = await assembleClaim(id);
      await audit({
        userId: auth.user.id,
        action: "claim.assemble",
        entityType: "claim",
        entityId: id,
        next: {
          lines: result.created,
          flagged: result.flagged,
          diagnoses: result.diagnoses,
        },
        sessionId: auth.sid,
      }, req);
      return ok(result);
    } catch (e) {
      if (e instanceof ClaimAssemblyError) {
        return Response.json({ error: e.message }, { status: 422 });
      }
      throw e;
    }
  },
);

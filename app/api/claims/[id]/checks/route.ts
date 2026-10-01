/**
 * C4 — pre-submission consistency checks (billed↔lived both directions,
 * doc gaps → official NPHIES SE codes, timing). Every run is audited.
 * Response is labeled "Rule-based checks, prototype".
 */
import { requireAnyPerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { runClaimChecks } from "@/lib/server/claim-checks";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAnyPerm(["claims_edit", "insurance_view"]);
    const { id } = await ctx.params;
    const result = await runClaimChecks(id).catch((e) => {
      if (e.message === "claim not found") return null;
      throw e;
    });
    if (!result) return Response.json({ error: "not found" }, { status: 404 });
    await audit({
      userId: auth.user.id,
      action: "claim.checks",
      entityType: "claim",
      entityId: id,
      next: { readiness: result.readiness, issues: result.issues.length },
      sessionId: auth.sid,
    }, req);
    return ok(result);
  },
);

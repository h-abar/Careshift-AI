/**
 * C6 — simulated payer adjudication. Runs the C4 consistency checks and
 * denies with the FIRST issue's official NPHIES adjudication-reason
 * code (imported list only, never invented); clean claims approve.
 * Audited.
 */
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { simulateAdjudication } from "@/lib/server/adjudication";
import { handle, ok } from "@/lib/server/json";

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const { id } = await ctx.params;
    try {
      const r = await simulateAdjudication(id);
      await audit({
        userId: auth.user.id, action: "claim.adjudicate",
        entityType: "claim", entityId: id,
        next: { decision: r.decision, reasonCode: r.reasonCode },
        sessionId: auth.sid,
      }, req);
      return ok({
        decision: r.decision,
        reasonCode: r.reasonCode,
        label: r.label,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      throw e;
    }
  },
);

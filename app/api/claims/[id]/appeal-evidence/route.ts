/**
 * C6 — for a denied claim: which event types answer the official
 * denial code, which are missing, and which existing events can go
 * into the appeal package (existing events only).
 */
import { requirePerm } from "@/lib/server/session";
import { appealEvidence } from "@/lib/server/adjudication";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("appeal_approve");
    const { id } = await ctx.params;
    try {
      return ok(await appealEvidence(id));
    } catch {
      return Response.json({ error: "not found" }, { status: 404 });
    }
  },
);

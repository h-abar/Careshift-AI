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

    // C6 — resubmission is a NEW claim version linked to the old one;
    // the denied record and its lines stay untouched (history intact).
    const versions = await prisma.insuranceClaim.count({
      where: { supersedesId: id },
    });
    const newId = `${id}-v${claim.version + versions + 1}`;
    const lines = await prisma.claimLine.findMany({ where: { claimId: id } });
    const updated = await prisma.insuranceClaim.create({
      data: {
        id: newId,
        patientId: claim.patientId,
        amountSar: claim.amountSar,
        status: "review",
        dxKey: claim.dxKey,
        losDays: claim.losDays,
        icuDays: claim.icuDays,
        evidenceJson: claim.evidenceJson,
        frictionJson: claim.frictionJson,
        version: claim.version + versions + 1,
        supersedesId: id,
        updatedBy: auth.user.id,
        lines: {
          create: lines.map((l) => ({
            seq: l.seq, kind: l.kind, code: l.code, codeSystem: l.codeSystem,
            codeVersion: l.codeVersion, description: l.description,
            quantity: l.quantity, unitPriceSar: l.unitPriceSar,
            simulatedPrice: l.simulatedPrice,
            serviceStart: l.serviceStart, serviceEnd: l.serviceEnd,
            eventIdsJson: l.eventIdsJson, necessityJson: l.necessityJson,
            eventBacked: l.eventBacked, manualReason: l.manualReason,
            flagsJson: l.flagsJson,
          })),
        },
      },
    });

    await claimEvent(id, auth.user.id, "resubmit", `${note.trim()} → ${newId}`);
    await audit(
      {
        userId: auth.user.id,
        action: "claim.resubmit",
        entityType: "claim",
        entityId: id,
        prev: { status: "denied", denialCode: claim.denialCode },
        next: { status: "review", note: note.trim(), newClaimId: newId },
        sessionId: auth.sid,
      },
      req,
    );
    await notifyClaimWatchers(id, auth.user.id, "info", "resubmit");

    return ok({ claim: updated });
  },
);

import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { claimEvent, notifyClaimWatchers } from "@/lib/server/claims";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { isDenialCode } from "@/lib/denial";
import { handle, ok, parseBody } from "@/lib/server/json";
import { claimPatchSchema } from "@/lib/schemas";
import { dbClaims } from "@/lib/server/data";
import type { ClaimStatus } from "@/lib/types";

/** Legal claim lifecycle — anything not listed is rejected with 400. */
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ["review", "approved", "denied"],
  review: ["approved", "denied"],
  denied: ["review"],
  approved: [],
};

/** Claim detail: record + documents + per-claim history + live readiness. */
export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("insurance_view");
    const { id } = await ctx.params;
    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        documents: {
          where: { scanStatus: { not: "infected" } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

    const engine = (await dbClaims()).find((c) => c.id === id);
    const events = await prisma.claimEvent.findMany({
      where: { claimId: id },
      orderBy: { createdAt: "desc" },
    });

    const { documents, ...claimBody } = claim;
    return ok({
      claim: claimBody,
      readiness: engine ? claimReadiness(engine) : null,
      documents: documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedBy: d.uploadedBy,
        createdAt: d.createdAt,
      })),
      events,
    });
  },
);

/** Claim status transitions — claims_edit only, recorded in the audit trail. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const { id } = await ctx.params;
    const { data, error } = await parseBody(req, claimPatchSchema);
    if (error) return error;
    const { status, denialCode } = data;

    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });

    const allowed = TRANSITIONS[claim.status as ClaimStatus] ?? [];
    if (!status || !allowed.includes(status)) {
      return Response.json(
        { error: `invalid transition ${claim.status} → ${status}`, code: "invalid_transition" },
        { status: 400 },
      );
    }
    if (status === "denied" && !isDenialCode(denialCode)) {
      return Response.json(
        { error: "denial requires a valid denialCode", code: "denial_code_required" },
        { status: 400 },
      );
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: {
        status,
        denialCode: status === "denied" ? denialCode! : null,
        updatedBy: auth.user.id,
      },
    });

    await claimEvent(
      id,
      auth.user.id,
      "status",
      `${claim.status} → ${status}${status === "denied" ? ` (${denialCode})` : ""}`,
    );
    await audit(
      {
        userId: auth.user.id,
        action: "claim.status",
        entityType: "claim",
        entityId: id,
        prev: { status: claim.status },
        next: { status, denialCode: status === "denied" ? denialCode : null },
        sessionId: auth.sid,
      },
      req,
    );
    await notifyClaimWatchers(id, auth.user.id, status === "denied" ? "warning" : "info", status);

    return ok({ claim: updated });
  },
);

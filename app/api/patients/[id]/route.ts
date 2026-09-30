import { requirePerm } from "@/lib/server/session";
import { dbSnapshots } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { simulateWhatIf } from "@/lib/engines/simulator";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { journeys } from "@/lib/data/journeys";

/** Full patient bundle for the Digital Journey screen. Records the view. */
export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_view");
    const { id } = await ctx.params;

    const snaps = await dbSnapshots();
    const snap = snaps.find((s) => s.patient.id === id);
    if (!snap) return Response.json({ error: "not found" }, { status: 404 });

    const claim = await prisma.insuranceClaim.findFirst({
      where: { patientId: id },
    });
    const journeyRow = await prisma.patient.findUnique({
      where: { id },
      select: { journeyJson: true },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "patient.view",
        entityType: "patient",
        entityId: id,
        sessionId: auth.sid,
      },
      req,
    );

    return ok({
      patient: snap.patient,
      risk: snap.risk,
      insurance: snap.insurance,
      plan: snap.plan,
      sim: simulateWhatIf(snap.patient, snap.risk),
      journey:
        journeyRow?.journeyJson
          ? JSON.parse(journeyRow.journeyJson)
          : journeys[id] ?? [],
      claim: claim
        ? {
            ...claim,
            evidence: JSON.parse(claim.evidenceJson),
            frictionKeys: JSON.parse(claim.frictionJson),
          }
        : null,
      readiness: claim
        ? claimReadiness({
            id: claim.id,
            patientId: claim.patientId ?? undefined,
            amountSar: claim.amountSar,
            status: claim.status as never,
            dxKey: claim.dxKey,
            losDays: claim.losDays,
            icuDays: claim.icuDays,
            evidence: JSON.parse(claim.evidenceJson),
            frictionKeys: JSON.parse(claim.frictionJson),
          })
        : null,
    });
  },
);

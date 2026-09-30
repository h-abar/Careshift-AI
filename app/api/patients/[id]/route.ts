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

    // Persist the (re)computed risk as a RiskAssessment row — deduplicated:
    // a new row only when the score/level changed or 10 min elapsed.
    const lastRun = await prisma.riskAssessment.findFirst({
      where: { patientId: id },
      orderBy: { assessedAt: "desc" },
    });
    if (
      !lastRun ||
      lastRun.score !== snap.risk.score ||
      lastRun.level !== snap.risk.level ||
      Date.now() - lastRun.assessedAt.getTime() > 10 * 60 * 1000
    ) {
      await prisma.riskAssessment.create({
        data: {
          patientId: id,
          score: snap.risk.score,
          level: snap.risk.level,
          conditionKey: snap.risk.conditionKey,
          factorsJson: JSON.stringify(snap.risk.factors),
          windowHrs: snap.risk.windowHrs,
          confidence: snap.risk.confidence,
        },
      });
    }
    const riskHistory = await prisma.riskAssessment.findMany({
      where: { patientId: id },
      orderBy: { assessedAt: "desc" },
      take: 8,
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
      riskHistory: riskHistory.map((r) => ({
        score: r.score,
        level: r.level,
        conditionKey: r.conditionKey,
        confidence: r.confidence,
        assessedAt: r.assessedAt.toISOString(),
      })),
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

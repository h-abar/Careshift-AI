import { requirePerm } from "@/lib/server/session";
import { dbPatient, dbSnapshots } from "@/lib/server/data";
import { runRiskAssessment } from "@/lib/server/risk";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { simulateWhatIf } from "@/lib/engines/simulator";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import type { LabResult, VitalPoint } from "@/lib/types";

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
      // Digital journey — served from the DB, grown by real events.
      journey: journeyRow?.journeyJson
        ? JSON.parse(journeyRow.journeyJson)
        : [
            { t: "—", kind: "admission", key: "admitted" },
            { t: "—", kind: "review", key: "routineMonitoring" },
          ],
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

const isVitalPoint = (v: unknown): v is VitalPoint =>
  typeof v === "object" && v !== null &&
  typeof (v as VitalPoint).t === "string" &&
  ["hr", "sbp", "rr", "temp", "spo2"].every(
    (k) => typeof (v as Record<string, unknown>)[k] === "number",
  );
const isLab = (v: unknown): v is LabResult =>
  typeof v === "object" && v !== null &&
  typeof (v as LabResult).key === "string" &&
  typeof (v as LabResult).value === "string" &&
  ["high", "low", "normal"].includes((v as LabResult).flag);

/**
 * Vitals/labs update — persisted, then risk is REASSESSED immediately so
 * threshold crossings alert the assigned nurse + physician.
 */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => ({}))) as {
      vitals?: unknown;
      labs?: unknown;
    };
    if (b.vitals !== undefined && (!Array.isArray(b.vitals) || !b.vitals.every(isVitalPoint))) {
      return Response.json({ error: "invalid vitals" }, { status: 400 });
    }
    if (b.labs !== undefined && (!Array.isArray(b.labs) || !b.labs.every(isLab))) {
      return Response.json({ error: "invalid labs" }, { status: 400 });
    }
    if (b.vitals === undefined && b.labs === undefined) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }

    const row = await prisma.patient.findUnique({ where: { id } });
    if (!row) return Response.json({ error: "not found" }, { status: 404 });

    await prisma.patient.update({
      where: { id },
      data: {
        vitalsJson: b.vitals ? JSON.stringify(b.vitals) : undefined,
        labsJson: b.labs ? JSON.stringify(b.labs) : undefined,
      },
    });

    const patient = await dbPatient(id);
    const { risk, crossedUp } = await runRiskAssessment(patient!);
    await audit(
      {
        userId: auth.user.id,
        action: "patient.update",
        entityType: "patient",
        entityId: id,
        prev: { vitals: row.vitalsJson.length, labs: row.labsJson.length },
        next: {
          vitals: b.vitals ? (b.vitals as VitalPoint[]).length : undefined,
          labs: b.labs ? (b.labs as LabResult[]).length : undefined,
          newScore: risk.score,
          newLevel: risk.level,
          crossedUp,
        },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ risk, crossedUp });
  },
);

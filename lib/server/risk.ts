import { prisma } from "@/lib/server/prisma";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { notify } from "@/lib/server/notify";
import { appendJourney } from "@/lib/server/journey";
import type { ClinicalRisk, Patient } from "@/lib/types";

export const LEVEL_RANK: Record<string, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

/**
 * Recompute risk for a patient, persist a RiskAssessment row, and — when
 * the level crossed UP into high/critical — alert the assigned nurse and
 * physician with a Notification row each.
 */
export async function runRiskAssessment(patient: Patient): Promise<{
  risk: ClinicalRisk;
  crossedUp: boolean;
}> {
  const risk = assessClinicalRisk(patient);
  const last = await prisma.riskAssessment.findFirst({
    where: { patientId: patient.id },
    orderBy: { assessedAt: "desc" },
  });
  await prisma.riskAssessment.create({
    data: {
      patientId: patient.id,
      score: risk.score,
      level: risk.level,
      conditionKey: risk.conditionKey,
      factorsJson: JSON.stringify(risk.factors),
      windowHrs: risk.windowHrs,
      confidence: risk.confidence,
    },
  });

  const crossedUp =
    !last || LEVEL_RANK[risk.level] > (LEVEL_RANK[last.level] ?? 0);

  if (crossedUp && LEVEL_RANK[risk.level] >= LEVEL_RANK.high) {
    await appendJourney(patient.id, {
      kind: "risk",
      key: "riskDetected",
      riskScore: risk.score,
    });
    const assign = await prisma.assignment.findUnique({
      where: { patientId: patient.id },
    });
    const targets = [assign?.nurseId, assign?.physicianId].filter(
      (x): x is string => Boolean(x),
    );
    await Promise.all(
      targets.map((uid) =>
        notify(
          uid,
          "notif.riskAlert",
          risk.level === "critical" ? "critical" : "warning",
          {
            patientId: patient.id,
            entityType: "patient",
            entityId: patient.id,
            detail: `${risk.score}`,
          },
        ),
      ),
    );
  }
  return { risk, crossedUp };
}

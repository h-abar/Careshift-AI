import type {
  ClinicalRisk,
  InsuranceRisk,
  InterventionStep,
  Patient,
} from "@/lib/types";
import { patients } from "@/lib/data/patients";
import { claims } from "@/lib/data/claims";
import { journeys } from "@/lib/data/journeys";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { computeCareValue } from "@/lib/engines/care-value";
import { simulateWhatIf } from "@/lib/engines/simulator";

export interface PatientSnapshot {
  patient: Patient;
  risk: ClinicalRisk;
  insurance: InsuranceRisk;
  plan: InterventionStep[];
}

/** Runs both engines over the live census, sorted by clinical risk. */
export function buildSnapshots(): PatientSnapshot[] {
  return patients
    .map((patient) => {
      const risk = assessClinicalRisk(patient);
      return {
        patient,
        risk,
        insurance: assessInsuranceRisk(patient, risk),
        plan: buildInterventionPlan(patient, risk),
      };
    })
    .sort((a, b) => b.risk.score - a.risk.score);
}

/**
 * Hospital-level aggregates — every figure is derived from the dataset.
 * Nothing is padded: the monitored cohort IS the demo dataset.
 */
export function orgStats() {
  const snaps = buildSnapshots();
  const steps = snaps.flatMap((s) => s.plan);

  const pendingSteps = steps.filter(
    (i) => i.status === "pending" || i.status === "in_progress",
  );
  const doneSteps = steps.filter((i) => i.status === "done");

  const totalExposure = snaps.reduce((s, x) => s + x.insurance.exposureSar, 0);
  const docScores = snaps.map((s) => s.insurance.docCompleteness);
  const avgDoc = Math.round(docScores.reduce((a, b) => a + b, 0) / docScores.length);

  // Clinical
  const monitored = snaps.length;
  const highRisk = snaps.filter((s) => s.risk.level === "high").length;
  const critical = snaps.filter((s) => s.risk.level === "critical").length;

  // Operational — all computed
  const escalations =
    steps.filter((s) => s.status === "escalated").length +
    Object.values(journeys)
      .flat()
      .filter((e) => e.kind === "escalation").length;
  // Steps whose planned time has already elapsed without completion.
  const overdue = steps.filter(
    (s) => s.status !== "done" && s.offsetMin <= 3 && s.dueInMin <= 5,
  ).length;
  const closedLoopCompletion = steps.length
    ? Math.round((doneSteps.length / steps.length) * 100)
    : 0;
  const avgInterventionMin = doneSteps.length
    ? Math.round(
        doneSteps.reduce((a, s) => a + s.offsetMin, 0) / doneSteps.length,
      )
    : 0;

  // Financial
  const readiness = claims.map((c) => claimReadiness(c).score);
  const avgReadiness = Math.round(
    readiness.reduce((a, b) => a + b, 0) / readiness.length,
  );
  const claimsAtRisk = claims.filter(
    (c) => c.status !== "approved" && claimReadiness(c).score < 80,
  ).length;

  // Value — measured only on patients with at least one completed intervention.
  const intervened = snaps.filter((s) => s.plan.some((i) => i.status === "done"));
  const icuAvoided = intervened.filter(
    (s) => s.risk.level === "critical" || s.risk.level === "high",
  ).length;
  const losDaysReduced = Math.round(
    intervened.reduce((a, s) => {
      const sim = simulateWhatIf(s.patient, s.risk);
      return a + (sim.noIntervention.extraLosDays - sim.earlyIntervention.extraLosDays);
    }, 0),
  );
  const docImprovement = intervened.length
    ? Math.max(
        0,
        Math.round(
          intervened.reduce((a, s) => a + s.insurance.docCompleteness, 0) /
            intervened.length -
            (snaps.reduce((a, s) => a + s.insurance.docCompleteness, 0) /
              snaps.length -
              0),
        ),
      )
    : 0;

  // Care Value Score — each component derived from the cohort.
  const elevated = snaps.filter((s) => s.risk.level !== "low");
  const covered = elevated.filter((s) =>
    s.plan.some((i) => i.status === "done" || i.status === "in_progress"),
  );
  const clinicalSafety = elevated.length
    ? Math.round((covered.length / elevated.length) * 100)
    : 100;
  const dueSteps = steps.filter((s) => s.offsetMin <= 3);
  const timeliness = dueSteps.length
    ? Math.round(
        (dueSteps.filter((s) => s.status === "done").length / dueSteps.length) *
          100,
      )
    : 100;

  const careValue = computeCareValue({
    clinicalSafety,
    timeliness,
    documentation: avgDoc,
    operational: closedLoopCompletion,
    insuranceReadiness: avgReadiness,
  });

  return {
    snaps,
    clinical: {
      monitored,
      highRisk,
      critical,
      interventionsPending: pendingSteps.length,
    },
    operational: {
      avgInterventionMin,
      overdue,
      escalations,
      closedLoopCompletion,
    },
    financial: {
      claimsMonitored: claims.length,
      claimsDocPct: avgReadiness,
      claimsAtRisk,
      exposureSar: totalExposure,
    },
    value: {
      icuAvoided,
      losDaysReduced,
      docImprovement,
      careValue,
    },
  };
}

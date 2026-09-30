import type {
  ClinicalRisk,
  InsuranceRisk,
  Patient,
  RiskLevel,
} from "@/lib/types";
import { claims } from "@/lib/data/claims";
import { claimReadiness } from "@/lib/engines/claim-readiness";

/**
 * Insurance Risk Engine — answers "what operational, documentation or
 * financial risk emerges if nothing is done?"
 * All monetary outputs are SIMULATED figures for the prototype.
 */

const lvl = (v: number): RiskLevel =>
  v >= 0.8 ? "critical" : v >= 0.55 ? "high" : v >= 0.3 ? "medium" : "low";

function docCompletenessFor(p: Patient): number {
  // If the patient has a live claim, documentation = its readiness score.
  const linked = claims.find((c) => c.patientId === p.id);
  if (linked) return claimReadiness(linked).score;
  // Otherwise derive from available chart elements.
  let score = 55;
  if (p.labs.length > 0) score += 15;
  if (p.meds.length > 0) score += 10;
  if (p.noteEn.length > 0) score += 10;
  if (p.vitals.length >= 3) score += 10;
  return Math.min(100, score);
}

export function assessInsuranceRisk(
  p: Patient,
  risk: ClinicalRisk,
): InsuranceRisk {
  const docCompleteness = docCompletenessFor(p);

  // Simulated avoidable cost exposure (SAR): scales with clinical risk,
  // ICU escalation potential and documentation gaps.
  const icuPotential = risk.level === "critical" ? 1000 : risk.level === "high" ? 500 : 0;
  const docPenalty = docCompleteness < 70 ? 1200 : docCompleteness < 85 ? 500 : 0;
  const exposureSar =
    Math.round((risk.score * 200 + icuPotential + docPenalty) / 500) * 500;

  const driverKeys: string[] = [];
  if (risk.level === "critical" || risk.level === "high")
    driverKeys.push("icuEscalation");
  if (risk.score >= 50) driverKeys.push("additionalLos");
  if (docCompleteness < 85) driverKeys.push("docGaps");
  if (risk.windowHrs <= 6) driverKeys.push("delayedIntervention");
  if (exposureSar >= 12000) driverKeys.push("claimComplexity");

  return {
    patientId: p.id,
    claimRisk: lvl(exposureSar / 20000),
    docCompleteness,
    docRisk: lvl(1 - docCompleteness / 100),
    exposureSar,
    driverKeys,
  };
}

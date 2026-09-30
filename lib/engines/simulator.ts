import type { ClinicalRisk, Patient, WhatIfScenario } from "@/lib/types";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";

/**
 * What-If Simulator — compares doing nothing vs. early intervention.
 * All outputs are simulated projections for the prototype demo.
 */
export function simulateWhatIf(
  p: Patient,
  risk: ClinicalRisk,
): { noIntervention: WhatIfScenario; earlyIntervention: WhatIfScenario } {
  const ins = assessInsuranceRisk(p, risk);
  const clamp = (n: number) => Math.min(97, Math.max(2, Math.round(n)));

  return {
    noIntervention: {
      icuRiskPct: clamp(risk.score * 0.9),
      extraLosDays: Math.max(1, Math.round(risk.score / 15)),
      exposureSar: Math.round((ins.exposureSar * 1.4) / 500) * 500,
      docCompleteness: Math.max(40, ins.docCompleteness - 25),
    },
    earlyIntervention: {
      icuRiskPct: clamp(risk.score * 0.25),
      extraLosDays: Math.round(risk.score / 45),
      exposureSar: Math.round((ins.exposureSar * 0.45) / 500) * 500,
      docCompleteness: Math.min(98, ins.docCompleteness + 15),
    },
  };
}

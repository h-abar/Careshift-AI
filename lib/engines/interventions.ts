import type {
  ClinicalRisk,
  InterventionStep,
  Patient,
  Role,
} from "@/lib/types";

/**
 * Intervention Orchestration — Risk-to-Action.
 * Turns a clinical risk result into a time-bound plan with an
 * accountable role per step and an ordered escalation chain.
 */

interface PlanTemplate {
  offsetMin: number;
  actionKey: string;
  role: Role;
}

const PLANS: Record<string, PlanTemplate[]> = {
  dka: [
    { offsetMin: 0, actionKey: "assessNow", role: "nurse" },
    { offsetMin: 15, actionKey: "recheckGlucose", role: "nurse" },
    { offsetMin: 30, actionKey: "reviewKetones", role: "physician" },
    { offsetMin: 45, actionKey: "insulinProtocol", role: "physician" },
    { offsetMin: 60, actionKey: "escalationEval", role: "charge_nurse" },
  ],
  sepsis: [
    { offsetMin: 0, actionKey: "assessNow", role: "nurse" },
    { offsetMin: 15, actionKey: "sepsisBundle", role: "nurse" },
    { offsetMin: 30, actionKey: "lactateRepeat", role: "nurse" },
    { offsetMin: 45, actionKey: "physicianReview", role: "physician" },
    { offsetMin: 60, actionKey: "escalationEval", role: "charge_nurse" },
  ],
  bleeding: [
    { offsetMin: 0, actionKey: "assessNow", role: "nurse" },
    { offsetMin: 20, actionKey: "repeatVitals", role: "nurse" },
    { offsetMin: 40, actionKey: "hbCheck", role: "physician" },
    { offsetMin: 60, actionKey: "escalationEval", role: "charge_nurse" },
  ],
  elevated: [
    { offsetMin: 0, actionKey: "assessNow", role: "nurse" },
    { offsetMin: 20, actionKey: "repeatVitals", role: "nurse" },
    { offsetMin: 40, actionKey: "physicianReview", role: "physician" },
  ],
  routine: [{ offsetMin: 0, actionKey: "routineMonitoring", role: "nurse" }],
};

// Steps already executed in the recorded demo journey (P-1042 live demo state).
const PRECOMPLETED: Record<string, number> = {
  "P-1042": 1,
  "P-2031": 1,
};

export function buildInterventionPlan(
  p: Patient,
  risk: ClinicalRisk,
): InterventionStep[] {
  const key =
    risk.level === "low" || risk.conditionKey === "routine"
      ? "routine"
      : (PLANS[risk.conditionKey] ? risk.conditionKey : "elevated");
  const template = PLANS[key];
  const doneUpTo = (PRECOMPLETED[p.id] ?? 0) - 1;

  // Plan started ~3 min ago in the live demo state → remaining time per step.
  const elapsedMin = 3;
  return template.map((t, i) => {
    const done = i <= doneUpTo;
    return {
      id: `${p.id}-IV${i + 1}`,
      patientId: p.id,
      offsetMin: t.offsetMin,
      actionKey: t.actionKey,
      role: t.role,
      status: done ? "done" : i === doneUpTo + 1 ? "in_progress" : "pending",
      dueInMin: done ? 0 : Math.max(2, t.offsetMin - elapsedMin),
      completedAt: done ? "09:30" : undefined,
      escalationChain:
        t.role === "nurse"
          ? ["charge_nurse", "physician"]
          : t.role === "charge_nurse"
            ? ["physician"]
            : ["charge_nurse"],
    };
  });
}

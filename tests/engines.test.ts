import { describe, expect, it } from "vitest";
import { getPatient, patients } from "@/lib/data/patients";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { assessInsuranceRisk } from "@/lib/engines/insurance-risk";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { simulateWhatIf } from "@/lib/engines/simulator";
import { claims } from "@/lib/data/claims";

const p1042 = getPatient("P-1042")!;
const p2031 = getPatient("P-2031")!;

describe("Clinical Risk Engine", () => {
  it("detects the DKA convergence pattern for the hero case", () => {
    const r = assessClinicalRisk(p1042);
    expect(r.conditionKey).toBe("dka");
    expect(r.score).toBe(87);
    expect(r.level).toBe("critical");
    expect(r.windowHrs).toBeLessThanOrEqual(6);
  });

  it("explains the score with normalized contributing factors", () => {
    const r = assessClinicalRisk(p1042);
    expect(r.factors.length).toBeGreaterThan(3);
    expect(r.factors[0].key).toBe("glucose-trend");
    const sum = r.factors.reduce((s, f) => s + f.weight, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  it("detects the sepsis pattern", () => {
    const r = assessClinicalRisk(p2031);
    expect(r.conditionKey).toBe("sepsis");
    expect(["high", "critical"]).toContain(r.level);
  });

  it("keeps stable patients low-risk / routine", () => {
    const r = assessClinicalRisk(getPatient("P-8520")!);
    expect(r.level).toBe("low");
    expect(r.conditionKey).toBe("routine");
  });
});

describe("Insurance Risk Engine", () => {
  it("produces simulated exposure proportional to clinical risk", () => {
    const risk = assessClinicalRisk(p1042);
    const ins = assessInsuranceRisk(p1042, risk);
    expect(ins.exposureSar).toBeGreaterThan(15000);
    expect(["high", "critical"]).toContain(ins.claimRisk);
    expect(ins.driverKeys).toContain("icuEscalation");
  });

  it("flags documentation gaps as drivers", () => {
    const risk = assessClinicalRisk(p1042);
    const ins = assessInsuranceRisk(p1042, risk);
    expect(ins.docCompleteness).toBeLessThan(100);
  });
});

describe("Intervention Orchestration", () => {
  it("builds a time-bound DKA plan with accountable roles", () => {
    const risk = assessClinicalRisk(p1042);
    const plan = buildInterventionPlan(p1042, risk);
    expect(plan.length).toBeGreaterThanOrEqual(4);
    expect(plan[0].actionKey).toBe("assessNow");
    expect(plan.map((s) => s.actionKey)).toContain("insulinProtocol");
    expect(plan.every((s) => s.escalationChain.length > 0)).toBe(true);
  });

  it("gives low-risk patients a single routine step", () => {
    const p = getPatient("P-8520")!;
    const plan = buildInterventionPlan(p, assessClinicalRisk(p));
    expect(plan).toHaveLength(1);
    expect(plan[0].actionKey).toBe("routineMonitoring");
  });
});

describe("Claim Readiness", () => {
  it("scores evidence completeness and lists gaps", () => {
    const c = claims.find((x) => x.id === "CL-88120")!;
    const r = claimReadiness(c);
    expect(r.score).toBeLessThan(100);
    expect(r.checklist.find((x) => x.key === "lab")?.ok).toBe(false);
  });
});

describe("What-If Simulator", () => {
  it("early intervention reduces ICU risk, LOS and exposure", () => {
    const risk = assessClinicalRisk(p1042);
    const { noIntervention, earlyIntervention } = simulateWhatIf(p1042, risk);
    expect(earlyIntervention.icuRiskPct).toBeLessThan(noIntervention.icuRiskPct);
    expect(earlyIntervention.extraLosDays).toBeLessThanOrEqual(
      noIntervention.extraLosDays,
    );
    expect(earlyIntervention.exposureSar).toBeLessThan(noIntervention.exposureSar);
    expect(earlyIntervention.docCompleteness).toBeGreaterThan(
      noIntervention.docCompleteness,
    );
  });
});

describe("Seed data", () => {
  it("has ≥12 patients with vitals and risk flags", () => {
    expect(patients.length).toBeGreaterThanOrEqual(12);
    for (const p of patients) {
      expect(p.vitals.length).toBeGreaterThan(0);
      expect(p.riskFlags.length).toBeGreaterThan(0);
    }
  });
});

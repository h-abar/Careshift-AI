/**
 * 3B2-16 ordering contract (PROMPT A principle) — pure, no DB.
 *
 * Order is driven ONLY by validated indicators: NEWS2 tier/score (RCP
 * 2017), shock index > 1 / lactate >= 2.5 (Althunayyan 2025; Singer
 * 2016), sepsis hour-1 bundle delay (SSC 2021; Seymour 2017).
 * Nurse concern, overdue tasks, stale vitals and qSOFA are context —
 * they must NEVER change the sort.
 */
import { describe, expect, it } from "vitest";
import {
  byPriority,
  computePriority,
  news2Score,
  news2Tier,
  qsofaScore,
} from "@/lib/engines/priority";
import type { Patient, VitalPoint } from "@/lib/types";

const BASE: VitalPoint = { t: "09:00", hr: 80, sbp: 120, rr: 16, temp: 37, spo2: 98 };

function mkPatient(id: string, v: Partial<VitalPoint>, extra?: Partial<Patient>): Patient {
  return {
    id, nameEn: id, nameAr: id, age: 50, sex: "F", room: "1",
    dxKey: "other", attending: "dr", admittedAt: "2026-01-01",
    shift: "day", vitals: [{ ...BASE, ...v }], labs: [],
    riskFlags: [], meds: [], noteEn: "", noteAr: "", ...extra,
  };
}

const overduePlan = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ status: "overdue" as const, id: `s${i}` }));

function snap(id: string, p: Patient, plan = overduePlan(0), triggerMin = 0) {
  return { patient: p, priority: computePriority(p, plan, triggerMin) };
}

describe("NEWS2 math matches RCP 2017 bands", () => {
  it("normal vitals → score 0, tier 0", () => {
    const r = news2Score({ rr: 16, spo2: 98, o2: 0, sbp: 120, hr: 80, temp: 37, conscious: 0 });
    expect(r.score).toBe(0);
    expect(news2Tier(r.score, r.maxSingle)).toBe(0);
  });

  it("single-parameter score of 3 escalates to urgent tier", () => {
    const r = news2Score({ rr: 16, spo2: 98, o2: 0, sbp: 120, hr: 140, temp: 37, conscious: 0 });
    expect(r.maxSingle).toBe(3);
    expect(r.score).toBe(3);
    expect(news2Tier(r.score, r.maxSingle)).toBe(2);
  });

  it("aggregate >= 7 is the emergency tier", () => {
    const r = news2Score({ rr: 26, spo2: 91, o2: 1, sbp: 85, hr: 45, temp: 37, conscious: 0 });
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(news2Tier(r.score, r.maxSingle)).toBe(3);
  });
});

describe("ordering uses only validated indicators", () => {
  it("higher NEWS2 tier always outranks lower, regardless of info signals", () => {
    const stable = mkPatient("A", { rr: 16, spo2: 98 }, {
      riskFlags: ["nurse-concern"], // info only
    });
    const sick = mkPatient("B", { rr: 30, spo2: 90, hr: 135 }); // NEWS2 >= 7
    const list = [snap("A", stable, overduePlan(5)), snap("B", sick)];
    list.sort(byPriority);
    expect(list[0].patient.id).toBe("B");
  });

  it("nurse concern + overdue tasks + stale vitals never change the order", () => {
    const vitals = { rr: 22, spo2: 94 }; // same NEWS2 for both
    const noisy = mkPatient("A", vitals, { riskFlags: ["nurse-concern"] });
    const quiet = mkPatient("B", vitals);
    const a = snap("A", noisy, overduePlan(9), 0);
    const b = snap("B", quiet, overduePlan(0), 0);
    // identical validated signals → identical sortKey → id tiebreak
    expect(a.priority!.sortKey).toBe(b.priority!.sortKey);
    const list = [b, a].sort(byPriority);
    expect(list[0].patient.id).toBe("A"); // "A" < "B" lexicographically
  });

  it("shock index > 1 / lactate >= 2.5 breaks a NEWS2 tie", () => {
    const vitals = { rr: 22, spo2: 94, hr: 130, sbp: 110 }; // SI > 1
    const shocky = mkPatient("A", vitals, {
      labs: [{ key: "lactate", value: "3.0", flag: "high" }],
    });
    const calm = mkPatient("B", { ...vitals, hr: 100, sbp: 130 }); // SI < 1
    expect(computePriority(shocky, [], 0)!.shockSuspect).toBe(true);
    expect(computePriority(calm, [], 0)!.shockSuspect).toBe(false);
    const list = [snap("B", calm), snap("A", shocky)].sort(byPriority);
    expect(list[0].patient.id).toBe("A");
  });

  it("hour-1 bundle delay breaks remaining ties", () => {
    const vitals = { rr: 30, spo2: 90, hr: 135 }; // NEWS2 >= 7 → bundle indicated
    const waited = mkPatient("A", vitals);
    const fresh = mkPatient("B", vitals);
    const a = snap("A", waited, [], 180); // 120 min overdue
    const b = snap("B", fresh, [], 30); // not yet overdue
    expect(a.priority!.bundleOverdueMin).toBe(120);
    expect(b.priority!.bundleOverdueMin).toBe(0);
    const list = [b, a].sort(byPriority);
    expect(list[0].patient.id).toBe("A");
  });

  it("qSOFA >= 2 is context only and cannot reorder", () => {
    // qSOFA-positive but lower NEWS2 vs qSOFA-negative but higher NEWS2
    const q2 = mkPatient("A", { rr: 24, sbp: 95 }, { riskFlags: ["altered-mentation"] });
    const q0 = mkPatient("B", { rr: 30, spo2: 90, hr: 135 });
    const pa = computePriority(q2, [], 0)!;
    const pb = computePriority(q0, [], 0)!;
    expect(qsofaScore({ rr: 24, sbp: 95, conscious: 3 })).toBe(3);
    expect(pa.qsofa).toBeGreaterThanOrEqual(2);
    expect(pb.qsofa).toBeLessThan(2); // rr>=22 alone, below the alert cut
    const list = [snap("A", q2), snap("B", q0)].sort(byPriority);
    expect(list[0].patient.id).toBe("B");
  });
});

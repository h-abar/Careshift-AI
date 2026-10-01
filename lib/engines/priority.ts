import type { Patient, InterventionStep } from "@/lib/types";

/**
 * Evidence-based patient ordering (PROMPT A principle / 3B2-16).
 *
 * ORDER IS DRIVEN ONLY BY VALIDATED INDICATORS:
 *   1. NEWS2 tier (RCP 2017)
 *   2. shock index > 1 and/or lactate >= 2.5 (Althunayyan 2025; Singer 2016)
 *   3. sepsis hour-1 bundle elapsed time (SSC 2021; Seymour 2017)
 *
 * DISPLAYED BUT NEVER REORDERING: nurse concern, I-PASS severity,
 * overdue tasks, stale vitals. qSOFA/Charlson are context-only.
 *
 * The pure scoring lives here for UI use; the SAME definitions are
 * executed via the knowledge-base rules (lib/server/kb.ts) so every
 * computation is versioned and auditable. Keep the two in sync — the
 * tests assert parity.
 */

export type News2Tier = 0 | 1 | 2 | 3; // routine | low | urgent | emergency

export interface News2Inputs {
  rr: number;
  spo2: number;
  o2: 0 | 1;
  sbp: number;
  hr: number;
  temp: number;
  conscious: 0 | 3; // 0 = alert; 3 = new confusion / V / P / U
}

export interface PrioritySignals {
  news2: number;
  tier: News2Tier;
  maxSingle: number;
  shockIndex: number;
  shockSuspect: boolean;
  lactate: number | null;
  bundleIndicated: boolean;
  bundleOverdueMin: number;
  sortKey: number;
  // context-only (never reorder)
  qsofa: number;
  info: {
    overdueTasks: number;
    vitalsStaleMin: number | null;
    nurseConcern: boolean;
  };
}

/* ── Pure NEWS2 math — mirrors knowledge/seed/rules.json exactly ── */

export function news2Band(v: number, bands: [number, number][]): number {
  for (const [max, pts] of bands) if (v <= max) return pts;
  return bands.length ? bands[bands.length - 1][1] : 0;
}

export function news2Score(v: News2Inputs): { score: number; maxSingle: number } {
  const parts = [
    news2Band(v.rr, [[8, 3], [11, 1], [20, 0], [24, 2], [Infinity, 3]]),
    news2Band(v.spo2, [[91, 3], [93, 2], [95, 1], [Infinity, 0]]),
    v.o2 ? 2 : 0,
    news2Band(v.sbp, [[90, 3], [100, 2], [110, 1], [219, 0], [Infinity, 3]]),
    news2Band(v.hr, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2], [Infinity, 3]]),
    news2Band(v.temp, [[35, 3], [36, 1], [38, 0], [39, 1], [Infinity, 2]]),
    v.conscious > 0 ? 3 : 0,
  ];
  return {
    score: parts.reduce((a, b) => a + b, 0),
    maxSingle: Math.max(...parts),
  };
}

export function news2Tier(score: number, maxSingle: number): News2Tier {
  if (score >= 7) return 3;
  if (score >= 5 || maxSingle >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function qsofaScore(v: Pick<News2Inputs, "rr" | "sbp" | "conscious">) {
  return (v.rr >= 22 ? 1 : 0) + (v.sbp <= 100 ? 1 : 0) + (v.conscious > 0 ? 1 : 0);
}

/* ── Inputs from the patient record ── */

export function latestVitals(p: Patient): News2Inputs | null {
  const v = p.vitals[p.vitals.length - 1];
  if (!v) return null;
  return {
    rr: v.rr,
    spo2: v.spo2,
    // No supplemental-O2 field in the record — treat unrecorded as room air.
    o2: 0,
    sbp: v.sbp,
    hr: v.hr,
    temp: v.temp,
    // No AVPU field — alert unless a risk flag marks altered mentation.
    conscious: p.riskFlags.includes("altered-mentation") ? 3 : 0,
  };
}

export function lactateOf(p: Patient): number | null {
  const l = p.labs.find((x) => x.key === "lactate");
  if (!l) return null;
  const n = parseFloat(l.value);
  return Number.isFinite(n) ? n : null;
}

/** Minutes between the charted last-vitals clock label and `now`. */
export function vitalsStaleMin(p: Patient, now = new Date()): number | null {
  const v = p.vitals[p.vitals.length - 1];
  const m = /^(\d{1,2}):(\d{2})$/.exec(v?.t ?? "");
  if (!m) return null;
  const at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const diff = Math.round((now.getTime() - at.getTime()) / 60000);
  return diff < 0 ? null : diff;
}

/**
 * Pure priority computation — mirrors the seeded rules. `triggeredMin`
 * = minutes since the deterioration trigger (bundle clock start).
 */
export function computePriority(
  p: Patient,
  plan: Pick<InterventionStep, "status">[],
  triggeredMin: number,
  now = new Date(),
): PrioritySignals | null {
  const v = latestVitals(p);
  if (!v) return null;
  const { score, maxSingle } = news2Score(v);
  const tier = news2Tier(score, maxSingle);
  const lactate = lactateOf(p);
  const si = v.sbp > 0 ? v.hr / v.sbp : 0;
  const shockSuspect = si > 1 || (lactate !== null && lactate >= 2.5);
  const bundleIndicated = score >= 7 || shockSuspect;
  const bundleOverdueMin = bundleIndicated ? Math.max(0, triggeredMin - 60) : 0;
  const sortKey =
    tier * 1_000_000 + score * 10_000 + (shockSuspect ? 1000 : 0) +
    Math.min(bundleOverdueMin, 999);
  return {
    news2: score,
    tier,
    maxSingle,
    shockIndex: Math.round(si * 100) / 100,
    shockSuspect,
    lactate,
    bundleIndicated,
    bundleOverdueMin,
    sortKey,
    qsofa: qsofaScore(v),
    info: {
      overdueTasks: plan.filter((s) => s.status === "overdue").length,
      vitalsStaleMin: vitalsStaleMin(p, now),
      nurseConcern: p.riskFlags.includes("nurse-concern"),
    },
  };
}

/** Comparator: higher sortKey first; id breaks ties deterministically. */
export function byPriority(
  a: { priority: PrioritySignals | null; patient: { id: string } },
  b: { priority: PrioritySignals | null; patient: { id: string } },
) {
  const ka = a.priority?.sortKey ?? -1;
  const kb = b.priority?.sortKey ?? -1;
  if (ka !== kb) return kb - ka;
  return a.patient.id.localeCompare(b.patient.id);
}

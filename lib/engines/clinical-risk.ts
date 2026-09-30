import type { ClinicalRisk, Patient, RiskFactor, RiskLevel } from "@/lib/types";

/**
 * Clinical Risk Engine — answers "what could happen to this patient?"
 * Rule-based, fully explainable prototype standing in for an ML model:
 * every signal contributes visible points, and the matched condition
 * pattern names the deterioration hypothesis (never a diagnosis).
 */

const SIGNALS: Record<string, { points: number }> = {
  "glucose-trend": { points: 28 },
  ketones: { points: 22 },
  "insulin-omission": { points: 11 },
  "abdominal-pain": { points: 9 },
  tachycardia: { points: 10 },
  fever: { points: 12 },
  tachypnea: { points: 11 },
  wbc: { points: 11 },
  lactate: { points: 12 },
  "bp-drop": { points: 13 },
  "spo2-drop": { points: 8 },
  "hb-drop": { points: 10 },
  "rebleed-watch": { points: 14 },
  "pain-score": { points: 6 },
  age65: { points: 5 },
  "history-dm": { points: 7 },
  "history-cardiac": { points: 7 },
};

// Deterioration patterns: which signals converge into each hypothesis.
const PATTERNS: Record<string, string[]> = {
  dka: ["glucose-trend", "ketones", "insulin-omission", "abdominal-pain", "history-dm"],
  sepsis: ["fever", "wbc", "lactate", "tachycardia", "tachypnea", "bp-drop"],
  respiratory: ["spo2-drop", "tachypnea"],
  bleeding: ["hb-drop", "rebleed-watch", "tachycardia", "bp-drop"],
  cardiac: ["history-cardiac", "bp-drop", "tachycardia"],
};

export function levelOf(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function assessClinicalRisk(p: Patient): ClinicalRisk {
  const matched = p.riskFlags.filter((f) => SIGNALS[f]);
  const score = Math.min(
    97,
    matched.reduce((s, f) => s + SIGNALS[f].points, 0),
  );

  // Pick the deterioration pattern with the strongest signal convergence.
  let bestKey = "deterioration";
  let bestPts = 0;
  for (const [key, needs] of Object.entries(PATTERNS)) {
    const pts = matched
      .filter((f) => needs.includes(f))
      .reduce((s, f) => s + SIGNALS[f].points, 0);
    if (pts > bestPts) {
      bestPts = pts;
      bestKey = key;
    }
  }
  if (score < 25) bestKey = "routine";

  // Explainable factors: normalize matched signal weights to ~100%.
  const weights = matched
    .map((f) => ({ key: f, w: SIGNALS[f].points }))
    .sort((a, b) => b.w - a.w);
  const total = weights.reduce((s, x) => s + x.w, 0) || 1;
  const factors: RiskFactor[] = weights.map((x) => ({
    key: x.key,
    weight: Math.round((x.w / total) * 100),
  }));
  // fix rounding drift on the top factor
  const drift = 100 - factors.reduce((s, f) => s + f.weight, 0);
  if (factors.length) factors[0].weight += drift;

  const level = levelOf(score);
  const windowHrs =
    level === "critical" ? 4 : level === "high" ? 6 : level === "medium" ? 12 : 24;

  // Signal confidence: rises with converging evidence (pattern coverage +
  // number of matched signals), deterministic for the prototype.
  const coverage = bestPts / Math.max(score, 1);
  const confidence = Math.min(
    98,
    Math.round(55 + coverage * 25 + Math.min(matched.length, 6) * 3),
  );

  return {
    patientId: p.id,
    score,
    level,
    conditionKey: bestKey,
    factors,
    windowHrs,
    confidence,
  };
}

import type { CareValueScore } from "@/lib/types";

/**
 * Care Value Score™ — transparent composite (weights published, not a
 * black box). Inputs are the hospital-level sub-scores 0–100.
 */
export const CVS_WEIGHTS = {
  clinicalSafety: 0.3,
  timeliness: 0.2,
  documentation: 0.2,
  operational: 0.15,
  insuranceReadiness: 0.15,
} as const;

export function computeCareValue(input: {
  clinicalSafety: number;
  timeliness: number;
  documentation: number;
  operational: number;
  insuranceReadiness: number;
}): CareValueScore {
  const total = Math.round(
    input.clinicalSafety * CVS_WEIGHTS.clinicalSafety +
      input.timeliness * CVS_WEIGHTS.timeliness +
      input.documentation * CVS_WEIGHTS.documentation +
      input.operational * CVS_WEIGHTS.operational +
      input.insuranceReadiness * CVS_WEIGHTS.insuranceReadiness,
  );
  return { total, ...input };
}

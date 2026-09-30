import type { Claim } from "@/lib/types";
import { EVIDENCE_KEYS } from "@/lib/data/claims";

/**
 * Claim Readiness — "prevent avoidable claim friction".
 * Scores how complete a claim's digital evidence trail is and lists
 * exactly which documentation items are missing.
 */
export function claimReadiness(claim: Claim): {
  score: number;
  checklist: { key: string; ok: boolean }[];
} {
  const checklist = EVIDENCE_KEYS.map((key) => ({
    key,
    ok: claim.evidence.includes(key),
  }));
  const base = Math.round((claim.evidence.length / EVIDENCE_KEYS.length) * 100);
  const score = Math.max(0, base - claim.frictionKeys.length * 5);
  return { score, checklist };
}

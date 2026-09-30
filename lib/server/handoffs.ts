import { prisma } from "@/lib/server/prisma";
import { buildSbar } from "@/lib/engines/sbar";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { serverT } from "@/lib/server/i18n";
import type { Patient } from "@/lib/types";

/** Checklist keys the outgoing staff MUST tick before sign-off. */
export const REQUIRED_CHECKLIST = [
  "criticalReviewed",
  "pendingReviewed",
  "escalationsReviewed",
  "recommendationsReviewed",
] as const;

/** Auto-generated, dual-language SBAR for a patient (editable later). */
export function genSbar(p: Patient) {
  const risk = assessClinicalRisk(p);
  return {
    ar: buildSbar(p, risk, serverT("ar"), "ar"),
    en: buildSbar(p, risk, serverT("en"), "en"),
  };
}

/** Append a persisted timeline event for a handoff. */
export async function handoffEvent(
  handoffId: string,
  actorId: string,
  action: string,
  detail = "",
) {
  await prisma.handoffEvent.create({
    data: { handoffId, actorId, action, detail },
  });
}

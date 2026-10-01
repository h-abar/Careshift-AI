/**
 * C6 — simulated payer adjudication + event-driven appeal evidence.
 *
 * The simulated payer NEVER invents codes: a denial carries the first
 * consistency-check issue whose seCode resolves to an imported official
 * NPHIES adjudication-reason row; a clean claim is approved. Appeal
 * packages are built ONLY from existing ClinicalEvent ids — fabricated
 * ids are rejected.
 */
import { prisma } from "@/lib/server/prisma";
import { runClaimChecks } from "@/lib/server/claim-checks";

if (typeof window !== "undefined") {
  throw new Error("lib/server/adjudication.ts is server-only");
}

export const ADJUDICATION_LABEL =
  "Simulated payer adjudication — not the real NPHIES platform";

/** Which event types answer each official code (reverse map — only
 *  codes present in the imported list are ever emitted). */
export const CODE_EVIDENCE: Record<string, string[]> = {
  "BE-1-2": ["order", "procedure", "intervention_completed", "medication_administered", "lab_result"],
  "SE-1-9": ["order", "lab_result", "procedure", "medication_administered"],
  "SE-1-1": ["vital_set"],
  "SE-1-3": ["documentation_entry"],
  "SE-1-6": ["lab_result"],
  "SE-1-7": ["documentation_entry"],
  "SE-1-8": ["order"],
  "AD-1-7": ["transfer"],
  "MN-1-1": ["score_computed", "alert_raised", "escalation", "intervention_completed"],
};

export async function simulateAdjudication(claimId: string) {
  const checks = await runClaimChecks(claimId);
  const coded = checks.issues.find((i) => i.seCode);
  const decision = coded ? "denied" : "approved";
  const code = coded?.seCode ?? null;

  const claim = await prisma.insuranceClaim.update({
    where: { id: claimId },
    data: {
      status: decision === "denied" ? "denied" : "approved",
      nphiesCode: code,
      denialCode: code ? mapToInternalDenial(code) : null,
    },
  });
  return { decision, reasonCode: code, label: ADJUDICATION_LABEL, checks, claim };
}

/** Map a NPHIES code to an internal deny.* i18n bucket (display only). */
function mapToInternalDenial(se: string): string {
  if (se.startsWith("SE-1")) return "missing_docs";
  if (se === "BE-1-2") return "medical_necessity";
  if (se === "AD-2-5") return "timely_filing";
  if (se === "CV-1") return "coverage_excluded";
  return "missing_docs";
}

export interface AppealEvidence {
  code: string | null;
  codeLabel: string | null;
  /** event types that would answer the code but are missing */
  missingEventTypes: string[];
  /** existing events that DO answer the code — appeal ammunition */
  answeringEvents: { id: string; type: string; occurredAt: string }[];
}

/** For a denied claim: which events are missing vs which already
 *  answer the denial code. */
export async function appealEvidence(claimId: string): Promise<AppealEvidence> {
  const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw new Error("claim not found");
  const code = claim.nphiesCode;
  if (!code) return { code: null, codeLabel: null, missingEventTypes: [], answeringEvents: [] };

  const term = await prisma.terminology.findUnique({
    where: {
      provider_system_code: {
        provider: "nphies", system: "adjudication-reason", code,
      },
    },
  });
  const want = CODE_EVIDENCE[code] ?? [];
  const events = await prisma.clinicalEvent.findMany({
    where: { patientId: claim.patientId ?? "__none__", type: { in: want } },
    orderBy: { occurredAt: "asc" },
    select: { id: true, type: true, occurredAt: true },
  });
  const present = new Set(events.map((e) => e.type));
  return {
    code,
    codeLabel: term?.displayEn ?? null,
    missingEventTypes: want.filter((t) => !present.has(t)),
    answeringEvents: events.map((e) => ({
      id: e.id, type: e.type, occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

/** Validate that every claimed appeal event exists and belongs to the
 *  claim's patient — the appeal may only contain real events. */
export async function validateAppealEventIds(
  claimId: string, eventIds: string[],
): Promise<{ ok: boolean; bad: string[] }> {
  const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim) return { ok: false, bad: eventIds };
  const rows = eventIds.length
    ? await prisma.clinicalEvent.findMany({
        where: { id: { in: eventIds }, patientId: claim.patientId ?? "__none__" },
        select: { id: true },
      })
    : [];
  const okSet = new Set(rows.map((r) => r.id));
  return { ok: eventIds.every((id) => okSet.has(id)), bad: eventIds.filter((id) => !okSet.has(id)) };
}

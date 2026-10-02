/**
 * C4 — bidirectional consistency checks before claim submission.
 * NEVER auto-changes codes. Maps documentation gaps to OFFICIAL NPHIES
 * adjudication-reason codes that were actually imported (verified
 * against Terminology rows; missing import = no code, never guessed).
 * Readiness % uses prototype weights — labeled "Rule-based checks,
 * prototype".
 */
import { prisma } from "@/lib/server/prisma";
import { env } from "@/lib/server/env";

if (typeof window !== "undefined") {
  throw new Error("lib/server/claim-checks.ts is server-only");
}

export const CHECKS_LABEL = "Rule-based checks, prototype";

export interface CheckIssue {
  kind:
    | "billed_not_lived"
    | "quantity_exceeds_events"
    | "level_of_care_unsupported"
    | "lived_not_billed"
    | "doc_gap"
    | "timing_service_outside_encounter"
    | "timing_event_after_claim"
    | "timing_late_entry"
    | "missing_code";
  /** official NPHIES adjudication-reason code — null when none maps. */
  seCode: string | null;
  lineId?: string;
  eventType?: string; // the missing/extra event type behind a doc gap
  detail: string;
}

/** Official codes used — verified present in the imported
 *  nphies-adjudication-reason snapshot (71 codes, v1.0.0). */
const SE = {
  NOT_PERFORMED: "BE-1-2", // Service was not performed
  QUANTITY: "SE-1-9", // Quantity of service/procedure is inappropriate or missing
  VITALS: "SE-1-1", // Vital signs are inadequate or missing
  INVESTIGATION: "SE-1-6", // Investigation result is inadequate or missing
  DIAGNOSIS: "SE-1-7", // Type of diagnosis is inadequate or missing
  TREATMENT: "SE-1-8", // Treatment plan is inadequate or missing
  ENCOUNTER_MISMATCH: "AD-1-7", // Service inconsistent with encounter type
} as const;

/** Confirm a code exists in the imported official list — else null. */
async function seCode(code: string): Promise<string | null> {
  const row = await prisma.terminology.findUnique({
    where: {
      provider_system_code: {
        provider: "nphies",
        system: "adjudication-reason",
        code,
      },
    },
  });
  return row ? code : null;
}

/* prototype weights — configurable review heuristic, not a standard */
const W = {
  billed_not_lived: 25, quantity_exceeds_events: 15,
  level_of_care_unsupported: 20, lived_not_billed: 10,
  doc_gap: 15, missing_code: 10,
  timing_service_outside_encounter: 10, timing_event_after_claim: 10,
  timing_late_entry: 5,
} as const;

export interface ChecksResult {
  label: typeof CHECKS_LABEL;
  readiness: number; // 0-100
  issues: CheckIssue[];
  counts: {
    lines: number; eventBackedLines: number;
    billedNotLived: number; livedNotBilled: number; docGaps: number;
    timing: number;
  };
}

export async function runClaimChecks(claimId: string): Promise<ChecksResult> {
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: claimId }, include: { lines: true },
  });
  if (!claim) throw new Error("claim not found");
  const events = await prisma.clinicalEvent.findMany({
    where: { patientId: claim.patientId ?? "__none__" },
    orderBy: { occurredAt: "asc" },
  });
  const evById = new Map(events.map((e) => [e.id, e]));
  const issues: CheckIssue[] = [];

  // Encounter bounds = event store span (demo has one encounter/patient)
  const encStart = events[0]?.occurredAt ?? null;
  const encEnd = events[events.length - 1]?.occurredAt ?? null;
  const claimCreated = claim.updatedAt; // claim rows carry updatedAt
  const lateMin = Number(env().LATE_ENTRY_MINUTES ?? 240);

  /* ── direction 1: billed but not lived ── */
  for (const l of claim.lines) {
    const ids = JSON.parse(l.eventIdsJson) as string[];
    const matched = ids.filter((id) => evById.has(id));
    if (matched.length === 0) {
      issues.push({
        kind: "billed_not_lived",
        seCode: await seCode(SE.NOT_PERFORMED),
        lineId: l.id,
        detail: l.eventBacked
          ? "line references no existing events"
          : `manual line — ${l.manualReason ?? "no reason recorded"}`,
      });
      continue;
    }
    if (l.quantity > matched.length && l.kind !== "bed_day") {
      issues.push({
        kind: "quantity_exceeds_events",
        seCode: await seCode(SE.QUANTITY),
        lineId: l.id,
        detail: `quantity ${l.quantity} > ${matched.length} supporting event(s)`,
      });
    }
    if (l.kind === "bed_day") {
      const icuTransfer = events.some(
        (e) => e.type === "transfer" && /icu/i.test(String(e.payloadJson)),
      );
      if (/icu/i.test(l.description) && !icuTransfer) {
        issues.push({
          kind: "level_of_care_unsupported",
          seCode: await seCode(SE.ENCOUNTER_MISMATCH),
          lineId: l.id,
          detail: "level of care billed without supporting transfer events",
        });
      }
    }
    if (!l.code) {
      issues.push({
        kind: "missing_code", seCode: null, lineId: l.id,
        detail: "claim line has no code — flagged, never guessed",
      });
    }
    /* timing: service dates outside the encounter window */
    if (l.serviceStart && encStart && encEnd) {
      if (l.serviceStart < encStart || (l.serviceEnd ?? l.serviceStart) > encEnd) {
        issues.push({
          kind: "timing_service_outside_encounter", seCode: null,
          lineId: l.id,
          detail: "service dates outside the encounter's event span",
        });
      }
    }
    /* timing: supporting events recorded after claim was last updated */
    const after = matched.filter(
      (id) => evById.get(id)!.recordedAt > claimCreated,
    );
    if (after.length) {
      issues.push({
        kind: "timing_event_after_claim", seCode: null, lineId: l.id,
        detail: `${after.length} supporting event(s) recorded after claim update`,
      });
    }
    const late = matched.filter((id) => evById.get(id)!.lateEntry);
    if (late.length) {
      issues.push({
        kind: "timing_late_entry", seCode: null, lineId: l.id,
        detail: `${late.length} supporting event(s) are late entries (> ${lateMin} min, prototype setting)`,
      });
    }
  }

  /* ── direction 2: lived but not billed ── */
  const coveredIds = new Set(
    claim.lines.flatMap((l) => JSON.parse(l.eventIdsJson) as string[]),
  );
  const BILLABLE: Record<string, string> = {
    lab_result: "lab", medication_administered: "medication",
    procedure: "procedure", intervention_completed: "service",
    transfer: "bed_day",
  };
  for (const e of events) {
    const kind = BILLABLE[e.type];
    if (!kind || coveredIds.has(e.id)) continue;
    issues.push({
      kind: "lived_not_billed", seCode: null,
      eventType: e.type,
      detail: `${e.type} event ${e.id.slice(-6)} supports a ${kind} line that is not billed`,
    });
  }

  /* ── documentation gaps → official NPHIES SE codes ── */
  const hasType = (t: string) => events.some((e) => e.type === t);
  if (events.length && !hasType("vital_set")) {
    issues.push({
      kind: "doc_gap", seCode: await seCode(SE.VITALS),
      eventType: "vital_set",
      detail: "no vital-sign events on the encounter",
    });
  }
  if (claim.lines.some((l) => l.kind === "lab") && !hasType("lab_result")) {
    issues.push({
      kind: "doc_gap", seCode: await seCode(SE.INVESTIGATION),
      eventType: "lab_result",
      detail: "lab lines billed but no lab_result events documented",
    });
  }
  if (claim.dxKey) {
    const docSupport = events.some(
      (e) =>
        e.type === "documentation_entry" &&
        e.actorRole === "doctor" &&
        e.payloadJson.includes("diagnosis"),
    );
    if (!docSupport) {
      issues.push({
        kind: "doc_gap", seCode: await seCode(SE.DIAGNOSIS),
        eventType: "documentation_entry",
        detail: `diagnosis ${claim.dxKey} not supported by a physician documentation event`,
      });
    }
  }
  if (events.length && !hasType("order")) {
    issues.push({
      kind: "doc_gap", seCode: await seCode(SE.TREATMENT),
      eventType: "order",
      detail: "no order events — treatment plan undocumented",
    });
  }

  const counts = {
    lines: claim.lines.length,
    eventBackedLines: claim.lines.filter((l) => l.eventBacked).length,
    billedNotLived: issues.filter((i) =>
      ["billed_not_lived", "quantity_exceeds_events", "level_of_care_unsupported"].includes(i.kind),
    ).length,
    livedNotBilled: issues.filter((i) => i.kind === "lived_not_billed").length,
    docGaps: issues.filter((i) => i.kind === "doc_gap").length,
    timing: issues.filter((i) => i.kind.startsWith("timing_")).length,
  };
  const penalty = issues.reduce((s, i) => s + W[i.kind], 0);
  return {
    label: CHECKS_LABEL,
    readiness: Math.max(0, 100 - penalty),
    issues,
    counts,
  };
}

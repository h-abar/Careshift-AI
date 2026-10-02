/**
 * C2 — shared event taxonomy: the ClinicalEvent type vocabulary and the
 * filter categories used by the timeline API + UI (client/server safe —
 * no imports beyond types).
 */
export const EVENT_TYPES = [
  "vital_set",
  "score_computed",
  "alert_raised",
  "alert_acknowledged",
  "escalation",
  "intervention_started",
  "intervention_completed",
  "order",
  "medication_administered",
  "lab_result",
  "procedure",
  "transfer",
  "handoff_started",
  "handoff_signed",
  "handoff_accepted",
  "documentation_entry",
  "priority_snapshot",
  "priority_seen",
  "action_item_created",
  "action_item_completed",
  "claim_status",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Timeline filter buckets — an event may appear in several. */
export type EventCategory =
  | "clinical"
  | "nursing"
  | "doctor"
  | "medication"
  | "billing";

const CLINICAL = new Set<EventType>([
  "vital_set", "score_computed", "alert_raised", "alert_acknowledged",
  "escalation", "lab_result", "procedure", "transfer",
  "priority_snapshot", "documentation_entry",
]);
const NURSING = new Set<EventType>([
  "vital_set", "handoff_started", "handoff_signed", "handoff_accepted",
  "intervention_started", "intervention_completed",
  "alert_acknowledged", "medication_administered",
  "action_item_created", "action_item_completed", "documentation_entry",
]);
const PHYSICIAN = new Set<EventType>([
  "order", "procedure", "escalation", "alert_acknowledged",
  "documentation_entry", "transfer",
]);
const MEDICATION = new Set<EventType>([
  "order", "medication_administered",
]);
/** Billing-relevant event types — also the insurer-visible subset (C5). */
export const BILLING_TYPES = new Set<EventType>([
  "order", "medication_administered", "lab_result", "procedure",
  "transfer", "intervention_started", "intervention_completed",
  "alert_raised", "escalation", "claim_status", "documentation_entry",
]);

export function eventCategories(e: {
  type: string;
  actorRole: string;
  payload?: Record<string, unknown>;
}): EventCategory[] {
  const t = e.type as EventType;
  const cats: EventCategory[] = [];
  if (CLINICAL.has(t)) cats.push("clinical");
  if (NURSING.has(t)) cats.push("nursing");
  if (PHYSICIAN.has(t)) cats.push("doctor");
  if (
    MEDICATION.has(t) &&
    (t === "medication_administered" ||
      (e.payload?.orderKind as string) === "medication")
  ) cats.push("medication");
  if (BILLING_TYPES.has(t)) cats.push("billing");
  // role-based refinement — a nurse documenting shows under nursing too
  if (e.actorRole === "nurse" && !cats.includes("nursing"))
    cats.push("nursing");
  if (e.actorRole === "doctor" && !cats.includes("doctor"))
    cats.push("doctor");
  return cats;
}

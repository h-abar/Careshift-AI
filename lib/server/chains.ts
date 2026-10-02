/**
 * C9 — the SAME event store that builds the claim also captures the
 * safety story: handoffs, deterioration signals, priority snapshots and
 * the closed loop  risk → alert → ack → intervention → documentation →
 * claim. This module (a) emits live events from the existing routes,
 * (b) derives the closed-loop chain per patient with gap detection, and
 * (c) computes safety KPIs.
 *
 * Thresholds are PROTOTYPE SETTINGS, env-configurable — no invented
 * clinical targets.
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";

if (typeof window !== "undefined") {
  throw new Error("lib/server/chains.ts is server-only");
}

/** Prototype settings — env-overridable minutes. */
export const CHAIN_ACK_MINUTES = Number(
  process.env.CHAIN_ACK_MINUTES ?? 15,
);
export const CHAIN_SEEN_MINUTES = Number(
  process.env.CHAIN_SEEN_MINUTES ?? 60,
);

/* ── live emitters (called from the existing routes) ── */

export async function emitInterventionEvent(
  patientId: string, stepId: string, status: string,
  actor: { id: string; role: string }, note?: string,
) {
  const type =
    status === "in_progress" ? "intervention_started"
    : status === "done" ? "intervention_completed"
    : status === "escalated" ? "escalation"
    : "documentation_entry";
  await appendEvent({
    patientId, type, occurredAt: new Date(),
    actorUserId: actor.id, actorRole: actor.role,
    payload: { stepId, status, note: note ?? "", simulated: "Simulated" },
    sourceRecordId: `${stepId}:${type}:${Date.now()}`,
  });
}

export async function emitHandoffEvent(
  handoffId: string, patientIds: string[], action: string,
  actor: { id: string; role: string },
) {
  const type =
    action === "created" ? "handoff_started"
    : action === "signed_off" ? "handoff_signed"
    : action === "accepted" || action === "completed" ? "handoff_accepted"
    : "documentation_entry";
  for (const patientId of patientIds) {
    await appendEvent({
      patientId, type, occurredAt: new Date(),
      actorUserId: actor.id, actorRole: actor.role,
      payload: { handoffId, handoffAction: action, simulated: "Simulated" },
      sourceRecordId: `live:${handoffId}:${action}:${patientId}`,
    });
  }
}

export async function emitScoreEvent(
  patientId: string,
  risk: { score: number; level: string; conditionKey: string },
  actorId: string | null | undefined,
) {
  await appendEvent({
    patientId, type: "score_computed", occurredAt: new Date(),
    actorUserId: actorId ?? undefined, actorRole: "system",
    payload: { ...risk, simulated: "Simulated" },
    sourceRecordId: `live:score:${patientId}:${Date.now()}`,
  });
}

export async function emitAlertEvent(
  patientId: string, level: string, actorId: string | null | undefined,
) {
  await appendEvent({
    patientId, type: "alert_raised", occurredAt: new Date(),
    actorUserId: actorId ?? undefined, actorRole: "system",
    payload: { level, simulated: "Simulated" },
    sourceRecordId: `live:alert:${patientId}:${Date.now()}`,
  });
}

/** Priority-list snapshot — stores the validated-indicator inputs only;
 *  informational signals (nurse concern, overdue tasks) never rank. */
export async function emitPrioritySnapshot(
  patientId: string, rank: number,
  signals: { news2: number | null; tier: number; sortKey: number },
  actorId: string | null | undefined,
) {
  await appendEvent({
    patientId, type: "priority_snapshot", occurredAt: new Date(),
    actorUserId: actorId ?? undefined, actorRole: "system",
    payload: { rank, ...signals, simulated: "Simulated" },
    sourceRecordId: `live:prio:${patientId}:${Date.now()}`,
  });
}

/** Carry-over: on handoff acceptance, each open action item becomes an
 *  action_item_created event owned by the receiver. */
export async function carryOverActionItems(
  handoffId: string, patientIds: string[],
  receiver: { id: string; role: string },
  openItems: string[],
) {
  for (const patientId of patientIds) {
    for (const item of openItems) {
      await appendEvent({
        patientId, type: "action_item_created", occurredAt: new Date(),
        actorUserId: receiver.id, actorRole: receiver.role,
        payload: {
          handoffId, item, ownerUserId: receiver.id,
          simulated: "Simulated",
        },
        sourceRecordId: `live:carry:${handoffId}:${patientId}:${item}`,
      });
    }
  }
}

/* ── closed-loop chain ── */

export interface ChainStep {
  step:
    | "risk" | "alert" | "acknowledged" | "decision" | "intervention"
    | "completed" | "reassessed" | "documented" | "claim";
  status: "ok" | "gap" | "na";
  eventId?: string;
  at?: string;
  note?: string;
}

/**
 * Derive the deterioration closed loop for a patient. A step is a "gap"
 * when its required event is missing while an earlier step fired.
 */
export async function closedLoopChain(patientId: string): Promise<{
  steps: ChainStep[];
  gaps: number;
  label: string;
}> {
  const events = await prisma.clinicalEvent.findMany({
    where: { patientId },
    orderBy: { occurredAt: "asc" },
  });
  const first = (t: string | string[]) =>
    events.find((e) =>
      Array.isArray(t) ? t.includes(e.type) : e.type === t);

  const risk = first("score_computed");
  const alert = events.find(
    (e) => e.type === "alert_raised" || e.type === "escalation",
  );
  const ack = alert
    ? events.find(
        (e) => e.type === "alert_acknowledged" &&
               e.occurredAt >= alert.occurredAt,
      )
    : undefined;
  // E6 — the doctor decision + scheduled re-assessment sit between the
  // acknowledgement and the intervention, but only when the alert was
  // escalated to a doctor task (NEWS2 >= 5 / single-parameter 3).
  const needsDecision = !!first("doctor_task_opened");
  const decision = ack
    ? events.find(
        (e) => e.type === "doctor_decision" &&
               e.occurredAt >= ack.occurredAt,
      )
    : undefined;
  const ivStarted = first("intervention_started");
  const ivDone = first("intervention_completed");
  const reassessed = decision
    ? events.find(
        (e) => e.type === "score_computed" &&
               e.occurredAt > decision.occurredAt,
      )
    : undefined;
  const doc = events.find(
    (e) => e.type === "documentation_entry" &&
           (!ivDone || e.occurredAt >= ivDone.occurredAt),
  );
  const claimEv = events.find(
    (e) => e.type === "claim_status" || e.type === "transfer",
  );

  let gaps = 0;
  const step = (
    s: ChainStep["step"], e: (typeof events)[number] | undefined,
    gated: boolean, note?: string,
  ): ChainStep => {
    if (e) return { step: s, status: "ok", eventId: e.id, at: e.occurredAt.toISOString() };
    if (gated) { gaps++; return { step: s, status: "gap", note }; }
    return { step: s, status: "na" };
  };

  // an alert older than the ack threshold with no ack = chain break
  const ackGap =
    alert && !ack &&
    Date.now() - alert.occurredAt.getTime() > CHAIN_ACK_MINUTES * 60_000;

  const steps: ChainStep[] = [
    step("risk", risk, false),
    step("alert", alert, !!risk, "risk signal never alerted"),
    step(
      "acknowledged", ack, !!alert,
      ackGap ? `no acknowledgement within ${CHAIN_ACK_MINUTES} min (prototype)` : "unacknowledged",
    ),
    step("decision", decision, needsDecision && !!ack, "no doctor decision recorded"),
    step("intervention", ivStarted, !!(alert || risk), "no intervention started"),
    step("completed", ivDone, !!ivStarted, "intervention never completed"),
    step("reassessed", reassessed, needsDecision && !!decision, "no NEWS2 re-assessment after decision"),
    step("documented", doc, !!ivDone, "no documentation entry"),
    step("claim", claimEv, false),
  ];
  return {
    steps, gaps,
    label: "Closed-loop safety chain — prototype thresholds",
  };
}

/* ── C9 safety KPIs (registry-computed) ── */

export interface SafetyKpis {
  label: string;
  /** % handoff_accepted events vs handoff_started */
  handoffAcceptedPct: number | null;
  /** action_item_created without a later action_item_completed */
  openActionItems: number;
  /** mean minutes alert_raised → alert_acknowledged */
  meanAckMin: number | null;
  /** mean minutes alert_raised → intervention_started */
  meanInterventionMin: number | null;
  /** escalations per 100 patient-days (synthetic demo days) */
  escalationsPer100Pd: number | null;
}

export async function safetyKpis(): Promise<SafetyKpis> {
  const events = await prisma.clinicalEvent.findMany({
    orderBy: { occurredAt: "asc" },
    select: {
      patientId: true, type: true, occurredAt: true, payloadJson: true,
    },
  });
  const byType = (t: string) => events.filter((e) => e.type === t);
  const started = byType("handoff_started").length;
  const accepted = byType("handoff_accepted").length;

  // open action items: created without a completed that carries the
  // same handoff+item key.
  const completedKeys = new Set(
    byType("action_item_completed").map((e) => {
      try { const p = JSON.parse(e.payloadJson); return `${e.patientId}:${p.handoffId}:${p.item}`; }
      catch { return `${e.patientId}::`; }
    }),
  );
  const openActionItems = byType("action_item_created").filter((e) => {
    try {
      const p = JSON.parse(e.payloadJson);
      return !completedKeys.has(`${e.patientId}:${p.handoffId}:${p.item}`);
    } catch { return true; }
  }).length;

  // pairing: per patient, first alert → first ack / first intervention
  const perPatient = new Map<string, typeof events>();
  for (const e of events) {
    const l = perPatient.get(e.patientId) ?? [];
    l.push(e); perPatient.set(e.patientId, l);
  }
  let ackSum = 0, ackN = 0, ivSum = 0, ivN = 0;
  for (const evs of perPatient.values()) {
    const a = evs.find((e) => e.type === "alert_raised");
    if (!a) continue;
    const ack = evs.find(
      (e) => e.type === "alert_acknowledged" && e.occurredAt >= a.occurredAt,
    );
    const iv = evs.find(
      (e) => e.type === "intervention_started" && e.occurredAt >= a.occurredAt,
    );
    if (ack) { ackSum += +ack.occurredAt - +a.occurredAt; ackN++; }
    if (iv) { ivSum += +iv.occurredAt - +a.occurredAt; ivN++; }
  }

  const patients = new Set(events.map((e) => e.patientId)).size;
  const escalations = byType("escalation").length;
  return {
    label: "Safety KPIs from the event registry — prototype",
    handoffAcceptedPct: started
      ? Math.round((accepted / started) * 100) : null,
    openActionItems,
    meanAckMin: ackN ? Math.round(ackSum / ackN / 60_000) : null,
    meanInterventionMin: ivN ? Math.round(ivSum / ivN / 60_000) : null,
    // demo covers ~1 patient-day each — flagged Simulated via label
    escalationsPer100Pd: patients
      ? Math.round((escalations / patients) * 100) : null,
  };
}

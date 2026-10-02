/**
 * C1 — backfill ClinicalEvent rows from existing tables.
 *
 * Sources: vitalsJson/labsJson/medsJson on Patient, RiskAssessment,
 * InterventionOverride, Handoff/HandoffEvent, ClaimEvent. Demo vitals
 * carry clock labels only ("HH:MM") — they are anchored to `baseDate`
 * (defaults to today) and every payload is stamped `synthetic: true`.
 * Idempotent: a row whose sourceRecordId already exists is skipped.
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent, ENCOUNTER_ID } from "@/lib/server/events";

if (typeof window !== "undefined") {
  throw new Error("lib/server/backfill-events.ts is server-only");
}

/** Verified against the NLM LOINC items table (clinicaltables). */
const VITAL_LOINC = {
  hr: "8867-4", // Heart rate
  sbp: "8480-6", // Systolic blood pressure
  rr: "9279-1", // Respiratory rate
  temp: "8310-5", // Body temperature
  spo2: "59408-5", // Oxygen saturation by pulse oximetry
  glucose: "2339-0", // Glucose mass/vol in blood
} as const;

function hm(base: Date, ts: string, dayOffset = 0): Date {
  const [h, m] = ts.split(":").map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

async function once(sourceRecordId: string): Promise<boolean> {
  const hit = await prisma.clinicalEvent.findFirst({
    where: { sourceRecordId }, select: { id: true },
  });
  return !hit;
}

export async function backfillEvents(baseDate = new Date()): Promise<{
  patients: number; events: number;
}> {
  const base = new Date(baseDate);
  base.setHours(0, 0, 0, 0);
  let events = 0;

  const patients = await prisma.patient.findMany();
  for (const p of patients) {
    const enc = ENCOUNTER_ID(p.id);
    const admitH = Number(p.admittedAt.split(":")[0] ?? 0);
    interface V { t: string; hr: number; sbp: number; rr: number; temp: number; spo2: number; glucose?: number }
    const vitals = JSON.parse(p.vitalsJson) as V[];
    for (const v of vitals) {
      const id = `${p.id}:vs:${v.t}`;
      if (!(await once(id))) continue;
      const h = Number(v.t.split(":")[0]);
      // night-shift patients cross midnight — clock < admit → next day
      const at = hm(base, v.t, h < admitH ? 1 : 0);
      await appendEvent({
        patientId: p.id, encounterId: enc, type: "vital_set",
        occurredAt: at,
        actorRole: "nurse",
        payload: {
          synthetic: true, simulated: "Simulated",
          measurements: [
            { loinc: VITAL_LOINC.hr, value: v.hr, unit: "/min" },
            { loinc: VITAL_LOINC.sbp, value: v.sbp, unit: "mmHg" },
            { loinc: VITAL_LOINC.rr, value: v.rr, unit: "/min" },
            { loinc: VITAL_LOINC.temp, value: v.temp, unit: "Cel" },
            { loinc: VITAL_LOINC.spo2, value: v.spo2, unit: "%" },
            ...(v.glucose
              ? [{ loinc: VITAL_LOINC.glucose, value: v.glucose, unit: "mg/dL" }]
              : []),
          ],
        },
        sourceRecordId: id,
      });
      events++;
    }

    interface L { key: string; value: string; flag: string }
    const labs = JSON.parse(p.labsJson) as L[];
    labs.forEach((l, i) => void i); // typed parse
    for (const [i, l] of labs.entries()) {
      const id = `${p.id}:lab:${i}`;
      if (!(await once(id))) continue;
      await appendEvent({
        patientId: p.id, encounterId: enc, type: "lab_result",
        occurredAt: hm(base, p.admittedAt),
        actorRole: "lab",
        payload: { synthetic: true, simulated: "Simulated", key: l.key, value: l.value, flag: l.flag },
        sourceRecordId: id,
      });
      events++;
    }

    const meds = JSON.parse(p.medsJson) as string[];
    for (const [i, m] of meds.entries()) {
      const id = `${p.id}:med:${i}`;
      if (!(await once(id))) continue;
      await appendEvent({
        patientId: p.id, encounterId: enc, type: "order",
        occurredAt: hm(base, p.admittedAt),
        actorRole: "doctor",
        payload: { synthetic: true, simulated: "Simulated", orderKind: "medication", medKey: m },
        sourceRecordId: id,
      });
      events++;
    }
  }

  const risks = await prisma.riskAssessment.findMany();
  for (const r of risks) {
    if (!(await once(r.id))) continue;
    await appendEvent({
      patientId: r.patientId, type: "score_computed",
      occurredAt: r.assessedAt, actorRole: "system",
      payload: {
        synthetic: true, simulated: "Simulated",
        score: r.score, level: r.level, conditionKey: r.conditionKey,
        windowHrs: r.windowHrs, confidence: r.confidence,
        factors: JSON.parse(r.factorsJson),
      },
      sourceRecordId: r.id,
    });
    events++;
  }

  const overrides = await prisma.interventionOverride.findMany();
  for (const o of overrides) {
    const rows: [string, Date | null][] = [
      ["intervention_started", o.startedAt],
      ["intervention_completed", o.doneAt],
    ];
    if (o.escalatedTo) rows.push(["escalation", o.updatedAt]);
    for (const [type, at] of rows) {
      const id = `${o.stepId}:${type}`;
      if (!at || !(await once(id))) continue;
      await appendEvent({
        patientId: o.patientId, type,
        occurredAt: at, actorUserId: o.updatedBy, actorRole: "nurse",
        payload: {
          synthetic: true, simulated: "Simulated",
          stepId: o.stepId, status: o.status, note: o.note,
          ...(o.escalatedTo ? { escalatedTo: o.escalatedTo } : {}),
        },
        sourceRecordId: id,
      });
      events++;
    }
  }

  const hEvents = await prisma.handoffEvent.findMany({ include: { handoff: true } });
  const TYPE_MAP: Record<string, string> = {
    created: "handoff_started",
    signed_off: "handoff_signed",
    accepted: "handoff_accepted",
    completed: "handoff_accepted",
    rejected: "handoff_started",
    reviewed: "documentation_entry",
    sbar: "documentation_entry",
  };
  for (const h of hEvents) {
    if (!(await once(h.id))) continue;
    const pts = JSON.parse(h.handoff.patientIdsJson) as string[];
    for (const pid of pts) {
      await appendEvent({
        patientId: pid, type: TYPE_MAP[h.action] ?? "documentation_entry",
        occurredAt: h.createdAt, actorUserId: h.actorId, actorRole: "nurse",
        payload: {
          synthetic: true, simulated: "Simulated",
          handoffId: h.handoffId, handoffAction: h.action, detail: h.detail,
        },
        sourceRecordId: `${h.id}:${pid}`,
      });
      events++;
    }
  }

  const claimEvents = await prisma.claimEvent.findMany({ include: { claim: true } });
  for (const c of claimEvents) {
    if (!c.claim.patientId || !(await once(c.id))) continue;
    await appendEvent({
      patientId: c.claim.patientId, type: "claim_status",
      occurredAt: c.createdAt, actorUserId: c.actorId, actorRole: "billing",
      payload: {
        synthetic: true, simulated: "Simulated",
        claimId: c.claimId, action: c.action, detail: c.detail,
      },
      sourceRecordId: c.id,
    });
    events++;
  }

  return { patients: patients.length, events };
}

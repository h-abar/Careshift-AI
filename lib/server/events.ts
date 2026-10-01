/**
 * C1 — append-only, hash-chained clinical event store.
 *
 * Contract: rows are NEVER updated or deleted. Corrections are new
 * events whose `correctsId` points at the corrected row. Integrity is
 * a per-patient hash chain: hash = sha256(prevHash ‖ canonical
 * content). scripts/verify-events.ts recomputes the chain and reports
 * the first broken link — so tampering is detectable even though the
 * ORM cannot physically block writes.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { env } from "@/lib/server/env";

if (typeof window !== "undefined") {
  throw new Error("lib/server/events.ts is server-only");
}

export class EventStoreError extends Error {}
/** Guard — surfaced so any attempted mutation fails loudly. */
export function immutableEventStore(): never {
  throw new EventStoreError(
    "ClinicalEvent is append-only — write a correction event instead",
  );
}

export const ENCOUNTER_ID = (patientId: string) => `enc-${patientId}`;

/** Canonical content covered by the hash — stable key order. */
function canonical(e: {
  patientId: string; encounterId: string; type: string;
  occurredAt: Date; actorUserId: string | null; actorRole: string;
  payloadJson: string; sourceRecordId: string | null;
  ruleId: string | null; ruleVersion: number | null;
  correctsId: string | null; correctionReason: string | null;
}): string {
  return JSON.stringify({
    patientId: e.patientId, encounterId: e.encounterId, type: e.type,
    occurredAt: e.occurredAt.toISOString(), actorUserId: e.actorUserId,
    actorRole: e.actorRole, payloadJson: e.payloadJson,
    sourceRecordId: e.sourceRecordId, ruleId: e.ruleId,
    ruleVersion: e.ruleVersion, correctsId: e.correctsId,
    correctionReason: e.correctionReason,
  });
}

export function hashEvent(prevHash: string, content: string): string {
  return createHash("sha256").update(prevHash + "|" + content).digest("hex");
}

export interface AppendEventInput {
  patientId: string;
  encounterId?: string;
  type: string;
  occurredAt: Date;
  actorUserId?: string;
  actorRole?: string;
  payload?: Record<string, unknown>;
  sourceRecordId?: string;
  ruleId?: string;
  ruleVersion?: number;
  correctsId?: string;
  correctionReason?: string;
  recordedAt?: Date; // injectable for tests/backfill
}

/** Append one event, hash-chained to the patient's latest row. */
export async function appendEvent(
  input: AppendEventInput,
  db: Pick<typeof prisma, "clinicalEvent"> = prisma,
) {
  const last = await db.clinicalEvent.findFirst({
    where: { patientId: input.patientId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const recordedAt = input.recordedAt ?? new Date();
  const lateMin = Number(env().LATE_ENTRY_MINUTES ?? 240);
  const base = {
    patientId: input.patientId,
    encounterId: input.encounterId ?? ENCOUNTER_ID(input.patientId),
    type: input.type,
    occurredAt: input.occurredAt,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? "",
    payloadJson: JSON.stringify(input.payload ?? {}),
    sourceRecordId: input.sourceRecordId ?? null,
    ruleId: input.ruleId ?? null,
    ruleVersion: input.ruleVersion ?? null,
    correctsId: input.correctsId ?? null,
    correctionReason: input.correctionReason ?? null,
    prevHash: last?.hash ?? "",
    recordedAt,
    lateEntry:
      recordedAt.getTime() - input.occurredAt.getTime() > lateMin * 60_000,
  };
  const hash = hashEvent(base.prevHash, canonical(base));
  return db.clinicalEvent.create({ data: { ...base, hash } });
}

/** Correction — never an update. Returns the new correction event. */
export async function correctEvent(
  eventId: string,
  reason: string,
  actor: { id: string; role: string },
  correctedPayload: Record<string, unknown>,
) {
  const orig = await prisma.clinicalEvent.findUnique({ where: { id: eventId } });
  if (!orig) throw new EventStoreError(`event ${eventId} not found`);
  if (!reason.trim()) throw new EventStoreError("correction reason required");
  return appendEvent({
    patientId: orig.patientId,
    encounterId: orig.encounterId,
    type: orig.type,
    occurredAt: orig.occurredAt,
    actorUserId: actor.id,
    actorRole: actor.role,
    payload: correctedPayload,
    correctsId: orig.id,
    correctionReason: reason,
  });
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAt: string | null; // event id
  reason?: string;
}

/** Recompute the patient's hash chain — reports the first broken link. */
export async function verifyChain(
  patientId: string,
  db: Pick<typeof prisma, "clinicalEvent"> = prisma,
): Promise<VerifyResult> {
  const rows = await db.clinicalEvent.findMany({
    where: { patientId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
  let prev = "";
  for (const e of rows) {
    const expectHash = hashEvent(prev, canonical(e));
    if (e.prevHash !== prev || e.hash !== expectHash)
      return { ok: false, checked: 0, brokenAt: e.id, reason: "hash mismatch" };
    prev = e.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}

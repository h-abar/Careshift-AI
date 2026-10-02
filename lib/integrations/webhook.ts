/**
 * D1 — device/vitals JSON webhook adapter. Expected body:
 *   { patientId, takenAt?, deviceId?, vitals: { rr, spo2, sbp, dbp,
 *     hr, temp, conscious, o2 } }
 * Only keys present in the payload are carried — no fabricated values.
 */
import { MAPPING_VERSION } from "./mappings";
import { ParseError, type SourceAdapter } from "./types";

const VITAL_KEYS = ["rr", "spo2", "o2", "sbp", "dbp", "hr", "temp", "conscious"];

export const vitalsWebhookAdapter: SourceAdapter = {
  name: "vitals-webhook",
  parse(payload, resolvePatient) {
    const p = payload as Record<string, unknown>;
    if (!p || typeof p !== "object") throw new ParseError("not an object");
    const ref = String(p.patientId ?? "");
    const patientId = resolvePatient ? resolvePatient(ref) ?? ref : ref;
    if (!patientId) throw new ParseError("no patientId");
    const vitals = p.vitals as Record<string, unknown> | undefined;
    if (!vitals || typeof vitals !== "object")
      throw new ParseError("no vitals object");
    const keys = VITAL_KEYS.filter((k) => vitals[k] !== undefined);
    if (!keys.length) throw new ParseError("no recognised vital keys");
    const occurredAt = p.takenAt ? new Date(String(p.takenAt)) : new Date();
    if (Number.isNaN(occurredAt.getTime()))
      throw new ParseError("bad takenAt");
    const deviceId = String(p.deviceId ?? "webhook");
    return [
      {
        patientId,
        type: "vital_set",
        occurredAt,
        actorRole: "system",
        payload: {
          vitals: Object.fromEntries(keys.map((k) => [k, vitals[k]])),
          deviceId,
        },
        sourceSystem: `vitals-webhook:${MAPPING_VERSION}`,
        sourceRecordId: `${deviceId}:${patientId}:${occurredAt.toISOString()}`,
      },
    ];
  },
};

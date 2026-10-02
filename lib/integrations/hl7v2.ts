/**
 * D1 — minimal HL7 v2 parser + adapter for ADT and ORU^R01 messages.
 * Pipe-delimited segments; MSH-9 carries the trigger, PID-3 the patient
 * id, OBX-3 the observation code, OBX-5 the value, OBX-6 units.
 * Unknown messages raise ParseError → dead-letter.
 */
import { HL7_ADT_MAP, LOINC_VITALS, MAPPING_VERSION } from "./mappings";
import { ParseError, type SourceAdapter, type SourceEvent } from "./types";

interface Seg { name: string; fields: string[] }

export function parseHl7(msg: string): Seg[] {
  const segs = msg
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split("|");
      return { name: parts[0], fields: parts.slice(1) };
    });
  if (!segs.length || segs[0].name !== "MSH")
    throw new ParseError("no MSH segment");
  return segs;
}

const field = (s: Seg | undefined, i: number, comp = 0) =>
  (s?.fields[i] ?? "").split("^")[comp] ?? "";
const hl7dt = (s: string) => {
  // "20261001143000" → Date
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", sec = "0"] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +sec);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export const hl7v2Adapter: SourceAdapter = {
  name: "hl7v2",
  parse(payload, resolvePatient) {
    const segs = parseHl7(String(payload ?? ""));
    const msh = segs[0];
    const trigger = msh.fields[7] ?? ""; // MSH-9 (fields[7]: index 8 in 1-based)
    const msgType = HL7_ADT_MAP[trigger];
    if (!msgType) throw new ParseError(`unsupported trigger ${trigger}`);
    const msgId = field(msh, 8); // MSH-10 message control id

    const pid = segs.find((s) => s.name === "PID");
    const patientRef = field(pid, 2); // PID-3.1
    const patientId = resolvePatient
      ? resolvePatient(patientRef) ?? patientRef
      : patientRef;
    if (!patientId) throw new ParseError("no PID-3 patient id");

    const evh = segs.find((s) => s.name === "EVN");
    const occurredAt =
      hl7dt(field(evh, 1)) ?? hl7dt(field(msh, 5)) ?? new Date();

    if (trigger === "ORU^R01") {
      const obxs = segs.filter((s) => s.name === "OBX");
      if (!obxs.length) throw new ParseError("ORU without OBX");
      return obxs.map((o, i) => {
        const code = field(o, 2);      // OBX-3.1
        const system = field(o, 2, 2); // OBX-3.3 coding system
        const value = field(o, 4);     // OBX-5
        const unit = field(o, 5);      // OBX-6
        const vitalKey =
          system === "LN" || system === "http://loinc.org"
            ? LOINC_VITALS[code]
            : undefined;
        return {
          patientId,
          type: vitalKey ? "vital_set" : "lab_result",
          occurredAt: hl7dt(field(o, 13)) ?? occurredAt,
          actorRole: "system",
          payload: {
            code: { system, code, display: field(o, 2, 1) },
            value,
            unit,
            ...(vitalKey ? { vitalKey } : {}),
            obxSetId: field(o, 0),
          },
          sourceSystem: `hl7v2:${MAPPING_VERSION}`,
          sourceRecordId: `${msgId}:${i}`,
        } satisfies SourceEvent;
      });
    }

    return [
      {
        patientId,
        type: msgType,
        occurredAt,
        actorRole: "system",
        payload: { trigger, facility: field(msh, 3) },
        sourceSystem: `hl7v2:${MAPPING_VERSION}`,
        sourceRecordId: msgId,
      },
    ];
  },
};

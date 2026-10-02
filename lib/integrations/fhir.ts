/**
 * D1 — FHIR R4 adapter. Maps Observation / Encounter /
 * MedicationAdministration / ServiceRequest / DiagnosticReport /
 * Procedure resources to ClinicalEvents. Source ids come from
 * resource.id — nothing is fabricated; unmapped fields are dropped.
 */
import { FHIR_RESOURCE_MAP, LOINC_VITALS, MAPPING_VERSION } from "./mappings";
import { ParseError, type SourceAdapter, type SourceEvent } from "./types";

type Res = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const dt = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

function codingOf(res: Res): { system: string; code: string; display: string } {
  const code = (res.code ?? res.type) as Res | undefined;
  const c = (code?.coding as Res[] | undefined)?.[0];
  return {
    system: str(c?.system),
    code: str(c?.code),
    display: str(c?.display) || str(code?.text),
  };
}

function refId(v: unknown): string {
  // "Patient/P-1042" → "P-1042"
  const ref = str((v as Res | undefined)?.reference);
  return ref.split("/").pop() ?? "";
}

function mapOne(res: Res, resolvePatient?: (ref: string) => string | null): SourceEvent {
  const type = str(res.resourceType);
  const evType = FHIR_RESOURCE_MAP[type];
  if (!evType) throw new ParseError(`unsupported resourceType ${type}`);
  const id = str(res.id);
  if (!id) throw new ParseError(`${type} has no id`);

  const patientRef =
    refId(res.subject) || refId(res.patient) || refId(res.encounter);
  const patientId = resolvePatient
    ? resolvePatient(patientRef) ?? patientRef
    : patientRef;
  if (!patientId) throw new ParseError(`${type}/${id} has no patient ref`);

  const occurredAt =
    dt(res.effectiveDateTime) ??
    dt((res.occurrenceDateTime as string) ?? "") ??
    dt((res.performedDateTime as string) ?? "") ??
    dt((res.issued as string) ?? "") ??
    dt(((res.period as Res | undefined)?.start as string) ?? "") ??
    dt(((res.authoredOn as string) ?? "") ?? "") ??
    new Date();

  const cod = codingOf(res);
  const payload: Record<string, unknown> = {
    fhirType: type,
    status: str(res.status),
    code: cod,
  };

  if (type === "Observation") {
    const loinc = cod.system.includes("loinc") ? cod.code : "";
    const key = LOINC_VITALS[loinc];
    const vq = res.valueQuantity as Res | undefined;
    if (key && vq) {
      payload.vitalKey = key;
      payload.value = vq.value;
      payload.unit = str(vq.unit) || str(vq.code);
    }
  }
  if (type === "Encounter") {
    payload.class = str((res.class as Res | undefined)?.code);
    payload.adt = "encounter";
  }
  if (type === "ServiceRequest") payload.orderKind = "service";
  if (type === "DiagnosticReport") {
    payload.resultCount = (res.result as unknown[] | undefined)?.length ?? 0;
  }

  return {
    patientId,
    type: evType,
    occurredAt,
    actorRole: "system",
    payload,
    sourceSystem: `fhir-r4:${MAPPING_VERSION}`,
    sourceRecordId: `${type}/${id}`,
  };
}

export const fhirAdapter: SourceAdapter = {
  name: "fhir-r4",
  parse(payload, resolvePatient) {
    const res = payload as Res;
    if (!res || typeof res !== "object") throw new ParseError("not a resource");
    if (res.resourceType === "Bundle") {
      const entries = (res.entry as Res[] | undefined) ?? [];
      return entries
        .map((e) => e.resource as Res | undefined)
        .filter((r): r is Res => !!r && FHIR_RESOURCE_MAP[str(r.resourceType)] !== undefined)
        .map((r) => mapOne(r, resolvePatient));
    }
    return [mapOne(res, resolvePatient)];
  },
};

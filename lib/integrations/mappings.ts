/**
 * D1 — versioned ingestion mapping tables. Bump MAPPING_VERSION when a
 * table changes; the version is stamped into `sourceSystem` so every
 * ingested event records which mapping produced it.
 *
 * Only codes present in the source payload are carried through —
 * adapters never invent codes.
 */
export const MAPPING_VERSION = "ingestion-v1";

/** LOINC code → Careshift vital key (vital_set payload). */
export const LOINC_VITALS: Record<string, string> = {
  "9279-1": "rr",     // respiratory rate
  "2708-6": "spo2",   // oxygen saturation
  "8480-6": "sbp",    // systolic blood pressure
  "8462-4": "dbp",    // diastolic blood pressure
  "8867-4": "hr",     // heart rate
  "8310-5": "temp",   // body temperature
};

/** FHIR resourceType → ClinicalEvent.type. */
export const FHIR_RESOURCE_MAP: Record<string, string> = {
  Observation: "vital_set",
  Encounter: "transfer",
  MedicationAdministration: "medication_administered",
  ServiceRequest: "order",
  DiagnosticReport: "lab_result",
  Procedure: "procedure",
};

/** HL7v2 ADT trigger → ClinicalEvent.type. */
export const HL7_ADT_MAP: Record<string, string> = {
  "ADT^A01": "transfer",   // admit
  "ADT^A02": "transfer",   // transfer
  "ADT^A03": "transfer",   // discharge
  "ADT^A08": "documentation_entry", // update patient info
  "ORU^R01": "lab_result", // observation result (OBX routing refines)
};

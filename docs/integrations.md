# D1 — Ingestion adapters

`lib/integrations/` converts external source payloads into hash-chained
`ClinicalEvent` rows. All demo data flowing through these adapters is
labeled **Simulated**.

## Adapters

| Adapter | File | Input | Maps to |
|---|---|---|---|
| FHIR R4 | `fhir.ts` | Bundle or single resource | Observation→`vital_set`, Encounter→`transfer`, MedicationAdministration→`medication_administered`, ServiceRequest→`order`, DiagnosticReport→`lab_result`, Procedure→`procedure` |
| HL7 v2 | `hl7v2.ts` | ADT A01/A02/A03/A08, ORU^R01 | ADT→`transfer`/`documentation_entry`, OBX→`vital_set` (LOINC vitals) or `lab_result` |
| CSV / MIMIC demo | `csv.ts` | chartevents-shaped rows + caller-supplied itemid map | `vital_set` / `lab_result` |
| Vitals webhook | `webhook.ts` + `POST /api/integrations/vitals` | `{patientId, takenAt, vitals{...}}` | `vital_set` |

## Guarantees

- **Idempotent**: `ClinicalEvent` unique index on
  `(sourceSystem, sourceRecordId)` — replays skip duplicates.
- **Dead-letter**: unparseable payloads land in `IngestionDeadLetter`
  with the raw payload and error — nothing dropped silently.
- **Versioned mapping**: `MAPPING_VERSION` in
  `lib/integrations/mappings.ts` is stamped into `sourceSystem`
  (`<adapter>:<version>`), so every event records which mapping made it.
- **No fabrication**: adapters only carry codes present in the source
  payload; unmapped resources raise `ParseError` → dead-letter.
- **Webhook auth**: `POST /api/integrations/vitals` requires the
  `WEBHOOK_SECRET` env + `x-webhook-key` header; disabled when unset.
- Ingestion runs are audited (`ingest.vitals`).

## Vendor systems

Epic, Oracle Health (Cerner), InterSystems and local HIS products are
FHIR/HL7-capable systems that *could* feed these adapters. They are
listed as **examples only** — Careshift claims no integration,
certification, or partnership with any vendor.

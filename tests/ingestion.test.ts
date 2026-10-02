/**
 * D1 — ingestion adapters + pipeline. Real DB (schema=test).
 * FHIR R4 bundle, HL7v2 ADT/ORU, CSV/MIMIC rows and vitals webhook all
 * land as hash-chained ClinicalEvents; ingestion is idempotent on
 * (sourceSystem, sourceRecordId); failures go to the dead-letter queue.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { migrateUrl, schemaUrl } from "./db-url";

import { prisma } from "@/lib/server/prisma";
import { verifyChain } from "@/lib/server/events";
import { ingest } from "@/lib/integrations/ingest";
import { fhirAdapter } from "@/lib/integrations/fhir";
import { hl7v2Adapter, parseHl7 } from "@/lib/integrations/hl7v2";
import { csvAdapter } from "@/lib/integrations/csv";
import { vitalsWebhookAdapter } from "@/lib/integrations/webhook";
import { MAPPING_VERSION } from "@/lib/integrations/mappings";

beforeAll(async () => {
  execSync("npx tsx scripts/deallocate.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migrateUrl("test") }, stdio: "ignore",
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: schemaUrl("test") }, stdio: "ignore",
  });
}, 180_000);

const PATIENT = "P-1042";
const resolve = (ref: string) => (ref === "P-1042" ? PATIENT : null);

const FHIR_BUNDLE = {
  resourceType: "Bundle",
  entry: [
    {
      resource: {
        resourceType: "Observation", id: "obs-1",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "9279-1", display: "Respiratory rate" }] },
        subject: { reference: "Patient/P-1042" },
        effectiveDateTime: "2026-10-01T10:00:00Z",
        valueQuantity: { value: 24, unit: "breaths/min" },
      },
    },
    {
      resource: {
        resourceType: "ServiceRequest", id: "req-1", status: "active",
        code: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/sbs", code: "X", display: "lab order" }] },
        subject: { reference: "Patient/P-1042" },
        authoredOn: "2026-10-01T10:05:00Z",
      },
    },
    {
      resource: {
        resourceType: "Procedure", id: "proc-1", status: "completed",
        code: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/procedures", code: "Y", display: "ECG" }] },
        subject: { reference: "Patient/P-1042" },
        performedDateTime: "2026-10-01T10:20:00Z",
      },
    },
  ],
};

const ORU = [
  "MSH|^~\\&|LAB|HOSP|CARESHIFT|HOSP|20261001110000||ORU^R01|MSG00042|P|2.5",
  "PID|||P-1042||HARBI^SARA",
  "OBR|1|ORD1|CBC",
  "OBX|1|NM|9279-1^Respiratory rate^LN||26|breaths/min",
  "OBX|2|NM|2345-7^Glucose^LN||110|mg/dL",
].join("\r");

const ADT = [
  "MSH|^~\\&|HIS|HOSP|CARESHIFT|HOSP|20261001080000||ADT^A01|MSG00010|P|2.5",
  "PID|||P-1042||HARBI^SARA",
  "EVN|A01|20261001080000",
].join("\r");

describe("D1 ingestion adapters + pipeline", () => {
  it("FHIR bundle maps resources to typed events", async () => {
    const r = await ingest(fhirAdapter, [FHIR_BUNDLE], resolve);
    expect(r.received).toBe(3);
    expect(r.appended).toBe(3);
    const evs = await prisma.clinicalEvent.findMany({
      where: { sourceSystem: `fhir-r4:${MAPPING_VERSION}` },
    });
    const types = evs.map((e) => e.type).sort();
    expect(types).toEqual(["order", "procedure", "vital_set"]);
    const obs = evs.find((e) => e.sourceRecordId === "Observation/obs-1");
    const pl = JSON.parse(obs!.payloadJson);
    expect(pl.vitalKey).toBe("rr");
    expect(pl.value).toBe(24);
  });

  it("ingestion is idempotent on (sourceSystem, sourceRecordId)", async () => {
    const r = await ingest(fhirAdapter, [FHIR_BUNDLE], resolve);
    expect(r.appended).toBe(0);
    expect(r.duplicates).toBe(3);
    const n = await prisma.clinicalEvent.count({
      where: { sourceSystem: `fhir-r4:${MAPPING_VERSION}` },
    });
    expect(n).toBe(3);
  });

  it("HL7v2 ORU routes LOINC vitals vs labs; ADT maps to transfer", async () => {
    const segs = parseHl7(ORU);
    expect(segs[0].name).toBe("MSH");
    const r1 = await ingest(hl7v2Adapter, [ORU], resolve);
    expect(r1.appended).toBe(2);
    const evs = await prisma.clinicalEvent.findMany({
      where: { sourceSystem: `hl7v2:${MAPPING_VERSION}`, sourceRecordId: { startsWith: "MSG00042" } },
    });
    expect(evs.map((e) => e.type).sort()).toEqual(["lab_result", "vital_set"]);

    const r2 = await ingest(hl7v2Adapter, [ADT], resolve);
    expect(r2.appended).toBe(1);
    const tr = await prisma.clinicalEvent.findFirst({
      where: { sourceRecordId: "MSG00010" },
    });
    expect(tr!.type).toBe("transfer");
  });

  it("CSV/MIMIC rows map via the versioned item table", async () => {
    const adapter = csvAdapter({ "220045": "hr" }); // MIMIC itemid → vital
    const rows = [
      { subject_id: PATIENT, itemid: "220045", value: "88", valuenum: "88", valueuom: "bpm", charttime: "2026-10-01 11:00:00" },
      { subject_id: PATIENT, itemid: "50912", value: "1.4", valuenum: "1.4", valueuom: "mg/dL", charttime: "2026-10-01 11:00:00" },
    ];
    const r = await ingest(adapter, [rows], resolve);
    expect(r.appended).toBe(2);
    const hr = await prisma.clinicalEvent.findFirst({
      where: { sourceRecordId: `${PATIENT}:220045:2026-10-01 11:00:00` },
    });
    expect(hr!.type).toBe("vital_set");
    expect(JSON.parse(hr!.payloadJson).vitalKey).toBe("hr");
  });

  it("vitals webhook payload becomes a vital_set event", async () => {
    const r = await ingest(vitalsWebhookAdapter, [
      {
        patientId: PATIENT, deviceId: "MON-7",
        takenAt: "2026-10-01T12:00:00Z",
        vitals: { rr: 22, spo2: 94, hr: 110 },
      },
    ]);
    expect(r.appended).toBe(1);
    const ev = await prisma.clinicalEvent.findFirst({
      where: { sourceSystem: `vitals-webhook:${MAPPING_VERSION}` },
    });
    const pl = JSON.parse(ev!.payloadJson);
    expect(pl.vitals.rr).toBe(22);
    expect(pl.deviceId).toBe("MON-7");
  });

  it("unparseable payloads land in the dead-letter queue", async () => {
    const r = await ingest(vitalsWebhookAdapter, [{ nope: true }]);
    expect(r.deadLettered).toBe(1);
    const dl = await prisma.ingestionDeadLetter.findFirst({
      where: { adapter: `vitals-webhook:${MAPPING_VERSION}` },
    });
    expect(dl).toBeTruthy();
    expect(dl!.error).toContain("patientId");
  });

  it("event hash chain stays intact after ingestion", async () => {
    const v = await verifyChain(PATIENT);
    expect(v.ok).toBe(true);
  });
});

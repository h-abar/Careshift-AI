import { buildClaimRequest } from "../lib/nphies/bundle";
import { writeFileSync } from "node:fs";
const now = new Date().toISOString();
const events = [
  {
    id: "ev-vital-1", type: "vital_set", occurredAt: now, hash: "a".repeat(64),
    payload: {
      measurements: [
        { loinc: "8480-6", value: 98 },
        { loinc: "8867-4", value: 128 },
        { loinc: "9279-1", value: 28 },
        { loinc: "8310-5", value: 38.4 },
        { loinc: "59408-5", value: 94 },
      ],
    },
  },
  {
    id: "ev-doc-1", type: "documentation_entry", occurredAt: now, hash: "b".repeat(64),
    payload: {
      dbp: 78, heightCm: 162, weightKg: 58,
      chiefComplaintText: "Polyuria, vomiting and abdominal pain",
      history: "Rising glucose with ketones (simulated)",
      physicalExam: "Dehydrated, tachypnoeic (simulated)",
      patientHistory: "Type 1 diabetes on insulin (simulated)",
      treatmentPlan: "IV insulin + fluids (simulated)",
    },
  },
  {
    id: "ev-lab-1", type: "lab_result", occurredAt: now, hash: "c".repeat(64),
    payload: {
      key: "glucose", value: "380",
      loinc: "2339-0", display: "Glucose [Mass/volume] in Blood",
    },
  },
  { id: "ev-alert-1", type: "alert_raised", occurredAt: now, hash: "d".repeat(64) },
  { id: "ev-iv-1", type: "intervention_completed", occurredAt: now, hash: "e".repeat(64) },
];
const { bundle, skippedLines, missingInfo } = buildClaimRequest({
  claimId: "CL-DEMO-1", patientId: "P-1042", encounterId: "enc-P-1042",
  lines: [{
    seq: 1, code: "13882-00-00",
    codeSystem: "http://nphies.sa/terminology/CodeSystem/procedures",
    quantity: 1, unitPriceSar: 400, simulatedPrice: true,
  }],
  events,
  diagnosis: [{ code: "E10.10", display: "Type 1 diabetes mellitus with ketoacidosis" }],
});
writeFileSync("tmp/bundle.json", JSON.stringify(bundle, null, 1));
console.log("written tmp/bundle.json — skippedLines:", skippedLines, "missingInfo:", missingInfo);

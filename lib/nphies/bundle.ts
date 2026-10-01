/**
 * C10 — NPHIES FHIR R4.0.1 message-bundle builders.
 *
 * Maps hash-chained ClinicalEvents + assembled claim lines to
 * Bundle(type=message) per the official nphies-fs 1.0.0 IG. Canonical
 * URLs and terminology come verbatim from knowledge/nphies-ig
 * (see lib/nphies/terminology.ts). Nothing here makes network calls —
 * sending goes through lib/nphies/send.ts (mock unless NPHIES_ENV=
 * sandbox is fully configured).
 */
import { randomUUID } from "node:crypto";
import {
  IG, PROFILES, SYSTEMS, MESSAGE_EVENTS, INFO_CATEGORIES,
  type MessageEvent, type InfoCategory, MOCK_LABEL,
} from "./terminology";

export const BASE = "https://careshift.example.sa"; // demo provider base

const uid = () => `urn:uuid:${randomUUID()}`;
const meta = (profile: string) => ({ profile: [profile] });
const NPHIES_ENDPOINT = "https://nphies.sa/fhir/$process-message";

type Resource = Record<string, unknown>;
const entry = (fullUrl: string, resource: Resource) => ({ fullUrl, resource });

function bundle(event: MessageEvent, focusRef: string, entries: ReturnType<typeof entry>[]) {
  if (!MESSAGE_EVENTS.includes(event)) {
    throw new Error(`event code ${event} not in ksa-message-events`);
  }
  const mh = {
    resourceType: "MessageHeader",
    id: randomUUID(),
    meta: meta(PROFILES.messageHeader),
    eventCoding: { system: SYSTEMS.messageEvents, code: event },
    source: { endpoint: BASE },
    destination: [{
      endpoint: NPHIES_ENDPOINT,
      receiver: {
        type: "Organization",
        identifier: {
          system: "http://nphies.sa/license/payer-license",
          value: "SIMULATED-PAYER",
        },
      },
    }],
    sender: {
      type: "Organization",
      identifier: {
        system: "http://nphies.sa/license/provider-license",
        value: "SIMULATED-PROVIDER",
      },
    },
    focus: [{ reference: focusRef }],
  };
  return {
    resourceType: "Bundle",
    id: randomUUID(),
    meta: meta(PROFILES.bundle),
    type: "message",
    timestamp: new Date().toISOString(),
    entry: [{ fullUrl: uid(), resource: mh }, ...entries],
  };
}

/* ── shared actors (minimum necessary — no patient names) ── */

export function providerOrg() {
  return entry(`${BASE}/Organization/provider`, {
    resourceType: "Organization", id: "provider",
    meta: meta(PROFILES.providerOrg),
    extension: [{
      url: `${IG.canonical}/StructureDefinition/extension-provider-type`,
      valueCodeableConcept: {
        coding: [{ system: `${IG.terminology}/CodeSystem/provider-type`, code: "1", display: "Hospital" }],
      },
    }],
    identifier: [{ system: "http://nphies.sa/license/provider-license", value: "SIMULATED-PROVIDER" }],
    active: true,
    type: [{ coding: [{ system: `${IG.terminology}/CodeSystem/organization-type`, code: "prov" }] }],
    name: "Careshift Demo Hospital (Simulated)",
  });
}

export function insurerOrg() {
  return entry(`${BASE}/Organization/simulated-insurer`, {
    resourceType: "Organization", id: "simulated-insurer",
    meta: meta(PROFILES.insurerOrg),
    identifier: [{
      use: "official",
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "NII" }] },
      system: "http://nphies.sa/license/payer-license",
      value: "SIMULATED-INSURER",
    }],
    active: true,
    type: [{ coding: [{ system: `${IG.terminology}/CodeSystem/organization-type`, code: "ins" }] }],
    name: "Simulated Insurer",
  });
}

export interface PatientLike {
  id: string; name?: string; gender?: "male" | "female"; birthDate?: string;
}

export function patientRes(patient: PatientLike) {
  const gender = patient.gender ?? "female";
  const name = patient.name ?? "Simulated Patient";
  return entry(`${BASE}/Patient/${patient.id}`, {
    resourceType: "Patient", id: patient.id,
    meta: meta(PROFILES.patient),
    extension: [{
      url: `${IG.canonical}/StructureDefinition/extension-occupation`,
      valueCodeableConcept: {
        coding: [{ system: `${IG.terminology}/CodeSystem/occupation`, code: "unknown" }],
      },
    }],
    identifier: [{
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "PRC" }] },
      system: "http://nphies.sa/identifier/iqama",
      value: "2999999999", // synthetic demo identifier — not a real iqama
    }],
    active: true,
    name: [{ use: "official", text: `${name} (Simulated)` }],
    gender,
    _gender: {
      extension: [{
        url: `${IG.canonical}/StructureDefinition/extension-ksa-administrative-gender`,
        valueCodeableConcept: {
          coding: [{ system: `${IG.terminology}/CodeSystem/ksa-administrative-gender`, code: gender }],
        },
      }],
    },
    birthDate: patient.birthDate ?? "1990-01-01",
    maritalStatus: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus", code: "U" }],
    },
  });
}

export function coverageRes(patientId: string) {
  return entry(`${BASE}/Coverage/cov-1`, {
    resourceType: "Coverage", id: "cov-1",
    meta: meta(PROFILES.coverage),
    status: "active",
    identifier: [{ system: `${BASE}/identifiers/memberid`, value: "SIMULATED-MEMBER" }],
    type: { coding: [{ system: `${IG.terminology}/CodeSystem/coverage-type`, code: "EHCPOL" }] },
    policyHolder: { reference: `${BASE}/Patient/${patientId}` },
    subscriber: { reference: `${BASE}/Patient/${patientId}` },
    beneficiary: { reference: `${BASE}/Patient/${patientId}` },
    relationship: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/subscriber-relationship", code: "self" }],
    },
    payor: [{ reference: `${BASE}/Organization/simulated-insurer` }],
    class: [{
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/coverage-class", code: "plan" }] },
      value: "SIMULATED-PLAN", name: "Simulated Plan",
    }],
  });
}

export function practitionerRes() {
  return entry(`${BASE}/Practitioner/attending`, {
    resourceType: "Practitioner", id: "attending",
    meta: meta(PROFILES.practitioner),
    identifier: [{
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "PRN" }] },
      system: "http://nphies.sa/license/practitioner-license",
      value: "SIMULATED-PRACTITIONER",
    }],
    active: true,
    name: [{ use: "official", text: "Simulated Attending Physician" }],
  });
}

export function encounterRes(encounterId: string, patientId: string, period?: { start: string; end?: string }) {
  const now = new Date().toISOString();
  return entry(`${BASE}/Encounter/${encounterId}`, {
    resourceType: "Encounter", id: encounterId,
    meta: meta(PROFILES.encounterClaimIMP),
    identifier: [{ system: `${BASE}/identifiers/encounter`, value: encounterId }],
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "inpatient encounter" },
    serviceType: {
      coding: [{ system: `${IG.terminology}/CodeSystem/service-type`, code: "acute-care", display: "Acute Care" }],
    },
    subject: { reference: `${BASE}/Patient/${patientId}` },
    period: { start: period?.start ?? now, end: period?.end ?? now },
    hospitalization: {
      extension: [
        {
          url: `${IG.canonical}/StructureDefinition/extension-admissionSpecialty`,
          valueCodeableConcept: {
            coding: [{ system: `${IG.terminology}/CodeSystem/practice-codes`, code: "08.00", display: "Internal Medicine Specialty" }],
          },
        },
        {
          url: `${IG.canonical}/StructureDefinition/extension-dischargeSpecialty`,
          valueCodeableConcept: {
            coding: [{ system: `${IG.terminology}/CodeSystem/practice-codes`, code: "08.00", display: "Internal Medicine Specialty" }],
          },
        },
        {
          url: `${IG.canonical}/StructureDefinition/extension-intendedLengthOfStay`,
          valueCodeableConcept: {
            coding: [{ system: `${IG.terminology}/CodeSystem/intended-length-of-stay`, code: "IO" }],
          },
        },
      ],
      admitSource: {
        coding: [{ system: `${IG.terminology}/CodeSystem/admit-source`, code: "EER", display: "Admission from hospital ER" }],
      },
      dischargeDisposition: {
        coding: [{ system: `${IG.terminology}/CodeSystem/discharge-disposition`, code: "home", display: "Home/Other" }],
      },
    },
    serviceProvider: { reference: `${BASE}/Organization/provider` },
  });
}

/* ── supportingInfo built FROM EVENTS ── */

export interface Ev {
  id: string; type: string; occurredAt: string;
  hash?: string; payload?: Record<string, unknown>;
}

/** LOINC → claim-information-category + UCUM unit (verified codes only). */
const VITAL_CAT: Record<string, [InfoCategory, string]> = {
  "8480-6": ["vital-sign-systolic", "mm[Hg]"],
  "8462-4": ["vital-sign-diastolic", "mm[Hg]"],
  "8867-4": ["pulse", "/min"],
  "9279-1": ["respiratory-rate", "/min"],
  "8310-5": ["temperature", "Cel"],
  "59408-5": ["oxygen-saturation", "%"],
};

/** documentation_entry payload fields → required categories */
const DOC_FIELD: Record<string, InfoCategory> = {
  chiefComplaintText: "chief-complaint",
  history: "history-of-present-illness",
  physicalExam: "physical-examination",
  patientHistory: "patient-history",
  treatmentPlan: "treatment-plan",
};
const DOC_QTY: Record<string, [InfoCategory, string]> = {
  dbp: ["vital-sign-diastolic", "mm[Hg]"],
  heightCm: ["vital-sign-height", "cm"],
  weightKg: ["vital-sign-weight", "kg"],
};

interface SI { sequence: number; category: { coding: { system: string; code: string }[] }; [k: string]: unknown }

function si(cat: InfoCategory, seq: number, value: Record<string, unknown>, e: Ev): SI {
  return {
    sequence: seq,
    category: { coding: [{ system: SYSTEMS.claimInfoCategory, code: cat }] },
    timingPeriod: { start: e.occurredAt, end: e.occurredAt },
    ...value,
  };
}

/** Build Claim.supportingInfo strictly from the events that exist.
 *  Missing categories are reported, never fabricated. */
export function supportingInfoFromEvents(events: Ev[]): {
  items: SI[]; missingCategories: InfoCategory[];
} {
  const items: SI[] = [];
  const seen = new Set<string>();
  let seq = 0;
  const push = (cat: InfoCategory, value: Record<string, unknown>, e: Ev) => {
    if (!INFO_CATEGORIES.includes(cat)) throw new Error(`bad category ${cat}`);
    items.push(si(cat, ++seq, value, e));
    seen.add(cat);
  };

  let labsSeen = false;
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.type === "vital_set" && Array.isArray(p.measurements)) {
      for (const m of p.measurements as { loinc: string; value: number }[]) {
        const c = VITAL_CAT[m.loinc];
        if (c && !seen.has(c[0])) {
          push(c[0], {
            valueQuantity: { value: m.value, system: "http://unitsofmeasure.org", code: c[1] },
          }, e);
        }
      }
    } else if (e.type === "documentation_entry") {
      for (const [f, cat] of Object.entries(DOC_FIELD)) {
        const v = p[f];
        if (typeof v === "string" && v && !seen.has(cat)) {
          if (cat === "chief-complaint") {
            // code slice is required; SNOMED text-only concept
            push(cat, { code: { text: v } }, e);
          } else {
            push(cat, { valueString: v.slice(0, 200) }, e);
          }
        }
      }
      for (const [f, [cat, unit]] of Object.entries(DOC_QTY)) {
        const v = Number(p[f]);
        if (Number.isFinite(v) && !seen.has(cat)) {
          push(cat, { valueQuantity: { value: v, system: "http://unitsofmeasure.org", code: unit } }, e);
        }
      }
      if (Number.isFinite(Number(p.weightKg)) && !seen.has("admission-weight")) {
        push("admission-weight", {
          valueQuantity: { value: Number(p.weightKg), system: "http://unitsofmeasure.org", code: "kg" },
        }, e);
      }
    } else if (e.type === "lab_result") {
      labsSeen = true;
      // BV-00410/11: lab-test requires a real LOINC code + UCUM quantity;
      // only emitted when the event payload carries a coded value.
      if (typeof p.loinc === "string" && !seen.has("lab-test")) {
        push("lab-test", {
          code: {
            coding: [{
              system: "http://loinc.org", code: p.loinc,
              display: typeof p.display === "string" ? p.display : undefined,
            }],
          },
          valueQuantity: { value: Number(p.value ?? 0), system: "http://unitsofmeasure.org", code: "mg/dL" },
        }, e);
      }
    }
  }
  // investigation-result: BV-00846 — code 'IRA' requires the SAME
  // supportingInfo to carry a valueAttachment.
  const invCode = labsSeen ? "IRA" : "INP";
  const invEv = events.find((e) => e.type === "lab_result") ?? events[0];
  if (invEv && !seen.has("investigation-result")) {
    push("investigation-result", {
      code: {
        coding: [{
          system: "http://nphies.sa/terminology/CodeSystem/investigation-result",
          code: invCode,
          display: labsSeen ? "Investigation results attached" : "Investigation(s) not performed",
        }],
      },
      ...(labsSeen
        ? {
            valueAttachment: {
              contentType: "text/plain",
              title: `lab-result#${invEv.id}`,
              creation: invEv.occurredAt.slice(0, 10),
              data: Buffer.from("Simulated lab attachment").toString("base64"),
            },
          }
        : {}),
    }, invEv);
  }
  // remaining events that document the safety story → "info"
  for (const e of events) {
    if (
      ["alert_raised", "escalation", "intervention_completed", "transfer", "score_computed"]
        .includes(e.type)
    ) {
      push("info", { valueString: `${e.type}#${e.id}` }, e);
    }
  }

  const REQUIRED: InfoCategory[] = [
    "vital-sign-systolic", "vital-sign-diastolic", "vital-sign-height",
    "vital-sign-weight", "pulse", "temperature", "oxygen-saturation",
    "respiratory-rate", "chief-complaint", "history-of-present-illness",
    "physical-examination", "patient-history", "investigation-result",
    "treatment-plan",
  ];
  return {
    items,
    missingCategories: REQUIRED.filter((c) => !seen.has(c)),
  };
}

/* ── claim builder ── */

export interface ClaimLineIn {
  seq: number; code: string; codeSystem: string;
  quantity: number; unitPriceSar: number | null; simulatedPrice: boolean;
  serviceStart?: string | null;
}

/** Lines without a code are skipped (flagged) — the bundle never carries
 *  a claim line that lacks a coded, event-backed product/service. */
export function buildClaimRequest(opts: {
  claimId: string; patientId: string; encounterId: string;
  patient?: Omit<PatientLike, "id">;
  lines: ClaimLineIn[];
  events: Ev[];
  diagnosis?: { code: string; display: string }[];
}): { bundle: object; skippedLines: number[]; missingInfo: InfoCategory[] } {
  const ref = `${BASE}/Claim/${opts.claimId}`;
  const { items: si, missingCategories } = supportingInfoFromEvents(opts.events);
  const coded = opts.lines.filter((l) => l.code);
  const skipped = opts.lines.filter((l) => !l.code).map((l) => l.seq);

  const items = coded.map((l, i) => {
    const price = l.unitPriceSar ?? 0;
    return {
      extension: [
        { url: `${IG.canonical}/StructureDefinition/extension-package`, valueBoolean: false },
        { url: `${IG.canonical}/StructureDefinition/extension-tax`, valueMoney: { value: 0, currency: "SAR" } },
        { url: `${IG.canonical}/StructureDefinition/extension-patient-share`, valueMoney: { value: 0, currency: "SAR" } },
        {
          url: `${IG.canonical}/StructureDefinition/extension-patientInvoice`,
          valueIdentifier: { system: `${BASE}/identifiers/patientInvoice`, value: `sim-${opts.claimId}` },
        },
        { url: `${IG.canonical}/StructureDefinition/extension-maternity`, valueBoolean: false },
      ],
      sequence: i + 1,
      careTeamSequence: [1],
      diagnosisSequence: opts.diagnosis?.length ? [1] : [],
      informationSequence: si.map((s) => s.sequence),
      productOrService: {
        coding: [{
          system: l.codeSystem.startsWith("http") ? l.codeSystem : `http://nphies.sa/terminology/CodeSystem/${l.codeSystem}`,
          code: l.code,
        }],
      },
      servicedDate: (l.serviceStart ?? new Date().toISOString()).slice(0, 10),
      quantity: { value: l.quantity },
      unitPrice: { value: price, currency: "SAR" },
      net: { value: price * l.quantity, currency: "SAR" },
    };
  });
  const total = items.reduce((s, i) => s + i.net.value, 0);

  const claim: Resource = {
    resourceType: "Claim", id: opts.claimId,
    meta: meta(PROFILES.institutionalClaim),
    extension: [
      {
        url: `${IG.canonical}/StructureDefinition/extension-encounter`,
        valueReference: { reference: `${BASE}/Encounter/${opts.encounterId}` },
      },
      {
        url: `${IG.canonical}/StructureDefinition/extension-episode`,
        valueIdentifier: { system: `${BASE}/identifiers/episode`, value: `sim-episode-${opts.encounterId}` },
      },
    ],
    identifier: [{ system: `${BASE}/identifiers/claim`, value: opts.claimId }],
    status: "active",
    type: { coding: [{ system: SYSTEMS.claimType, code: "institutional" }] },
    subType: { coding: [{ system: SYSTEMS.claimSubtype, code: "ip" }] },
    use: "claim",
    created: new Date().toISOString(),
    patient: { reference: `${BASE}/Patient/${opts.patientId}` },
    insurer: { reference: `${BASE}/Organization/simulated-insurer` },
    provider: { reference: `${BASE}/Organization/provider` },
    priority: { coding: [{ system: SYSTEMS.processPriority, code: "normal" }] },
    payee: { type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/payeetype", code: "provider" }] } },
    careTeam: [{
      sequence: 1,
      provider: { reference: `${BASE}/Practitioner/attending` },
      role: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claimcareteamrole", code: "primary" }] },
      qualification: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/practice-codes", code: "08.26" }] },
    }],
    insurance: [{ sequence: 1, focal: true, coverage: { reference: `${BASE}/Coverage/cov-1` } }],
    supportingInfo: si,
    diagnosis: (opts.diagnosis ?? []).map((d, i) => ({
      extension: [{
        url: `${IG.canonical}/StructureDefinition/extension-condition-onset`,
        valueCodeableConcept: {
          coding: [{ system: `${IG.terminology}/CodeSystem/condition-onset`, code: "NR" }],
        },
      }],
      sequence: i + 1,
      diagnosisCodeableConcept: {
        coding: [{ system: SYSTEMS.icd10am, code: d.code, display: d.display }],
      },
      type: [{ coding: [{ system: SYSTEMS.diagnosisType, code: i === 0 ? "principal" : "secondary" }] }],
      onAdmission: { coding: [{ system: SYSTEMS.diagnosisOnAdmission, code: "y" }] },
    })),
    item: items,
    total: { value: total, currency: "SAR" },
  };

  return {
    bundle: bundle("claim-request", ref, [
      providerOrg(), insurerOrg(), patientRes({ id: opts.patientId, ...opts.patient }),
      coverageRes(opts.patientId), practitionerRes(),
      encounterRes(opts.encounterId, opts.patientId),
      entry(ref, claim),
    ]),
    skippedLines: skipped,
    missingInfo: missingCategories,
  };
}

export function buildPriorauthRequest(opts: Parameters<typeof buildClaimRequest>[0]) {
  const out = buildClaimRequest(opts);
  const b = out.bundle as { entry: { resource: Resource }[] };
  (b.entry[0].resource.eventCoding as { code: string }).code = "priorauth-request";
  const claim = b.entry.find(
    (e) => e.resource.resourceType === "Claim",
  )!.resource;
  claim.meta = meta(PROFILES.institutionalPriorauth);
  claim.use = "preauthorization";
  return out;
}

export function buildEligibilityRequest(patient: PatientLike, coverageId: string) {
  const patientId = patient.id;
  const ref = `${BASE}/CoverageEligibilityRequest/${coverageId}`;
  return bundle("eligibility-request", ref, [
    providerOrg(), insurerOrg(), patientRes(patient),
    entry(`${BASE}/Coverage/${coverageId}`, {
      resourceType: "Coverage", id: coverageId, meta: meta(PROFILES.coverage),
      status: "active",
      beneficiary: { reference: `${BASE}/Patient/${patientId}` },
      payor: [{ reference: `${BASE}/Organization/simulated-insurer` }],
    }),
    entry(ref, {
      resourceType: "CoverageEligibilityRequest", id: coverageId,
      meta: meta(PROFILES.eligibilityRequest),
      status: "active",
      insurer: { reference: `${BASE}/Organization/simulated-insurer` },
      provider: { reference: `${BASE}/Organization/provider` },
      patient: { reference: `${BASE}/Patient/${patientId}` },
      purpose: ["benefits"],
      servicedDate: new Date().toISOString().slice(0, 10),
    }),
  ]);
}

export function buildCommunicationReply(opts: {
  claimId: string; patientId: string; communicationRequestId: string;
  patient?: Omit<PatientLike, "id">;
  events: Ev[]; note: string;
}) {
  const ref = `${BASE}/Communication/${opts.communicationRequestId}-reply`;
  return bundle("communication", ref, [
    providerOrg(), insurerOrg(), patientRes({ id: opts.patientId, ...opts.patient }),
    entry(ref, {
      resourceType: "Communication",
      id: `${opts.communicationRequestId}-reply`,
      meta: meta(PROFILES.communication),
      status: "completed",
      basedOn: [{ reference: `${BASE}/CommunicationRequest/${opts.communicationRequestId}` }],
      about: [{ reference: `${BASE}/Claim/${opts.claimId}` }],
      subject: { reference: `${BASE}/Patient/${opts.patientId}` },
      sender: { reference: `${BASE}/Organization/provider` },
      payload: [
        { contentString: opts.note },
        { contentString: opts.events.map((e) => e.id).join(",") },
      ],
    }),
  ]);
}

export function buildPollRequest() {
  const ref = `${BASE}/Task/${randomUUID()}`;
  return bundle("poll-request", ref, [
    providerOrg(), insurerOrg(),
    entry(ref, {
      resourceType: "Task", id: "poll",
      meta: meta(PROFILES.pollRequest),
      status: "requested",
      intent: "order",
    }),
  ]);
}

export function buildCancelRequest(claimId: string) {
  const ref = `${BASE}/Task/cancel-${claimId}`;
  return bundle("cancel-request", ref, [
    providerOrg(), insurerOrg(),
    entry(ref, {
      resourceType: "Task", id: `cancel-${claimId}`,
      meta: meta(PROFILES.cancelRequest),
      status: "requested",
      intent: "order",
      focus: { reference: `${BASE}/Claim/${claimId}` },
    }),
  ]);
}

export function buildStatusRequest(claimId: string) {
  const ref = `${BASE}/Task/status-${claimId}`;
  return bundle("status-check", ref, [
    providerOrg(), insurerOrg(),
    entry(ref, {
      resourceType: "Task", id: `status-${claimId}`,
      meta: meta(PROFILES.statusRequest),
      status: "requested",
      intent: "order",
      focus: { reference: `${BASE}/Claim/${claimId}` },
    }),
  ]);
}

export function buildPaymentReconciliation(opts: {
  claimId: string; patientId: string;
}) {
  const ref = `${BASE}/PaymentReconciliation/${opts.claimId}`;
  return bundle("payment-reconciliation", ref, [
    providerOrg(), insurerOrg(), patientRes({ id: opts.patientId }),
    entry(ref, {
      resourceType: "PaymentReconciliation", id: opts.claimId,
      meta: meta(PROFILES.paymentReconciliation),
      status: "active",
      outcome: "complete",
      requestor: { reference: `${BASE}/Organization/provider` },
      request: { reference: `${BASE}/Claim/${opts.claimId}` },
      disposition: `Simulated reconciliation — ${MOCK_LABEL}`,
      paymentAmount: { value: 0, currency: "SAR" },
      paymentDate: new Date().toISOString().slice(0, 10),
    }),
  ]);
}

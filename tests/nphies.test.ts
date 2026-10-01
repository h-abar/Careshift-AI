/**
 * C10 — NPHIES bundle builders, internal validator, mock, send gate.
 * The official HL7 validator run is a script/CI step (java), tested
 * separately via scripts/validate-nphies-bundle.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  buildClaimRequest, buildPriorauthRequest, buildEligibilityRequest,
  buildCommunicationReply, buildPollRequest, buildCancelRequest,
  buildStatusRequest, buildPaymentReconciliation,
  supportingInfoFromEvents, type Ev,
} from "@/lib/nphies/bundle";
import { validateBundle } from "@/lib/nphies/validate";
import { processMessage } from "@/lib/nphies/mock";
import {
  IG, PROFILES, MESSAGE_EVENTS, INFO_CATEGORIES, SYSTEMS,
} from "@/lib/nphies/terminology";

const now = new Date().toISOString();
const EVENTS: Ev[] = [
  {
    id: "ev-v1", type: "vital_set", occurredAt: now, hash: "a".repeat(64),
    payload: {
      measurements: [
        { loinc: "8480-6", value: 98 }, { loinc: "8867-4", value: 128 },
        { loinc: "9279-1", value: 28 }, { loinc: "8310-5", value: 38.4 },
        { loinc: "59408-5", value: 94 },
      ],
    },
  },
  {
    id: "ev-d1", type: "documentation_entry", occurredAt: now, hash: "b".repeat(64),
    payload: {
      dbp: 78, heightCm: 162, weightKg: 58,
      chiefComplaintText: "Vomiting", history: "DKA trajectory",
      physicalExam: "Dehydrated", patientHistory: "T1DM",
      treatmentPlan: "IV insulin",
    },
  },
  { id: "ev-l1", type: "lab_result", occurredAt: now, hash: "c".repeat(64),
    payload: { key: "glucose", value: 380, loinc: "2339-0", display: "Glucose [Mass/volume] in Blood" } },
  { id: "ev-a1", type: "alert_raised", occurredAt: now, hash: "d".repeat(64) },
];

const CLAIM = {
  claimId: "CL-T1", patientId: "P-1042", encounterId: "enc-P-1042",
  lines: [{
    seq: 1, code: "13882-00-00",
    codeSystem: "http://nphies.sa/terminology/CodeSystem/procedures",
    quantity: 1, unitPriceSar: 400, simulatedPrice: true,
  }],
  events: EVENTS,
  diagnosis: [{ code: "E10.10", display: "T1DM with ketoacidosis" }],
};

type Bundle = {
  entry: { resource: Record<string, never> & { [k: string]: unknown } }[];
  resourceType: string; type: string;
};

describe("canonical URLs come from the IG package", () => {
  it("every PROFILES url resolves inside the package", () => {
    for (const [k, v] of Object.entries(PROFILES)) {
      const base = v.split("|")[0];
      expect(
        base.startsWith(IG.canonical + "/"),
        `${k}: ${base} not under IG canonical`,
      ).toBe(true);
    }
    expect(IG.name).toBe("nphies-fs");
    expect(IG.notForPublication).toBe(true);
    expect(existsSync("knowledge/nphies-ig/package.tgz")).toBe(true);
    // extracted package.json exists locally (gitignored); verify when present
    const igPath = "knowledge/nphies-ig/package/package.json";
    if (existsSync(igPath)) {
      const pkg = JSON.parse(readFileSync(igPath, "utf-8"));
      expect(pkg.name).toBe(IG.name);
      expect(pkg.version).toBe(IG.version);
    }
  });
});

describe("message bundles", () => {
  it("MessageHeader is first entry with a ksa-message-events code", () => {
    for (const b of [
      buildClaimRequest(CLAIM).bundle, buildEligibilityRequest({ id: "P-1042" }, "cov-1"),
      buildPollRequest(), buildCancelRequest("CL-T1"), buildStatusRequest("CL-T1"),
      buildPaymentReconciliation({ claimId: "CL-T1", patientId: "P-1042" }),
    ] as Bundle[]) {
      expect(b.resourceType).toBe("Bundle");
      expect(b.type).toBe("message");
      const mh = b.entry[0].resource;
      expect(mh.resourceType).toBe("MessageHeader");
      expect(MESSAGE_EVENTS).toContain(mh.eventCoding.code);
      expect(mh.eventCoding.system).toBe(SYSTEMS.messageEvents);
      expect(mh.focus[0].reference).toBeTruthy();
    }
  });

  it("claim-request passes the internal validator", () => {
    const { bundle } = buildClaimRequest(CLAIM);
    const errs = validateBundle(bundle).filter((i) => i.severity === "error");
    expect(errs).toEqual([]);
  });

  it("priorauth-request flips event code and use", () => {
    const { bundle } = buildPriorauthRequest(CLAIM) as { bundle: Bundle };
    const mh = bundle.entry[0].resource;
    expect(mh.eventCoding.code).toBe("priorauth-request");
    const claim = bundle.entry.find((e) => e.resource.resourceType === "Claim")!.resource;
    expect(claim.use).toBe("preauthorization");
  });

  it("lines without codes are skipped — never fabricated", () => {
    const out = buildClaimRequest({
      ...CLAIM,
      lines: [...CLAIM.lines, { seq: 2, code: "", codeSystem: "procedures", quantity: 1, unitPriceSar: null, simulatedPrice: false }],
    });
    expect(out.skippedLines).toEqual([2]);
    const claim = (out.bundle as Bundle).entry.find((e) => e.resource.resourceType === "Claim")!.resource;
    expect(claim.item).toHaveLength(1);
  });
});

describe("supportingInfo is built from events only", () => {
  it("covers the IG-required categories when events exist", () => {
    const { items, missingCategories } = supportingInfoFromEvents(EVENTS);
    expect(missingCategories).toEqual([]);
    const cats = items.map(
      (i) => (i as { category: { coding: { code: string }[] } }).category.coding[0].code,
    );
    for (const c of cats) expect(INFO_CATEGORIES).toContain(c);
    expect(cats).toContain("vital-sign-systolic");
    expect(cats).toContain("history-of-present-illness");
    expect(cats).toContain("investigation-result");
  });

  it("reports missing categories honestly when no vitals exist", () => {
    const { missingCategories } = supportingInfoFromEvents([EVENTS[3]]);
    expect(missingCategories).toContain("vital-sign-systolic");
  });

  it("rejects a category that is not in the IG list", () => {
    expect(INFO_CATEGORIES).not.toContain("invented-category");
  });
});

describe("communication replies use existing events only", () => {
  it("payload references only provided event ids", () => {
    const b = buildCommunicationReply({
      claimId: "CL-T1", patientId: "P-1042",
      communicationRequestId: "CR-9", events: EVENTS, note: "see events",
    }) as Bundle;
    const comm = b.entry.find((e) => e.resource.resourceType === "Communication")!.resource;
    expect(comm.payload[1].contentString).toContain("ev-v1");
    expect(comm.payload[1].contentString).not.toContain("ev-fake");
  });
});

describe("simulated mock and send gate", () => {
  it("mock acknowledges a valid bundle and queues a response", () => {
    const { bundle } = buildClaimRequest(CLAIM);
    const r = processMessage(bundle);
    expect(r.status).toBe(200);
    expect(r.acknowledgement).toBeTruthy();
  });

  it("mock rejects a structurally invalid bundle", () => {
    const r = processMessage({ resourceType: "Bundle", type: "collection" });
    expect(r.status).toBe(400);
  });

  it("no outbound call happens without full sandbox env", async () => {
    delete process.env.NPHIES_ENV;
    delete process.env.NPHIES_ENDPOINT;
    const { sendBundle, nphiesConfigured } = await import("@/lib/nphies/send");
    expect(nphiesConfigured()).toBe(false);
    const { bundle } = buildClaimRequest(CLAIM);
    const r = await sendBundle(bundle);
    expect(r.via).toBe("mock");
  });
});

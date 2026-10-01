/**
 * GENERATED from the official NPHIES IG package (see
 * scripts/extract-nphies-ig.ts). Do not edit by hand.
 * IG: nphies-fs 1.0.0 · package date 20251203142743 ·
 * notForPublication=True · terminology coverage
 * is partial (SBS/SFDA lists are public fragments).
 */

export const IG = {
  name: "nphies-fs",
  version: "1.0.0",
  date: "20251203142743",
  notForPublication: true,
  canonical: "http://nphies.sa/fhir/ksa/nphies-fs",
  terminology: "http://nphies.sa/terminology",
} as const;

const P = `${IG.canonical}/StructureDefinition`;
export const PROFILES = {
  bundle: `${P}/bundle|${IG.version}`,
  messageHeader: `${P}/message-header|${IG.version}`,
  institutionalClaim: `${P}/institutional-claim|${IG.version}`,
  institutionalPriorauth: `${P}/institutional-priorauth|${IG.version}`,
  claimResponse: `${P}/claim-response|${IG.version}`,
  priorAuthResponse: `${P}/prior-auth-response|${IG.version}`,
  eligibilityRequest: `${P}/eligibility-request|${IG.version}`,
  eligibilityResponse: `${P}/eligibility-response|${IG.version}`,
  communication: `${P}/communication|${IG.version}`,
  communicationRequest: `${P}/communication-request|${IG.version}`,
  pollRequest: `${P}/poll-request|${IG.version}`,
  pollResponse: `${P}/poll-response|${IG.version}`,
  statusRequest: `${P}/status-request|${IG.version}`,
  statusResponse: `${P}/status-response|${IG.version}`,
  cancelRequest: `${P}/cancel-request|${IG.version}`,
  cancelResponse: `${P}/cancel-response|${IG.version}`,
  paymentReconciliation: `${P}/payment-reconciliation|${IG.version}`,
  paymentNotice: `${P}/payment-notice|${IG.version}`,
  patient: `${P}/patient|${IG.version}`,
  coverage: `${P}/coverage|${IG.version}`,
  providerOrg: `${P}/provider-organization|${IG.version}`,
  insurerOrg: `${P}/insurer-organization|${IG.version}`,
  practitioner: `${P}/practitioner|${IG.version}`,
  encounterClaimIMP: `${P}/encounter-claim-IMP|${IG.version}`,
  encounterAuthIMP: `${P}/encounter-auth-IMP|${IG.version}`,
  taskBase: `${P}/task-base|${IG.version}`,
} as const;

export const SYSTEMS = {
  messageEvents: "http://nphies.sa/terminology/CodeSystem/ksa-message-events",
  claimInfoCategory: "http://nphies.sa/terminology/CodeSystem/claim-information-category",
  adjudicationReason: "http://nphies.sa/terminology/CodeSystem/adjudication-reason",
  icd10am: "http://hl7.org/fhir/sid/icd-10-am",
  claimType: "http://terminology.hl7.org/CodeSystem/claim-type",
  processPriority: "http://terminology.hl7.org/CodeSystem/processpriority",
  diagnosisType: "http://nphies.sa/terminology/CodeSystem/diagnosis-type",
  diagnosisOnAdmission: "http://nphies.sa/terminology/CodeSystem/diagnosis-on-admission",
  conditionOnset: "http://nphies.sa/terminology/CodeSystem/condition-onset",
  claimSubtype: "http://nphies.sa/terminology/CodeSystem/claim-subtype",
} as const;

/** ksa-message-events codes — IG package, verbatim. */
export const MESSAGE_EVENTS = [
 "claim-request",
 "cancel-request",
 "communication-request",
 "batch-request",
 "payment-notice",
 "communication",
 "cancel-response",
 "eligibility-response",
 "eligibility-request",
 "nullify-request",
 "status-response",
 "status-check",
 "poll-request",
 "payment-reconciliation",
 "priorauth-request",
 "priorauth-response",
 "acknowledgement",
 "poll-response",
 "claim-response",
 "nullify-response",
 "error-notice",
 "batch-response",
 "advanced-authorization",
 "prescriber-response",
 "prescriber-request"
] as const;
export type MessageEvent = (typeof MESSAGE_EVENTS)[number];

/** claim-information-category codes — IG package, verbatim. */
export const INFO_CATEGORIES = [
 "missingtooth",
 "info",
 "onset",
 "employmentImpacted",
 "attachment",
 "icu-hours",
 "ventilation-hours",
 "vital-sign-systolic",
 "days-supply",
 "reason-for-visit",
 "vital-sign-height",
 "lab-test",
 "chief-complaint",
 "vital-sign-diastolic",
 "vital-sign-weight",
 "birth-weight",
 "respiratory-rate",
 "oxygen-saturation",
 "pulse",
 "last-menstrual-period",
 "temperature",
 "history-of-present-illness",
 "physical-examination",
 "patient-history",
 "admission-weight",
 "morphology",
 "treatment-plan",
 "investigation-result",
 "estimated-Length-of-Stay"
] as const;
export type InfoCategory = (typeof INFO_CATEGORIES)[number];

/** simulated mock marker — every locally produced/consumed bundle. */
export const MOCK_LABEL = "Simulated NPHIES - not the real platform";

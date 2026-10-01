# NPHIES integration — تكامل نفيس

**Status:** provider-side adapter, **sandbox-only**, **not certified**, no live
connectivity. Every outbound message is labeled `Simulated NPHIES — not the
real platform` unless the full sandbox configuration is present.

## Facts (verified against the local IG package)

NPHIES is the national gateway between providers and insurers/TPAs. eClaims
use **HL7 FHIR R4.0.1 message Bundles**: `Bundle.type = message`, a
`MessageHeader` as the first entry, `eventCoding` from
`http://nphies.sa/terminology/CodeSystem/ksa-message-events`, posted to a
single `$process-message` endpoint over HTTPS with mutual certificates.
NPHIES validates messages; it does not adjudicate (payers return
`ClaimResponse` / `PaymentReconciliation`).

Local package: **`nphies-fs` 1.0.0**, dated `20251203142743`, marked
`notForPublication`, stored at `knowledge/nphies-ig/package/` (+ `package.tgz`).
The name, version, and date are stamped on bundles and audit rows
(`IG` in `lib/nphies/terminology.ts`).

## Module map — `lib/nphies/`

| File | Role |
|---|---|
| `terminology.ts` | Canonical URLs, profile URLs, `ksa-message-events` codes, `claim-information-category` codes — verbatim from the package. Nothing hardcoded outside the IG. |
| `bundle.ts` | Builders: `buildClaimRequest`, `buildPriorauthRequest`, `buildEligibilityRequest`, `buildCommunicationReply`, `buildPollRequest`, `buildCancelRequest`, `buildStatusRequest`, `buildPaymentReconciliation`. `supportingInfoFromEvents()` maps hash-chained `ClinicalEvent`s → `Claim.supportingInfo` using only `claim-information-category` codes that exist in the package. |
| `validate.ts` | Internal structural validator: message type, MessageHeader first + valid event code, profile presence on every entry, internal reference resolution, category whitelist. |
| `mock.ts` | `processMessage()` — Simulated NPHIES endpoint. Validates, returns an `acknowledgement` bundle and queues a response bundle for poll. |
| `send.ts` | Outbound gate. Internal validation first; real POST only when `NPHIES_ENV=sandbox` **and** `NPHIES_ENDPOINT`, `NPHIES_CLIENT_CERT`, `NPHIES_CLIENT_KEY` are all set. Otherwise everything goes to the mock. |

Route: `POST /api/nphies/send` (`claims_edit` permission, audited, bundle hash logged).

## Event → bundle mapping

- `vital_set` measurements (LOINC) → `vital-sign-systolic/diastolic`,
  `pulse`, `respiratory-rate`, `temperature`, `oxygen-saturation`.
- `documentation_entry` → `chief-complaint`, `history-of-present-illness`,
  `physical-examination`, `patient-history`, `treatment-plan`,
  `vital-sign-height`, `vital-sign-weight`, `admission-weight`.
- `lab_result` with a LOINC code → `lab-test` (BV-00410/11);
  lab activity → `investigation-result` (`IRA` + `valueAttachment`, or
  `INP` when no investigation events exist).
- `alert_raised`, `escalation`, `intervention_completed`, `transfer`,
  `score_computed` → `info` entries carrying `type#eventId` — the safety
  chain the insurer can verify against the hash-chained event package (C5).
- Event → claim linkage that NPHIES has no field for stays in the
  internal evidence package (C5) — we do not add non-IG extensions.

Claim lines **without a code are skipped** and reported in
`skippedLines` — the bundle never carries an uncoded line. Missing
required supportingInfo categories are reported in `missingCategories`
rather than fabricated.

## Validation — what actually runs

1. **Internal validator** (`validateBundle`) on every bundle before any
   send — including sends to the mock.
2. **Official HL7 FHIR validator**:
   `java -jar tools/fhir/validator_cli.jar tmp/bundle.json -version 4.0.1 -ig knowledge/nphies-ig/package.tgz`
   (validator 6.10.4, FHIR 4.0.1, `nphies-fs#1.0.0` loaded — 376 resources).
   `scripts/gen-sample-bundle.ts` produces `tmp/bundle.json`;
   `scripts/validate-nphies-bundle.ts` runs the internal check.

### Latest official validator result (2026-10-01, real output)

```
*FAILURE*: 3 errors, 9 warnings, 6 notes
  Error  Encounter/enc-P-1042  BV-00740: 'Extension CauseOfDeath is
         required if dischargeDisposition is died or Emergency
         department Disposition is DED or DOA.'
  Error  Claim.extension[0] (encounter reference) — 2× cascade of the
         Encounter failing its own profile
Warnings: dom-6 missing narrative (best practice), ICD-10-AM code system
         not available to the terminology server (code unverifiable).
```

**Known limitation — `BV-00740`:** the invariant published in this
`notForPublication` package

```
(hospitalization.exists() implies dischargeDisposition.exists()
  implies dischargeDisposition.coding.first().code = 'died')
  or (ED disposition = 'DED') or ('DOA') implies causeOfDeath.exists()
```

evaluates (under the released validator) as requiring
`extension-causeOfDeath` on **every** IMP/SS/EMER claim encounter —
discharge `home`, `in-hospital`, or absent all fail. The official example
only passes because its patient died. We keep the truthful fields
(`dischargeDisposition: home`) and report the error rather than add a
cause-of-death flag to a living patient. Everything else — MessageHeader,
Claim, Patient, Coverage, Practitioner, Organizations, supportingInfo
slices, terminology — validates clean. Re-check on the next IG release.

Terminology checks are partial by design of the package: SBS/medication
code systems ship as public fragments; NPHIES applies additional BV-rules
server-side. A green local validator run is **not** NPHIES conformance
certification.

## PDPL / audit

- Minimum necessary per use case: only profile-required elements plus
  event-linked supportingInfo. Patient name/birthDate are included only
  because the profile mandates them.
- Every bundle in/out is SHA-256 hashed and audited (who, why, which
  events, IG version).
- Health data is sensitive under PDPL; hosting stays in-Kingdom; any
  cross-border transfer would follow the PDPL transfer regulation;
  NCA ECC controls apply where relevant.
- **Never send real patient data to test/sandbox environments** (the IG
  forbids it). Demo identifiers (`SIMULATED-*`, iqama `2999999999`) are
  synthetic.

## Certification-readiness checklist

| Step | Source | Status |
|---|---|---|
| Vendor onboarding course + certification program | https://v-academy.nphies.sa/en/courses/11/system-vendors-onboarding-course | not started — registration required |
| Unified portal registration | nphies.sa portal | not started |
| Facility NHIC 14-digit ID (from Seha) | academy FAQ | not held — demo only |
| EOI form + IP whitelisting | nphies.sa forms | not submitted |
| PKI client certificate (mutual TLS) | IG security page | not held — `NPHIES_CLIENT_CERT`/`KEY` env slots exist |
| Conformance environment test cases | NPHIES conformance env | pending sandbox access |
| Production eligibility transaction (gate to production) | onboarding docs | not reached |
| Certification contact | onboarding@chi.gov.sa | unverified — not contacted |

Any step not confirmed on an official page is marked **unverified**.
Careshift claims **no certification and no live NPHIES connectivity**.

## Positioning

Provider-side, NPHIES-ready event source: one adapter serves all
insurers/TPAs through the national gateway, and every `supportingInfo`
item traces to hash-chained clinical events. Clinical-exchange
(unified health record) integration is **future work** — not claimed.

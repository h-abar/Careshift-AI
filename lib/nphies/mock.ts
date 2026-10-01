/**
 * C10 — Simulated NPHIES mock ("Simulated NPHIES - not the real
 * platform"). Accepts a message bundle, validates it structurally,
 * returns an acknowledgement Bundle and queues a response Bundle for
 * poll. No network, no real adjudication — deterministic responses.
 */
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { validateBundle } from "./validate";
import { MOCK_LABEL, PROFILES, SYSTEMS } from "./terminology";

interface Bundle { resourceType: string; entry: { resource: Record<string, unknown> }[] }

const queue: object[] = [];

/** response event per request event */
const _REPLY_EVENT: Record<string, string> = {
  "eligibility-request": "eligibility-response",
  "priorauth-request": "priorauth-response",
  "claim-request": "claim-response",
  "poll-request": "poll-response",
  "cancel-request": "cancel-response",
  "status-check": "status-response",
  "communication-request": "communication-request",
  communication: "acknowledgement",
  "payment-notice": "acknowledgement",
  "payment-reconciliation": "acknowledgement",
};

function ackBundle(ref: string, outcome: string, issues?: unknown[]): Bundle {
  return {
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "MessageHeader",
        id: `ack-${randomUUID().slice(0, 8)}`,
        meta: { profile: [PROFILES.messageHeader] },
        eventCoding: {
          system: SYSTEMS.messageEvents,
          code: outcome === "error" ? "error-notice" : "acknowledgement",
        },
        response: {
          identifier: ref,
          code: outcome === "error" ? "fatal-error" : "ok",
        },
        ...(issues?.length ? { details: { text: JSON.stringify(issues) } } : {}),
      },
    }],
  } as Bundle;
}

/** Claim-response queued for poll — simulated adjudication only. */
function claimResponseBundle(claimId: string): object {
  return {
    resourceType: "Bundle",
    meta: { profile: [PROFILES.bundle] },
    type: "message",
    entry: [
      { fullUrl: `urn:uuid:${randomUUID()}`, resource: {
        resourceType: "MessageHeader",
        meta: { profile: [PROFILES.messageHeader] },
        eventCoding: { system: SYSTEMS.messageEvents, code: "claim-response" },
        focus: [{ reference: `ClaimResponse/${claimId}` }],
      } },
      { fullUrl: `https://mock.nphies/ClaimResponse/${claimId}`, resource: {
        resourceType: "ClaimResponse",
        id: claimId,
        meta: { profile: [PROFILES.claimResponse] },
        status: "active",
        type: { coding: [{ system: SYSTEMS.claimType, code: "institutional" }] },
        use: "claim",
        outcome: "complete",
        disposition: MOCK_LABEL,
        request: { reference: `Claim/${claimId}` },
      } },
    ],
  };
}

/** Process a posted message bundle (the simulated $process-message). */
export function processMessage(bundle: unknown): {
  acknowledgement: object; status: number;
} {
  const issues = validateBundle(bundle);
  const errors = issues.filter((i) => i.severity === "error");
  const b = bundle as Bundle;
  const mh = b.entry?.[0]?.resource as
    | { id?: string; eventCoding?: { code?: string }; focus?: { reference?: string }[] }
    | undefined;
  const code = mh?.eventCoding?.code ?? "";

  if (errors.length) {
    return {
      acknowledgement: ackBundle(mh?.id ?? "?", "error", errors.map((e) => e.msg)),
      status: 400,
    };
  }

  // poll: drain queued messages
  if (code === "poll-request") {
    const msgs = queue.splice(0, queue.length);
    for (const m of msgs) {
      b.entry.push({ resource: m as Record<string, unknown> });
    }
  } else if (code === "claim-request") {
    const claimRef = mh?.focus?.[0]?.reference ?? "";
    queue.push(claimResponseBundle(claimRef.split("/").pop() ?? "unknown"));
  } else if (code === "priorauth-request") {
    const ref = mh?.focus?.[0]?.reference ?? "";
    queue.push(claimResponseBundle(`pa-${ref.split("/").pop() ?? "?"}`));
  }

  return { acknowledgement: ackBundle(mh?.id ?? "?", "ok"), status: 200 };
}

/** SHA-256 of a bundle for the audit trail. */
export function bundleHash(bundle: unknown): string {
  return createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
}

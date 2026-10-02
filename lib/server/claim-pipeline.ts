/**
 * E7 — automatic claim pipeline. Careshift does the work of the hospital
 * insurance clerk: a claim in "draft" is assembled from hash-chained
 * ClinicalEvents, checked against the C4 rule set, and either
 * auto-submitted to its payer or parked in "exception" with the exact
 * missing item and the role that must fix it. Re-running the pipeline
 * is idempotent — a fixed exception resubmits itself.
 *
 * Denials flow the other way: autoAppeal() matches the NPHIES reason
 * code to the event store, resubmits as a new version when the evidence
 * already covers it, or routes it to exception when a human must act.
 *
 * ClaimStatus additions: "draft" (not yet processed) and "exception"
 * (pipeline blocked). Both are system-owned — users cannot set them.
 */
import { prisma } from "@/lib/server/prisma";
import { appendEvent } from "@/lib/server/events";
import { notify, notifyPerm } from "@/lib/server/notify";
import { claimEvent, notifyClaimWatchers } from "@/lib/server/claims";
import { assembleClaim, ClaimAssemblyError } from "@/lib/server/claim-assembly";
import { runClaimChecks, type CheckIssue } from "@/lib/server/claim-checks";
import { appealEvidence } from "@/lib/server/adjudication";
import type { RoleKey } from "@/lib/types";

if (typeof window !== "undefined") {
  throw new Error("lib/server/claim-pipeline.ts is server-only");
}

const PIPELINE_STATUSES = ["draft", "exception"];

/** An issue only blocks submission when it maps to an official NPHIES
 *  adjudication-reason code — the same rule the simulated payer uses. */
const blocking = (issues: CheckIssue[]) => issues.filter((i) => i.seCode);

export interface ExceptionItem {
  kind: CheckIssue["kind"] | "assembly_failed" | "appeal_uncovered";
  detail: string;
  owner: RoleKey;
  seCode?: string | null;
}

/** Which role must clear each exception. */
function ownerFor(i: CheckIssue): RoleKey {
  if (i.kind === "doc_gap") {
    if (i.eventType === "vital_set") return "nurse";
    if (i.eventType === "lab_result") return "charge_nurse";
    return "doctor"; // documentation_entry / order
  }
  if (i.kind.startsWith("timing_")) return "charge_nurse";
  return "hospital_admin"; // billed_not_lived, missing_code, …
}

async function notifyOwners(items: ExceptionItem[], claimId: string) {
  const owners = [...new Set(items.map((i) => i.owner))];
  const users = await prisma.user.findMany({
    where: { roleKey: { in: owners }, status: "active" },
    select: { id: true },
  });
  for (const u of users) {
    await notify(u.id, "notif.claimException", "warning", {
      entityType: "claim",
      entityId: claimId,
      detail: items[0]?.detail ?? "",
    });
  }
}

/**
 * Process one claim: assemble → check → submit or exception.
 * Only "draft" and "exception" claims are touched.
 */
export async function processClaim(
  claimId: string,
  actorId = "system",
): Promise<"submitted" | "exception" | "skipped"> {
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: claimId },
    include: { lines: true },
  });
  if (!claim || !PIPELINE_STATUSES.includes(claim.status)) return "skipped";

  // 1) Assemble from the event store when the claim has no lines yet.
  if (claim.lines.length === 0) {
    try {
      await assembleClaim(claimId);
    } catch (e) {
      const items: ExceptionItem[] = [
        {
          kind: "assembly_failed",
          detail:
            e instanceof ClaimAssemblyError ? e.message : "assembly failed",
          owner: "hospital_admin",
        },
      ];
      await prisma.insuranceClaim.update({
        where: { id: claimId },
        data: { status: "exception", exceptionJson: JSON.stringify(items) },
      });
      await claimEvent(claimId, actorId, "exception_raised", items[0].detail);
      await notifyOwners(items, claimId);
      return "exception";
    }
  }

  // 2) Pre-submission checks — block on anything the payer would deny.
  const checks = await runClaimChecks(claimId);
  const bad = blocking(checks.issues);
  if (bad.length) {
    const items: ExceptionItem[] = bad.map((i) => ({
      kind: i.kind,
      detail: i.detail,
      owner: ownerFor(i),
      seCode: i.seCode,
    }));
    await prisma.insuranceClaim.update({
      where: { id: claimId },
      data: { status: "exception", exceptionJson: JSON.stringify(items) },
    });
    await claimEvent(
      claimId, actorId, "exception_raised",
      `${items.length} blocking check(s): ${items[0].detail}`,
    );
    await notifyOwners(items, claimId);
    return "exception";
  }

  // 3) Clean → auto-submit. "pending" = submitted, awaiting payer
  //    adjudication (the payer response itself stays "Simulated").
  const now = new Date();
  await prisma.insuranceClaim.update({
    where: { id: claimId },
    data: {
      status: "pending",
      autoSubmitted: true,
      submittedAt: now,
      exceptionJson: null,
      updatedBy: "pipeline",
    },
  });
  await claimEvent(claimId, actorId, "auto_submitted", claim.payerOrg ?? "");
  if (claim.patientId) {
    await appendEvent({
      patientId: claim.patientId,
      type: "claim_submitted",
      occurredAt: now,
      actorRole: "system",
      payload: {
        claimId,
        payerOrg: claim.payerOrg,
        version: claim.version,
        simulated: "Simulated",
      },
      sourceRecordId: `claim:${claimId}:submit:v${claim.version}`,
    });
  }
  await notifyClaimWatchers(claimId, actorId, "info", "auto_submitted");
  return "submitted";
}

/** Sweep every pipeline claim — called on the claims read path. */
export async function runClaimsPipeline(
  actorId = "system",
): Promise<{ submitted: number; exceptions: number }> {
  const rows = await prisma.insuranceClaim.findMany({
    where: { status: { in: PIPELINE_STATUSES } },
    select: { id: true },
  });
  let submitted = 0;
  let exceptions = 0;
  for (const r of rows) {
    const out = await processClaim(r.id, actorId);
    if (out === "submitted") submitted++;
    else if (out === "exception") exceptions++;
  }
  return { submitted, exceptions };
}

/**
 * Auto-appeal a denied claim: when the event store already answers the
 * NPHIES reason code, resubmit as a new version; otherwise park in
 * exception for a human. High-value claims (prototype threshold) wait
 * for explicit appeal_approve instead of auto-resubmitting.
 */
export async function autoAppeal(
  claimId: string,
  actorId = "system",
): Promise<"resubmitted" | "needs_approval" | "exception" | "skipped"> {
  const claim = await prisma.insuranceClaim.findUnique({
    where: { id: claimId },
    include: { lines: true },
  });
  if (!claim || claim.status !== "denied") return "skipped";

  const ev = await appealEvidence(claimId);
  const covered =
    !!ev.code && ev.missingEventTypes.length === 0 && ev.answeringEvents.length > 0;

  // Prototype threshold — plain env read (env() re-parses the whole
  // process env and must not run inside the pipeline hot path).
  const approvalSar = Number(process.env.APPEAL_APPROVAL_SAR ?? 50000) || 50000;
  if (covered && claim.amountSar > approvalSar) {
    const items: ExceptionItem[] = [
      {
        kind: "appeal_uncovered",
        detail: `evidence covers ${ev.code} — awaiting hospital_admin appeal approval (>${approvalSar} SAR, prototype threshold)`,
        owner: "hospital_admin",
        seCode: ev.code,
      },
    ];
    await prisma.insuranceClaim.update({
      where: { id: claimId },
      data: { status: "exception", exceptionJson: JSON.stringify(items) },
    });
    await claimEvent(claimId, actorId, "appeal_ready", items[0].detail);
    await notifyPerm("appeal_approve", "notif.claimException", "warning", {
      entityType: "claim", entityId: claimId, detail: items[0].detail,
    });
    return "needs_approval";
  }

  if (covered) {
    // Same versioning rule as the manual resubmit route — a NEW claim row.
    const versions = await prisma.insuranceClaim.count({
      where: { supersedesId: claimId },
    });
    const newId = `${claimId}-v${claim.version + versions + 1}`;
    await prisma.insuranceClaim.create({
      data: {
        id: newId,
        patientId: claim.patientId,
        amountSar: claim.amountSar,
        status: "draft",
        dxKey: claim.dxKey,
        losDays: claim.losDays,
        icuDays: claim.icuDays,
        evidenceJson: claim.evidenceJson,
        frictionJson: claim.frictionJson,
        payerOrg: claim.payerOrg,
        version: claim.version + versions + 1,
        supersedesId: claimId,
        updatedBy: "pipeline",
        lines: {
          create: claim.lines.map((l) => ({
            seq: l.seq, kind: l.kind, code: l.code, codeSystem: l.codeSystem,
            codeVersion: l.codeVersion, description: l.description,
            quantity: l.quantity, unitPriceSar: l.unitPriceSar,
            simulatedPrice: l.simulatedPrice,
            serviceStart: l.serviceStart, serviceEnd: l.serviceEnd,
            eventIdsJson: l.eventIdsJson, necessityJson: l.necessityJson,
            eventBacked: l.eventBacked, manualReason: l.manualReason,
            flagsJson: l.flagsJson,
          })),
        },
      },
    });
    await claimEvent(
      claimId, actorId, "auto_appeal",
      `${ev.code} covered by ${ev.answeringEvents.length} event(s) → ${newId}`,
    );
    const out = await processClaim(newId, actorId);
    return out === "submitted" ? "resubmitted" : "exception";
  }

  // Evidence does not answer the denial — a human must fix it.
  const items: ExceptionItem[] = [
    {
      kind: "appeal_uncovered",
      detail: `denial ${ev.code ?? "?"} not covered — missing: ${ev.missingEventTypes.join(", ") || "no code"}`,
      owner: "hospital_admin",
      seCode: ev.code,
    },
  ];
  await prisma.insuranceClaim.update({
    where: { id: claimId },
    data: { status: "exception", exceptionJson: JSON.stringify(items) },
  });
  await claimEvent(claimId, actorId, "exception_raised", items[0].detail);
  await notifyPerm("appeal_approve", "notif.claimException", "warning", {
    entityType: "claim", entityId: claimId, detail: items[0].detail,
  });
  return "exception";
}

/** Registry-computed pipeline KPIs for the /claims monitor. */
export async function pipelineStats() {
  const claims = await prisma.insuranceClaim.findMany({
    select: {
      status: true, autoSubmitted: true, submittedAt: true,
      version: true, supersedesId: true, patientId: true,
    },
  });
  const submitted = claims.filter(
    (c) => !PIPELINE_STATUSES.includes(c.status),
  );
  const auto = submitted.filter((c) => c.autoSubmitted).length;
  const exceptions = claims.filter((c) => c.status === "exception").length;
  const v1Decided = claims.filter(
    (c) => c.version === 1 && ["approved", "denied"].includes(c.status),
  );
  const firstPass =
    v1Decided.filter((c) => c.status === "approved").length;
  const resubmitted = claims.filter((c) => c.version > 1);
  const appealWon = resubmitted.filter((c) => c.status === "approved").length;

  // Median lag from the patient's last clinical event to submission.
  const lags: number[] = [];
  for (const c of submitted.filter((c) => c.submittedAt && c.patientId)) {
    const last = await prisma.clinicalEvent.findFirst({
      where: { patientId: c.patientId! },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    if (last) {
      lags.push((c.submittedAt!.getTime() - last.occurredAt.getTime()) / 3.6e6);
    }
  }
  lags.sort((a, b) => a - b);

  return {
    label: "Simulated",
    autoSubmitted: auto,
    autoRate: submitted.length ? Math.round((auto / submitted.length) * 100) : 0,
    exceptionCount: exceptions,
    firstPassRate: v1Decided.length
      ? Math.round((firstPass / v1Decided.length) * 100)
      : null,
    appealSuccessRate: resubmitted.length
      ? Math.round((appealWon / resubmitted.length) * 100)
      : null,
    medianSubmitHours: lags.length
      ? Math.round(lags[Math.floor(lags.length / 2)] * 10) / 10
      : null,
  };
}

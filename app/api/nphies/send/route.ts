/**
 * C10 — POST a message bundle for a claim through the NPHIES gate.
 * Default target is the Simulated mock; real outbound needs full sandbox
 * env config (see lib/nphies/send.ts). Every send is hashed + audited.
 */
import { z } from "zod";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { prisma } from "@/lib/server/prisma";
import { handle, ok, parseBody } from "@/lib/server/json";
import { sendBundle, nphiesConfigured } from "@/lib/nphies/send";
import { bundleHash } from "@/lib/nphies/mock";
import {
  buildClaimRequest, buildEligibilityRequest, buildPriorauthRequest,
  buildPollRequest, buildCancelRequest, buildStatusRequest,
  buildPaymentReconciliation,
} from "@/lib/nphies/bundle";
import { ENCOUNTER_ID } from "@/lib/server/events";
import { MOCK_LABEL, IG } from "@/lib/nphies/terminology";

const schema = z.object({
  claimId: z.string().min(1),
  message: z.enum([
    "eligibility-request", "priorauth-request", "claim-request",
    "poll-request", "cancel-request", "status-check",
    "payment-reconciliation",
  ]),
});

export const POST = handle(
  async (req: Request) => {
    const auth = await requirePerm("claims_view");
    const { data, error } = await parseBody(req, schema);
    if (error) return error;
    const { claimId, message } = data;

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id: claimId },
      include: { lines: true },
    });
    if (!claim) return Response.json({ error: "not found" }, { status: 404 });
    const patientId = claim.patientId ?? "unknown";
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    const patientLike = {
      id: patientId,
      name: patient?.nameEn,
      gender: patient?.sex === "M" ? "male" as const : "female" as const,
      birthDate: patient ? `${new Date().getFullYear() - patient.age}-01-01` : undefined,
    };

    let bundle: object;
    if (message === "poll-request") {
      bundle = buildPollRequest();
    } else if (message === "eligibility-request") {
      bundle = buildEligibilityRequest(patientLike, `cov-${claimId}`);
    } else if (message === "cancel-request") {
      bundle = buildCancelRequest(claimId);
    } else if (message === "status-check") {
      bundle = buildStatusRequest(claimId);
    } else if (message === "payment-reconciliation") {
      bundle = buildPaymentReconciliation({ claimId, patientId });
    } else {
      // claim-request / priorauth-request — supportingInfo from real events
      const evRows = await prisma.clinicalEvent.findMany({
        where: { patientId },
        orderBy: { occurredAt: "asc" },
      });
      const events = evRows.map((e) => ({
        id: e.id, type: e.type,
        occurredAt: e.occurredAt.toISOString(), hash: e.hash,
        payload: JSON.parse(e.payloadJson || "{}") as Record<string, unknown>,
      }));
      const opts = {
        claimId, patientId, encounterId: ENCOUNTER_ID(patientId),
        patient: patientLike,
        lines: claim.lines.map((l) => ({
          seq: l.seq, code: l.code, codeSystem: l.codeSystem,
          quantity: l.quantity, unitPriceSar: l.unitPriceSar,
          simulatedPrice: l.simulatedPrice,
        })),
        events,
      };
      bundle = message === "priorauth-request"
        ? buildPriorauthRequest(opts)
        : buildClaimRequest(opts);
    }

    const hash = bundleHash(bundle);
    const r = await sendBundle(bundle);
    await audit(
      {
        userId: auth.user.id,
        action: "nphies.send",
        entityType: "claim",
        entityId: claimId,
        next: {
          message, via: r.via, bundleHash: hash,
          ig: `${IG.name}@${IG.version}`,
        },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({
      via: r.via,
      status: r.status,
      acknowledgement: r.acknowledgement,
      label: r.via === "sandbox" ? r.label : MOCK_LABEL,
      bundleHash: hash,
      ig: { name: IG.name, version: IG.version, notForPublication: IG.notForPublication },
      configured: nphiesConfigured(),
    });
  },
);

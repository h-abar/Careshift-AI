/**
 * C3 — claim lines: list with supporting-event summaries (GET), or add
 * a manual line (POST). Manual lines require a reason and are flagged
 * not_event_backed — the event-backed hard rule is enforced in
 * lib/server/claim-assembly.ts.
 */
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { requirePerm, requireAnyPerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { addManualLine, ClaimAssemblyError } from "@/lib/server/claim-assembly";
import { handle, ok, parseBody } from "@/lib/server/json";

const manualLineSchema = z.object({
  kind: z.enum(["service", "procedure", "bed_day", "medication", "lab"]),
  code: z.string().max(64),
  codeSystem: z.string().max(32).optional(),
  quantity: z.number().positive().max(10000),
  reason: z.string().min(3).max(500),
  description: z.string().max(200).optional(),
});

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAnyPerm(["claims_edit", "insurance_view"]);
    const { id } = await ctx.params;
    const lines = await prisma.claimLine.findMany({
      where: { claimId: id }, orderBy: { seq: "asc" },
    });
    if (!lines.length) {
      const claim = await prisma.insuranceClaim.findUnique({
        where: { id }, select: { id: true },
      });
      if (!claim) return Response.json({ error: "not found" }, { status: 404 });
    }
    const eventIds = lines.flatMap((l) => JSON.parse(l.eventIdsJson) as string[]);
    const evRows = eventIds.length
      ? await prisma.clinicalEvent.findMany({
          where: { id: { in: eventIds } },
          select: {
            id: true, type: true, occurredAt: true,
            actorRole: true, payloadJson: true, hash: true,
          },
        })
      : [];
    const evMap = new Map(evRows.map((e) => [e.id, e]));
    return ok({
      lines: lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        kind: l.kind,
        code: l.code,
        codeSystem: l.codeSystem,
        codeVersion: l.codeVersion,
        description: l.description,
        quantity: l.quantity,
        unitPriceSar: l.unitPriceSar,
        simulatedPrice: l.simulatedPrice,
        serviceStart: l.serviceStart?.toISOString() ?? null,
        serviceEnd: l.serviceEnd?.toISOString() ?? null,
        eventBacked: l.eventBacked,
        manualReason: l.manualReason,
        flags: JSON.parse(l.flagsJson) as string[],
        necessityIds: JSON.parse(l.necessityJson) as string[],
        supportingEvents: (JSON.parse(l.eventIdsJson) as string[])
          .map((eid) => evMap.get(eid))
          .filter(Boolean)
          .map((e) => ({
            id: e!.id,
            type: e!.type,
            occurredAt: e!.occurredAt.toISOString(),
            actorRole: e!.actorRole,
            hash: e!.hash.slice(0, 12),
          })),
      })),
    });
  },
);

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("claims_edit");
    const { id } = await ctx.params;
    const parsed = await parseBody(req, manualLineSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    try {
      const line = await addManualLine(id, body);
      await audit({
        userId: auth.user.id,
        action: "claim.line.manual",
        entityType: "claim",
        entityId: id,
        next: { lineId: line.id, reason: body.reason },
        sessionId: auth.sid,
      }, req);
      return ok({ line });
    } catch (e) {
      if (e instanceof ClaimAssemblyError) {
        return Response.json({ error: e.message }, { status: 422 });
      }
      throw e;
    }
  },
);

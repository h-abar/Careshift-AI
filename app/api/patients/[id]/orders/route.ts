import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { appendEvent } from "@/lib/server/events";
import { handle, ok, parseBody } from "@/lib/server/json";
import { z } from "zod";

const orderSchema = z.object({
  kind: z.enum(["medication", "lab", "fluids", "monitoring", "consult"]),
  titleEn: z.string().min(3),
  titleAr: z.string().min(3),
  dose: z.string().optional(),
  route: z.string().optional(),
  frequency: z.string().optional(),
  priority: z.enum(["stat", "urgent", "routine"]).default("urgent"),
  instructions: z.string().optional(),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id: patientId } = await ctx.params;
    const { data: body, error } = await parseBody(req, orderSchema);
    if (error) return error;

    const event = await appendEvent({
      patientId,
      type: "order",
      occurredAt: new Date(),
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        kind: body.kind,
        titleEn: body.titleEn,
        titleAr: body.titleAr,
        dose: body.dose,
        route: body.route,
        frequency: body.frequency,
        priority: body.priority,
        instructions: body.instructions || "",
        orderedBy: auth.user.nameAr || auth.user.nameEn,
        orderedRole: auth.user.role,
        orderedAt: new Date().toISOString(),
        status: "active",
      },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "patient.order_create",
        entityType: "patient",
        entityId: patientId,
        sessionId: auth.sid,
        next: { eventId: event.id, title: body.titleEn, priority: body.priority },
      },
      req,
    );

    return ok({
      success: true,
      event: {
        id: event.id,
        patientId,
        occurredAt: event.occurredAt.toISOString(),
        titleAr: body.titleAr,
        titleEn: body.titleEn,
        kind: body.kind,
        priority: body.priority,
        hash: event.hash,
      },
    });
  },
);

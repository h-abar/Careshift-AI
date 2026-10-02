import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { appendEvent } from "@/lib/server/events";
import { handle, ok, parseBody } from "@/lib/server/json";
import { z } from "zod";

const marAdministerSchema = z.object({
  medicationName: z.string().min(2),
  dose: z.string().min(1),
  route: z.string().default("IV"),
  barcodeVerified: z.boolean().default(true),
  lotNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id: patientId } = await ctx.params;
    const { data: body, error } = await parseBody(req, marAdministerSchema);
    if (error) return error;

    const event = await appendEvent({
      patientId,
      type: "medication_administered",
      occurredAt: new Date(),
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        medicationName: body.medicationName,
        dose: body.dose,
        route: body.route,
        barcodeVerified: body.barcodeVerified,
        lotNumber: body.lotNumber || "LOT-2026-SA",
        administeredBy: auth.user.nameAr || auth.user.nameEn,
        administeredRole: auth.user.role,
        notes: body.notes || "",
        timestamp: new Date().toISOString(),
      },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "patient.med_administer",
        entityType: "patient",
        entityId: patientId,
        sessionId: auth.sid,
        next: {
          eventId: event.id,
          med: body.medicationName,
          dose: body.dose,
          barcodeVerified: body.barcodeVerified,
        },
      },
      req,
    );

    return ok({
      success: true,
      event: {
        id: event.id,
        patientId,
        occurredAt: event.occurredAt.toISOString(),
        medicationName: body.medicationName,
        dose: body.dose,
        route: body.route,
        barcodeVerified: body.barcodeVerified,
        hash: event.hash,
      },
    });
  },
);

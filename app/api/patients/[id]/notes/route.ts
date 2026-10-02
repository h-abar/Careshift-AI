import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { appendEvent } from "@/lib/server/events";
import { handle, ok, parseBody } from "@/lib/server/json";
import { z } from "zod";

const noteSchema = z.object({
  text: z.string().min(3, "Note text is required"),
  category: z.enum(["nursing_progress", "shift_assessment", "intervention_response", "general"]).default("nursing_progress"),
  correctsEventId: z.string().optional(),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id: patientId } = await ctx.params;
    const { data: body, error } = await parseBody(req, noteSchema);
    if (error) return error;

    const event = await appendEvent({
      patientId,
      type: "documentation_entry",
      occurredAt: new Date(),
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      correctsId: body.correctsEventId,
      correctionReason: body.correctsEventId ? "Appended updated clinical note version" : undefined,
      payload: {
        category: body.category,
        text: body.text,
        authorName: auth.user.nameAr || auth.user.nameEn,
        authorRole: auth.user.role,
        signedAt: new Date().toISOString(),
      },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "patient.nurse_note_create",
        entityType: "patient",
        entityId: patientId,
        sessionId: auth.sid,
        next: { eventId: event.id, category: body.category },
      },
      req,
    );

    return ok({
      success: true,
      event: {
        id: event.id,
        patientId,
        occurredAt: event.occurredAt.toISOString(),
        authorName: auth.user.nameAr || auth.user.nameEn,
        authorRole: auth.user.role,
        text: body.text,
        category: body.category,
        hash: event.hash,
      },
    });
  },
);

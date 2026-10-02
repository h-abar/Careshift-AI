import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { appendEvent } from "@/lib/server/events";
import { handle, ok, parseBody } from "@/lib/server/json";
import { z } from "zod";

const diagnosisSchema = z.object({
  code: z.string().min(3), // e.g. "A41.9"
  nameAr: z.string().min(3),
  nameEn: z.string().min(3),
  type: z.enum(["primary", "secondary"]).default("primary"),
  clinicalRationale: z.string().min(3),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id: patientId } = await ctx.params;
    const { data: body, error } = await parseBody(req, diagnosisSchema);
    if (error) return error;

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return Response.json({ error: "Patient not found" }, { status: 404 });

    const event = await appendEvent({
      patientId,
      type: "documentation_entry",
      occurredAt: new Date(),
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        action: "diagnosis_added",
        code: body.code,
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        diagnosisType: body.type,
        clinicalRationale: body.clinicalRationale,
        diagnosedBy: auth.user.nameAr || auth.user.nameEn,
        diagnosedAt: new Date().toISOString(),
      },
    });

    // Append to patient note/dx
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        noteAr: `${patient.noteAr} — [ICD-10 ${body.code} ${body.nameAr}]`,
        noteEn: `${patient.noteEn} — [ICD-10 ${body.code} ${body.nameEn}]`,
      },
    });

    await audit(
      {
        userId: auth.user.id,
        action: "patient.diagnosis_create",
        entityType: "patient",
        entityId: patientId,
        sessionId: auth.sid,
        next: { code: body.code, type: body.type, eventId: event.id },
      },
      req,
    );

    return ok({
      success: true,
      event: {
        id: event.id,
        patientId,
        occurredAt: event.occurredAt.toISOString(),
        code: body.code,
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        hash: event.hash,
      },
    });
  },
);

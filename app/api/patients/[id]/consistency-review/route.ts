import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { appendEvent } from "@/lib/server/events";
import { handle, ok, parseBody } from "@/lib/server/json";
import { z } from "zod";

const consistencyReviewSchema = z.object({
  findingId: z.string(),
  decision: z.enum(["confirm_diagnosis", "update_diagnosis", "dismiss"]),
  diagnosisCode: z.string().optional(),
  diagnosisAr: z.string().optional(),
  diagnosisEn: z.string().optional(),
  reason: z.string().min(3, "Clinical reason is required"),
});

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("patients_edit");
    const { id: patientId } = await ctx.params;
    const { data: body, error } = await parseBody(req, consistencyReviewSchema);
    if (error) return error;

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return Response.json({ error: "Patient not found" }, { status: 404 });

    // Record an immutable hash-chained event for the doctor's consistency decision
    await appendEvent({
      patientId,
      type: "doctor_decision",
      occurredAt: new Date(),
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      payload: {
        action: "clinical_consistency_review",
        findingId: body.findingId,
        decision: body.decision,
        diagnosisCode: body.diagnosisCode,
        diagnosisAr: body.diagnosisAr,
        diagnosisEn: body.diagnosisEn,
        clinicalReason: body.reason,
      },
    });

    // If doctor confirmed or updated diagnosis, also append to patient diagnoses in DB/notes
    if (body.decision === "confirm_diagnosis" || body.decision === "update_diagnosis") {
      const diagNote = `[ICD-10 ${body.diagnosisCode ?? "A41.9"}]: ${body.diagnosisAr || body.diagnosisEn || "Confirmed by physician"}`;
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          noteAr: `${patient.noteAr} — تم تأكيد التشخيص: ${diagNote}`,
          noteEn: `${patient.noteEn} — Diagnosis confirmed: ${diagNote}`,
        },
      });
    }

    await audit(
      {
        userId: auth.user.id,
        action: "patient.consistency_review",
        entityType: "patient",
        entityId: patientId,
        sessionId: auth.sid,
        next: {
          findingId: body.findingId,
          decision: body.decision,
          diagnosisCode: body.diagnosisCode,
          reason: body.reason,
        },
      },
      req,
    );

    return ok({
      success: true,
      decision: body.decision,
      patientId,
      messageAr:
        body.decision === "confirm_diagnosis"
          ? "تم تأكيد التشخيص السريري وحفظه في السجل الطبي بنجاح"
          : body.decision === "update_diagnosis"
            ? "تم تحديث التشخيص السريري في السجل الطبي بنجاح"
            : "تم حفظ التبرير السريري لعدم الصلة في سجل التدقيق",
      messageEn:
        body.decision === "confirm_diagnosis"
          ? "Diagnosis confirmed and added to medical chart successfully"
          : body.decision === "update_diagnosis"
            ? "Clinical diagnosis updated in medical chart successfully"
            : "Clinical non-relevance justification recorded in audit log",
    });
  },
);

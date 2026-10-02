import { requireAnyPerm, requirePerm } from "@/lib/server/session";
import { openNurseEscalationTask, runEscalationLadder } from "@/lib/server/doctor-tasks";
import { prisma } from "@/lib/server/prisma";
import { handle, ok, parseBody } from "@/lib/server/json";
import { nurseEscalationSchema } from "@/lib/schemas";

/**
 * E6 — open doctor action tasks. Doctors see their own queue; the charge
 * nurse sees the ward-wide queue for the chain-gap view. Reading the list
 * also advances the escalation ladder (prototype, no cron).
 */
export const GET = handle(async (req: Request) => {
  void req;
  const auth = await requireAnyPerm(["clinical_decide", "intervention_escalate"]);
  await runEscalationLadder();

  const all = auth.user.role === "charge_nurse" || auth.user.role === "admin";
  const tasks = await prisma.doctorTask.findMany({
    where: {
      ...(all ? {} : { doctorId: auth.user.id }),
      status: { in: ["open", "acknowledged", "reviewed"] },
    },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: 50,
  });
  const patients = await prisma.patient.findMany({
    where: { id: { in: tasks.map((t) => t.patientId) } },
    select: { id: true, nameEn: true, nameAr: true, room: true, dept: true },
  });
  const byId = new Map(patients.map((p) => [p.id, p]));

  return ok({
    tasks: tasks.map((t) => ({
      id: t.id,
      patientId: t.patientId,
      patient: byId.get(t.patientId) ?? null,
      level: t.level,
      score: t.score,
      status: t.status,
      ladderStep: t.ladderStep,
      acknowledgedAt: t.acknowledgedAt?.toISOString() ?? null,
      reviewedAt: t.reviewedAt?.toISOString() ?? null,
      decision: t.decision,
      createdAt: t.createdAt.toISOString(),
      waitingMin: Math.max(
        0,
        Math.round((Date.now() - t.createdAt.getTime()) / 60_000),
      ),
    })),
  });
});

/**
 * E8 — nurse-initiated escalation to doctor (Nurse Concern).
 * Creates an emergency DoctorTask and records a hash-chained ClinicalEvent.
 */
export const POST = handle(async (req: Request) => {
  const auth = await requirePerm("intervention_execute");
  const { data: b, error } = await parseBody(req, nurseEscalationSchema);
  if (error) return error;

  const taskId = await openNurseEscalationTask(
    b.patientId,
    auth.user.id,
    b.category,
    b.reason,
  );

  return ok({ taskId });
});


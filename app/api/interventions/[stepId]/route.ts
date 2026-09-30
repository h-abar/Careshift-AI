import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { dbPatient, invalidateSnapshots } from "@/lib/server/data";
import { assessClinicalRisk } from "@/lib/engines/clinical-risk";
import { buildInterventionPlan } from "@/lib/engines/interventions";
import { notify } from "@/lib/server/notify";
import { appendJourney } from "@/lib/server/journey";
import { audit } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { interventionSchema } from "@/lib/schemas";

/**
 * Intervention lifecycle (server-enforced state machine):
 *   pending → in_progress → done
 *   pending/in_progress → overdue (derived from dueAt, never stored)
 *   overdue → escalated → resolved
 * Terminal: done, resolved.
 */
const TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "done", "overdue"],
  in_progress: ["done", "overdue"],
  overdue: ["escalated", "done"],
  escalated: ["resolved"],
  done: [],
  resolved: [],
};

const ESCALATION_ROLES = new Set(["nurse", "charge_nurse", "physician"]);

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ stepId: string }> }) => {
    const { stepId } = await ctx.params;
    const { data: body, error } = await parseBody(req, interventionSchema);
    if (error) return error;
    if (body.status === "escalated" && (!body.escalatedTo || !ESCALATION_ROLES.has(body.escalatedTo))) {
      return Response.json({ error: "escalatedTo role required" }, { status: 400 });
    }
    if (body.dueAt !== undefined && Number.isNaN(Date.parse(body.dueAt))) {
      return Response.json({ error: "invalid dueAt" }, { status: 400 });
    }

    // Escalate/resolve are narrower permissions than executing a step.
    const auth = await requirePerm(
      body.status === "escalated" || body.status === "resolved"
        ? "intervention_escalate"
        : "intervention_execute",
    );

    // The step must exist in the patient's GENERATED intervention plan.
    const patient = await dbPatient(body.patientId);
    if (!patient) {
      return Response.json({ error: "patient not found" }, { status: 404 });
    }
    const plan = buildInterventionPlan(patient, assessClinicalRisk(patient));
    const planStep = plan.find((s) => s.id === stepId);
    if (!planStep) {
      return Response.json(
        { error: "stepId is not in this patient's intervention plan" },
        { status: 400 },
      );
    }

    // Validate assignee if provided (must exist + be active).
    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: body.assigneeId },
      });
      if (!assignee || assignee.status !== "active") {
        return Response.json({ error: "invalid assignee" }, { status: 400 });
      }
    }

    const prev = await prisma.interventionOverride.findUnique({
      where: { stepId },
    });
    // Current effective status: stored status, upgraded to "overdue" when
    // a real dueAt has already passed.
    const now = new Date();
    const current =
      prev?.dueAt && prev.dueAt < now &&
      (prev.status === "pending" || prev.status === "in_progress")
        ? "overdue"
        : (prev?.status ?? planStep.status);

    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(body.status)) {
      return Response.json(
        { error: `invalid transition ${current} → ${body.status}` },
        { status: 409 },
      );
    }

    const dueAt = body.dueAt ? new Date(body.dueAt) : prev?.dueAt ?? undefined;
    invalidateSnapshots();
    const row = await prisma.interventionOverride.upsert({
      where: { stepId },
      create: {
        stepId,
        patientId: body.patientId,
        status: body.status,
        escalatedTo: body.escalatedTo ?? null,
        assigneeId: body.assigneeId ?? null,
        dueAt: dueAt ?? (body.status === "in_progress"
          ? new Date(now.getTime() + (planStep.dueInMin || planStep.offsetMin || 15) * 60000)
          : null),
        note: body.note?.slice(0, 500) ?? "",
        startedAt: body.status === "in_progress" ? now : null,
        doneAt: body.status === "done" ? now : null,
        resolvedAt: body.status === "resolved" ? now : null,
        updatedBy: auth.user.id,
      },
      update: {
        status: body.status,
        escalatedTo: body.escalatedTo ?? undefined,
        assigneeId: body.assigneeId ?? undefined,
        dueAt,
        note: body.note !== undefined ? body.note.slice(0, 500) : undefined,
        startedAt:
          body.status === "in_progress" ? (prev?.startedAt ?? now) : undefined,
        doneAt: body.status === "done" ? now : undefined,
        resolvedAt: body.status === "resolved" ? now : undefined,
        updatedBy: auth.user.id,
      },
    });

    // Real triggers → notifications for the accountable people.
    const assignment = await prisma.assignment.findUnique({
      where: { patientId: body.patientId },
    });
    const roleUser: Record<string, string | undefined> = {
      nurse: assignment?.nurseId,
      charge_nurse: assignment?.chargeNurseId,
      physician: assignment?.physicianId,
    };
    if (body.status === "overdue") {
      const target = row.assigneeId ?? assignment?.nurseId;
      if (target) {
        await notify(target, "notif.interventionOverdue", "warning", {
          patientId: body.patientId,
          entityType: "intervention",
          entityId: stepId,
        });
      }
    }
    if (body.status === "escalated" && body.escalatedTo) {
      const target = roleUser[body.escalatedTo];
      if (target) {
        await notify(target, "notif.interventionEscalated", "critical", {
          patientId: body.patientId,
          entityType: "intervention",
          entityId: stepId,
          detail: body.escalatedTo,
        });
      }
      await appendJourney(body.patientId, {
        kind: "escalation",
        key: "escalated",
      });
    }
    if (body.status === "done" || body.status === "resolved") {
      await appendJourney(body.patientId, {
        kind: "action",
        key: "interventionDone",
      });
    }

    await audit(
      {
        userId: auth.user.id,
        action:
          body.status === "escalated"
            ? "intervention.escalate"
            : "intervention.status",
        entityType: "intervention",
        entityId: stepId,
        prev: { status: current },
        next: {
          status: body.status,
          escalatedTo: body.escalatedTo,
          assigneeId: body.assigneeId,
          dueAt: row.dueAt?.toISOString(),
        },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({ override: row });
  },
);

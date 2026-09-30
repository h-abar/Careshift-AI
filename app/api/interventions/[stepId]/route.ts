import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import type { InterventionStatus, Role } from "@/lib/types";

/** Persists an intervention step outcome (done / overdue / escalated). */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ stepId: string }> }) => {
    const { stepId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      patientId?: string;
      status?: InterventionStatus;
      escalatedTo?: Role;
    };
    if (!body.patientId || !body.status) {
      return Response.json({ error: "patientId + status required" }, { status: 400 });
    }

    // Escalation is a distinct, narrower permission than executing a step.
    const auth = await requirePerm(
      body.status === "escalated"
        ? "intervention_escalate"
        : "intervention_execute",
    );

    // Step ids are generated as `${patientId}-IV${n}` — reject foreign ids.
    if (!stepId.startsWith(`${body.patientId}-`)) {
      return Response.json(
        { error: "stepId does not belong to patientId" },
        { status: 400 },
      );
    }
    const patient = await prisma.patient.findUnique({
      where: { id: body.patientId },
    });
    if (!patient) {
      return Response.json({ error: "patient not found" }, { status: 404 });
    }

    const prev = await prisma.interventionOverride.findUnique({
      where: { stepId },
    });
    const row = await prisma.interventionOverride.upsert({
      where: { stepId },
      create: {
        stepId,
        patientId: body.patientId,
        status: body.status,
        escalatedTo: body.escalatedTo ?? null,
        updatedBy: auth.user.id,
      },
      update: {
        status: body.status,
        escalatedTo: body.escalatedTo ?? null,
        updatedBy: auth.user.id,
      },
    });

    await audit(
      {
        userId: auth.user.id,
        action:
          body.status === "escalated"
            ? "intervention.escalate"
            : "intervention.status",
        entityType: "intervention",
        entityId: stepId,
        prev: { status: prev?.status ?? "in_progress" },
        next: { status: body.status, escalatedTo: body.escalatedTo },
        sessionId: auth.sid,
      },
      req,
    );

    return ok({ override: row });
  },
);

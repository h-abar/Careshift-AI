import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import type { InterventionStatus, Role } from "@/lib/types";

/** Persists an intervention step outcome (done / overdue / escalated). */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ stepId: string }> }) => {
    const auth = await requirePerm("intervention_execute");
    const { stepId } = await ctx.params;
    const body = (await req.json()) as {
      patientId?: string;
      status?: InterventionStatus;
      escalatedTo?: Role;
    };
    if (!body.patientId || !body.status) {
      return Response.json({ error: "patientId + status required" }, { status: 400 });
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

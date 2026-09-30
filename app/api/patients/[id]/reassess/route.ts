import { requirePerm } from "@/lib/server/session";
import { dbPatient, invalidateSnapshots } from "@/lib/server/data";
import { runRiskAssessment } from "@/lib/server/risk";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/** Manual risk reassessment — recomputes, persists, alerts on crossing. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("risk_view");
    const { id } = await ctx.params;
    const patient = await dbPatient(id);
    if (!patient) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    const { risk, crossedUp } = await runRiskAssessment(patient);
    invalidateSnapshots();
    await audit(
      {
        userId: auth.user.id,
        action: "risk.reassess",
        entityType: "patient",
        entityId: id,
        next: { score: risk.score, level: risk.level, crossedUp },
        sessionId: auth.sid,
      },
      req,
    );

    const history = await prisma.riskAssessment.findMany({
      where: { patientId: id },
      orderBy: { assessedAt: "desc" },
      take: 12,
    });
    return ok({
      risk,
      crossedUp,
      riskHistory: history.map((r) => ({
        score: r.score,
        level: r.level,
        assessedAt: r.assessedAt.toISOString(),
      })),
    });
  },
);

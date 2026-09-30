import { prisma } from "@/lib/server/prisma";
import { requirePerm } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/** Charge nurse creates a handoff: dept + shift + staff pair + patients. */
export const POST = handle(async (req: Request) => {
  const auth = await requirePerm("handoff_manage");
  const body = (await req.json()) as {
    dept?: string;
    shift?: "day" | "night";
    outgoingId?: string;
    incomingId?: string;
    patientIds?: string[];
  };
  if (
    !body.dept || !body.shift || !body.outgoingId || !body.incomingId ||
    !body.patientIds?.length
  ) {
    return Response.json({ error: "incomplete" }, { status: 400 });
  }
  if (body.outgoingId === body.incomingId) {
    return Response.json(
      { error: "outgoing and incoming must differ" },
      { status: 400 },
    );
  }

  // Referential validation — staff must exist and be active, patients real.
  const [out, inc, patients] = await Promise.all([
    prisma.user.findUnique({ where: { id: body.outgoingId } }),
    prisma.user.findUnique({ where: { id: body.incomingId } }),
    prisma.patient.findMany({ where: { id: { in: body.patientIds } } }),
  ]);
  if (
    !out || !inc ||
    out.status !== "active" || inc.status !== "active" ||
    patients.length !== body.patientIds.length
  ) {
    return Response.json(
      { error: "invalid staff or patient references" },
      { status: 400 },
    );
  }

  const id = `HF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const h = await prisma.handoff.create({
    data: {
      id,
      dept: body.dept,
      shift: body.shift,
      date: new Date().toISOString().slice(0, 10),
      outgoingId: body.outgoingId,
      incomingId: body.incomingId,
      patientIdsJson: JSON.stringify(body.patientIds),
      status: "pending",
      reviewedJson: "{}",
      checklistJson: "[]",
      timelineJson: JSON.stringify([
        { t: new Date().toISOString().slice(11, 16), key: "hftl.created" },
      ]),
    },
  });

  await audit(
    {
      userId: auth.user.id,
      action: "handoff.create",
      entityType: "handoff",
      entityId: id,
      next: {
        from: body.outgoingId,
        to: body.incomingId,
        patients: body.patientIds.length,
      },
      sessionId: auth.sid,
    },
    req,
  );

  return ok({ handoff: h });
});

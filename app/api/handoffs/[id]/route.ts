import { requirePerm } from "@/lib/server/session";
import { dbHandoffs, dbSnapshots, dbUsers } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("handoff_view");
    const { id } = await ctx.params;
    const [records, snaps, users] = await Promise.all([
      dbHandoffs(),
      dbSnapshots(),
      dbUsers(),
    ]);
    const handoff = records.find((h) => h.id === id);
    if (!handoff) return Response.json({ error: "not found" }, { status: 404 });
    return ok({
      handoff,
      users,
      snaps: snaps.filter((s) => handoff.patientIds.includes(s.patient.id)),
    });
  },
);

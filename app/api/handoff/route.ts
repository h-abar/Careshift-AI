import { requirePerm } from "@/lib/server/session";
import { dbSnapshots } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { handle, ok } from "@/lib/server/json";

/** Smart Handoff context — shift pair + live census snapshots. */
export const GET = handle(async () => {
  await requirePerm("handoff_view");
  const row = await prisma.shiftHandoff.findFirst({ orderBy: { id: "asc" } });
  return ok({
    ho: row
      ? {
          id: row.id,
          fromShift: { en: row.fromShiftEn, ar: row.fromShiftAr },
          toShift: { en: row.toShiftEn, ar: row.toShiftAr },
          at: row.at,
          outgoingTeam: row.outgoingTeam,
          incomingTeam: row.incomingTeam,
        }
      : null,
    snaps: await dbSnapshots(),
  });
});

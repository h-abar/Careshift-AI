import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requireAuth();
  const rows = await prisma.notification.findMany({ orderBy: { min: "asc" } });
  return ok({
    notifications: rows.map((n) => ({
      id: n.id,
      level: n.level,
      key: n.key,
      patientId: n.patientId ?? undefined,
      min: n.min,
      read: n.read,
    })),
  });
});

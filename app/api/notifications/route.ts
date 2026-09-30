import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  const auth = await requireAuth();
  // Per-user notifications + unit-wide broadcasts (userId = null).
  const rows = await prisma.notification.findMany({
    where: {
      OR: [{ userId: auth.user.id }, { userId: null }],
      dismissed: false,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({
    notifications: rows.map((n) => ({
      id: n.id,
      level: n.level,
      key: n.key,
      detail: n.detail,
      patientId: n.patientId ?? undefined,
      entityType: n.entityType ?? undefined,
      entityId: n.entityId ?? undefined,
      min: n.min,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unread: rows.filter((n) => !n.read).length,
  });
});

/** Mark every one of MY notifications read. */
export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  const res = await prisma.notification.updateMany({
    where: { userId: auth.user.id, read: false },
    data: { read: true },
  });
  await audit(
    {
      userId: auth.user.id,
      action: "alert.read_all",
      entityType: "notification",
      entityId: "-",
      next: { marked: res.count },
      sessionId: auth.sid,
    },
    req,
  );
  return ok({ marked: res.count });
});

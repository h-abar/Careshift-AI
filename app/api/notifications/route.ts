import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  const auth = await requireAuth();
  // Per-user receipts only — one notification per recipient, read/dismiss
  // state lives on the receipt so users never see each other's state.
  const rows = await prisma.notificationReceipt.findMany({
    where: { userId: auth.user.id, dismissedAt: null },
    include: { notification: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({
    notifications: rows.map((r) => ({
      id: r.notificationId,
      level: r.notification.level,
      key: r.notification.key,
      detail: r.notification.detail,
      patientId: r.notification.patientId ?? undefined,
      entityType: r.notification.entityType ?? undefined,
      entityId: r.notification.entityId ?? undefined,
      min: r.notification.min,
      read: r.readAt !== null,
      createdAt: r.notification.createdAt.toISOString(),
    })),
    unread: rows.filter((r) => r.readAt === null).length,
  });
});

/** Mark every one of MY receipts read. */
export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  const res = await prisma.notificationReceipt.updateMany({
    where: { userId: auth.user.id, readAt: null },
    data: { readAt: new Date() },
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

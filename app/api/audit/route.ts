import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("audit_view");
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);

  const [entries, users] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        userId: userId ? { contains: userId } : undefined,
        action: action ? { contains: action } : undefined,
        entityId: entityId ? { contains: entityId } : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.user.findMany({ select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u]));
  await audit(
    {
      userId: auth.user.id,
      action: "audit.list",
      entityType: "audit",
      entityId: "list",
      sessionId: auth.sid,
    },
    req,
  );
  return ok({
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: name.get(e.userId)?.nameEn ?? e.userId,
      userNameAr: name.get(e.userId)?.nameAr ?? e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      prev: e.prevJson ? JSON.parse(e.prevJson) : null,
      next: e.nextJson ? JSON.parse(e.nextJson) : null,
      ip: e.ip,
      sessionId: e.sessionId,
      createdAt: e.createdAt,
    })),
  });
});

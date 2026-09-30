import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("audit_view");
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 20),
  );

  // The user filter matches names too — resolve matching user ids first.
  let matchIds: string[] | undefined;
  if (userId) {
    matchIds = (
      await prisma.user.findMany({
        where: {
          OR: [
            { id: { contains: userId } },
            { username: { contains: userId } },
            { nameEn: { contains: userId } },
            { nameAr: { contains: userId } },
          ],
        },
        select: { id: true },
      })
    ).map((u) => u.id);
  }
  const where = {
    userId: userId ? { in: matchIds } : undefined,
    action: action ? { contains: action } : undefined,
    entityId: entityId ? { contains: entityId } : undefined,
  };
  const [total, entries, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.findMany({ select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u]));
  await auditOnce(
    auth.user.id, "audit.list", "audit", "list",
    auditDedupeMin(), auth.sid, req,
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
    total,
    page,
    pageSize,
  });
});

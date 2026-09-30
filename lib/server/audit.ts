import { headers } from "next/headers";
import { prisma } from "@/lib/server/prisma";

/** Writes an AuditLog row. Failures never break the request. */
export async function audit(
  e: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    prev?: unknown;
    next?: unknown;
    sessionId?: string;
  },
  req?: Request,
) {
  try {
    const h = req
      ? req.headers
      : await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      "local";
    await prisma.auditLog.create({
      data: {
        userId: e.userId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        prevJson: e.prev === undefined ? null : JSON.stringify(e.prev),
        nextJson: e.next === undefined ? null : JSON.stringify(e.next),
        ip,
        sessionId: e.sessionId,
      },
    });
  } catch (err) {
    console.error("audit failed:", err);
  }
}

/**
 * Deduped audit — writes only if the same user didn't record the same
 * action on the same entity within `windowMin`. Keeps list/page views
 * honest without flooding the trail on every poll/refetch.
 */
export async function auditOnce(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  windowMin: number,
  sessionId?: string,
  req?: Request,
) {
  try {
    const since = new Date(Date.now() - windowMin * 60 * 1000);
    const recent = await prisma.auditLog.findFirst({
      where: { userId, action, entityId, createdAt: { gt: since } },
    });
    if (recent) return;
    await audit(
      { userId, action, entityType, entityId, sessionId },
      req,
    );
  } catch (err) {
    console.error("audit failed:", err);
  }
}

import { cookies } from "next/headers";
import { prisma } from "@/lib/server/prisma";
import {
  requireAuth,
  signSession,
  SESSION_COOKIE,
  sessionTtlMs,
  tenantBadge,
} from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { dbUser } from "@/lib/server/data";
import type { User } from "@/lib/types";

/**
 * End "view as" — restores the original admin onto the same Session row
 * (Session.impersonatorId holds the way back) and re-signs the JWT.
 */
export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  const session = await prisma.session.findUnique({
    where: { id: auth.sid },
    include: { user: true },
  });
  if (!session?.impersonatorId) {
    return Response.json({ error: "not_impersonating" }, { status: 409 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.impersonatorId },
  });
  if (!admin || admin.status !== "active") {
    return Response.json({ error: "impersonator unavailable" }, { status: 404 });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { userId: admin.id, impersonatorId: null },
  });
  const token = await signSession({
    sub: admin.id,
    sid: session.id,
    role: admin.roleKey as User["role"],
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlMs / 1000,
  });

  await audit(
    {
      userId: admin.id,
      action: "auth.switch_end",
      entityType: "user",
      entityId: session.userId,
      prev: { as: session.userId },
      next: { as: admin.id },
      sessionId: session.id,
    },
    req,
  );

  const restored = await dbUser(admin.id);
  return ok({
    user: restored,
    impersonator: null,
    tenant: restored ? await tenantBadge(restored.tenantId) : null,
  });
});

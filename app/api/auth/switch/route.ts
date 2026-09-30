import { cookies } from "next/headers";
import { prisma } from "@/lib/server/prisma";
import {
  ApiError,
  requireAuth,
  signSession,
  SESSION_COOKIE,
  sessionTtlMs,
} from "@/lib/server/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import { dbUser } from "@/lib/server/data";
import type { User } from "@/lib/types";

/**
 * Admin "view as" — replaces the active session's user with the target,
 * recording the impersonator on the Session row and in the audit trail.
 */
export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  if (auth.impersonator) {
    // Already viewing as someone — end that session before starting a new one.
    return Response.json({ error: "already_impersonating" }, { status: 409 });
  }
  if (!can(auth.user.role, "users_manage")) {
    // admins only — a nurse can never start a view-as session
    throw new ApiError(403, "forbidden");
  }
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.status !== "active") {
    return Response.json({ error: "user not found" }, { status: 404 });
  }

  const session = await prisma.session.update({
    where: { id: auth.sid },
    data: { userId: target.id, impersonatorId: auth.user.id },
  });
  const token = await signSession({
    sub: target.id,
    sid: session.id,
    role: target.roleKey as User["role"],
    imp: auth.user.id,
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
      userId: auth.user.id,
      action: "auth.switch",
      entityType: "user",
      entityId: target.id,
      prev: { as: auth.user.id },
      next: { as: target.id },
      sessionId: auth.sid,
    },
    req,
  );

  return ok({ user: await dbUser(target.id), impersonator: auth.user });
});

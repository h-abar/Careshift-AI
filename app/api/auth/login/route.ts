import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/server/prisma";
import { signSession, SESSION_COOKIE, sessionTtlMs } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { clientIp, isLocked, recordAttempt } from "@/lib/server/lockout";
import { handle, ok, parseBody } from "@/lib/server/json";
import { loginSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";

export const POST = handle(async (req: Request) => {
  const { data, error } = await parseBody(req, loginSchema);
  if (error) return error;
  const { username, password } = data;
  const name = username.trim().toLowerCase();
  const ip = clientIp(req);

  // DB-backed lockout — per-username (any IP) OR per-username+IP.
  if (await isLocked(name, ip)) {
    await audit(
      { userId: name, action: "auth.locked", entityType: "session", entityId: "-" },
      req,
    );
    return Response.json({ error: "locked" }, { status: 429 });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: name }, { email: name }] },
  });

  const valid =
    user &&
    user.status === "active" &&
    (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    await recordAttempt(name, ip, false);
    await audit(
      {
        userId: user?.id ?? name,
        action: "auth.login_failed",
        entityType: "session",
        entityId: "-",
      },
      req,
    );
    if (await isLocked(name, ip)) {
      await audit(
        {
          userId: user?.id ?? name,
          action: "auth.locked",
          entityType: "session",
          entityId: "-",
        },
        req,
      );
      return Response.json({ error: "locked" }, { status: 429 });
    }
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  await recordAttempt(name, ip, true);

  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + sessionTtlMs),
      ip,
      userAgent: req.headers.get("user-agent") ?? "",
    },
  });
  const token = await signSession({
    sub: user.id,
    sid: session.id,
    role: user.roleKey as User["role"],
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlMs / 1000,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit(
    {
      userId: user.id,
      action: "auth.login",
      entityType: "session",
      entityId: session.id,
      sessionId: session.id,
    },
    req,
  );

  return ok({
    user: {
      id: user.id,
      username: user.username,
      nameEn: user.nameEn,
      nameAr: user.nameAr,
      role: user.roleKey,
      dept: user.dept,
      specialty: { en: user.specialtyEn, ar: user.specialtyAr },
      email: user.email,
      phone: user.phone,
      employeeId: user.employeeId,
      status: user.status,
      lastLoginMin: 0 as number | null,
      createdAt: user.createdAt.toISOString().slice(0, 10),
    },
  });
});

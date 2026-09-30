import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/server/prisma";
import { signSession, SESSION_COOKIE, sessionTtlMs } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";
import type { User } from "@/lib/types";

export const POST = handle(async (req: Request) => {
  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return Response.json({ error: "missing credentials" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username.trim().toLowerCase() },
        { email: username.trim().toLowerCase() },
      ],
    },
  });

  const valid =
    user && user.status === "active" &&
    (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    await audit(
      {
        userId: user?.id ?? username,
        action: "auth.login_failed",
        entityType: "session",
        entityId: "-",
      },
      req,
    );
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + sessionTtlMs),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
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
      lastLoginMin: 0,
      createdAt: user.createdAt.toISOString().slice(0, 10),
    },
  });
});

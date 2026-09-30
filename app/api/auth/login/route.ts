import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/server/prisma";
import { signSession, SESSION_COOKIE, sessionTtlMs } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { clientIp, lockState, recordAttempt } from "@/lib/server/lockout";
import { captchaVerifier } from "@/lib/server/captcha";
import { handle, ok, parseBody } from "@/lib/server/json";
import { loginSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { rateGuard } from "@/lib/server/ratelimit";

export const POST = handle(async (req: Request) => {
  const { data, error } = await parseBody(req, loginSchema);
  if (error) return error;
  const { username, password, captchaToken } = data;
  const name = username.trim().toLowerCase();
  const ip = clientIp(req.headers);

  const rg = await rateGuard(`${name}:${ip}`, "login");
  if (rg) return rg;

  // DB-backed lockout — per-username+IP is absolute; the sprayable
  // per-username-any-IP lock degrades to a CAPTCHA challenge when a
  // verifier is configured, so it cannot deny a known user forever (0.6).
  let lock = await lockState(name, ip);
  const verifier = captchaVerifier();
  const captchaOk =
    lock.userLocked &&
    !lock.pairLocked &&
    verifier !== null &&
    captchaToken !== undefined &&
    (await verifier.verify(captchaToken, ip));
  if (lock.pairLocked || (lock.userLocked && !captchaOk)) {
    await audit(
      { userId: name, action: "auth.locked", entityType: "session", entityId: "-" },
      req,
    );
    return Response.json(
      {
        error: "locked",
        ...(verifier && !lock.pairLocked ? { code: "captcha_required" } : {}),
      },
      { status: 429, headers: { "Retry-After": String(lock.retryAfterSeconds || 60) } },
    );
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
    lock = await lockState(name, ip);
    if (lock.pairLocked || (lock.userLocked && !captchaOk)) {
      await audit(
        {
          userId: user?.id ?? name,
          action: "auth.locked",
          entityType: "session",
          entityId: "-",
        },
        req,
      );
      return Response.json(
        {
          error: "locked",
          ...(verifier && !lock.pairLocked ? { code: "captcha_required" } : {}),
        },
        { status: 429, headers: { "Retry-After": String(lock.retryAfterSeconds || 60) } },
      );
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

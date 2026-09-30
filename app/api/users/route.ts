import { requirePerm } from "@/lib/server/session";
import { dbUsers } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { audit, auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { userCreateSchema } from "@/lib/schemas";
import { LOCKOUT_MAX_FAILS, LOCKOUT_WINDOW_MS } from "@/lib/server/lockout";
import bcrypt from "bcryptjs";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("users_manage");
  const [users, lockedNames] = await Promise.all([
    dbUsers(),
    prisma.loginAttempt
      .groupBy({
        by: ["username"],
        where: {
          success: false,
          createdAt: { gt: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
        },
        _count: true,
      })
      .then((rows) =>
        new Set(
          rows
            .filter((r) => r._count >= LOCKOUT_MAX_FAILS)
            .map((r) => r.username),
        ),
      ),
  ]);
  await auditOnce(
    auth.user.id, "users.list", "user", "list",
    auditDedupeMin(), auth.sid, req,
  );
  return ok({
    users: users.map((u) => ({ ...u, locked: lockedNames.has(u.username) })),
  });
});

/** User-admin: create an account (bcrypt-hashed password, audited). */
export const POST = handle(async (req: Request) => {
  const auth = await requirePerm("users_manage");
  const { data: b, error } = await parseBody(req, userCreateSchema);
  if (error) return error;

  const username = b.username.trim().toLowerCase();
  const clash = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        { employeeId: b.employeeId },
        ...(b.email ? [{ email: b.email.trim().toLowerCase() }] : []),
      ],
    },
  });
  if (clash) {
    return Response.json({ error: "username/employeeId/email taken" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      id: `U-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      username,
      passwordHash: await bcrypt.hash(b.password, 10),
      nameEn: b.nameEn,
      nameAr: b.nameAr,
      roleKey: b.roleKey,
      dept: b.dept,
      specialtyEn: "",
      specialtyAr: "",
      email: b.email?.trim().toLowerCase() || `${username}@careshift.demo`,
      phone: b.phone ?? "",
      employeeId: b.employeeId,
      status: "active",
    },
  });

  await audit(
    {
      userId: auth.user.id,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      next: { username: user.username, role: user.roleKey, dept: user.dept },
      sessionId: auth.sid,
    },
    req,
  );
  return ok({ id: user.id }, { status: 201 });
});

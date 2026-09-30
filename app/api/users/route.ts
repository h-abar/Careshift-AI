import { requirePerm } from "@/lib/server/session";
import { toUser } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { audit, auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok, parseBody } from "@/lib/server/json";
import { userCreateSchema } from "@/lib/schemas";
import { LOCKOUT_MAX_FAILS, LOCKOUT_WINDOW_MS } from "@/lib/server/lockout";
import bcrypt from "bcryptjs";
import { rateGuard } from "@/lib/server/ratelimit";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("users_manage");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const role = url.searchParams.get("role") ?? "";
  const dept = url.searchParams.get("dept") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 25),
  );
  const where = {
    ...(role && { roleKey: role }),
    ...(dept && { dept }),
    ...(status && { status }),
    ...(q && {
      OR: [
        { username: { contains: q } },
        { nameEn: { contains: q } },
        { nameAr: { contains: q } },
        { employeeId: { contains: q } },
      ],
    }),
  };
  const [total, rows, lockedNames] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
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
    users: rows
      .map(toUser)
      .map((u) => ({ ...u, locked: lockedNames.has(u.username) })),
    total,
    page,
    pageSize,
  });
});

/** User-admin: create an account (bcrypt-hashed password, audited). */
export const POST = handle(async (req: Request) => {
  const auth = await requirePerm("users_manage");
  const rg = await rateGuard(auth.user.id, "userAdmin");
  if (rg) return rg;

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

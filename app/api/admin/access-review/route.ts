import { requirePerm } from "@/lib/server/session";
import { ApiError } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { handle } from "@/lib/server/json";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Access-review report (item 7, NCA ECC): every account with role,
 * granted permissions, last login and a dormant flag (DORMANT_DAYS,
 * default 90). Exportable CSV/JSON; the export itself is audited.
 */
export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("users_manage");
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "json"].includes(format)) {
    throw new ApiError(400, "format must be csv|json");
  }
  const dormantDays = Math.max(1, Number(process.env.DORMANT_DAYS) || 90);
  const cutoff = Date.now() - dormantDays * 86_400_000;

  const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  const rows = users.map((u) => {
    const perms =
      ROLE_PERMISSIONS[u.roleKey as keyof typeof ROLE_PERMISSIONS] ?? {};
    const lastLogin = u.lastLoginAt?.toISOString() ?? "";
    return {
      id: u.id,
      username: u.username,
      nameEn: u.nameEn,
      nameAr: u.nameAr,
      role: u.roleKey,
      dept: u.dept,
      status: u.status,
      employeeId: u.employeeId,
      lastLoginAt: lastLogin,
      dormant: u.lastLoginAt ? u.lastLoginAt.getTime() < cutoff : true,
      permissions: PERMISSION_KEYS.filter((k) => perms[k]).join(" "),
    };
  });

  await audit(
    {
      userId: auth.user.id,
      action: "admin.access_review",
      entityType: "user",
      entityId: "*",
      next: { format, dormantDays, accounts: rows.length },
      sessionId: auth.sid,
    },
    req,
  );

  if (format === "json") {
    return Response.json(
      {
        exportedAt: new Date().toISOString(),
        dormantDays,
        accounts: rows,
      },
      {
        headers: {
          "content-disposition": 'attachment; filename="access-review.json"',
        },
      },
    );
  }
  const head =
    "id,username,nameEn,nameAr,role,dept,status,employeeId,lastLoginAt,dormant,permissions\n";
  const body = rows
    .map((r) =>
      [
        r.id, r.username, r.nameEn, r.nameAr, r.role, r.dept, r.status,
        r.employeeId, r.lastLoginAt, r.dormant, r.permissions,
      ]
        .map(esc)
        .join(","),
    )
    .join("\n");
  return new Response(head + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="access-review.csv"',
      "x-content-type-options": "nosniff",
    },
  });
});

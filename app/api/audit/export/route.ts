import { requirePerm } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/session";
import { handle } from "@/lib/server/json";

const MAX_ROWS = 50_000;

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Audit export (item 7) — CSV or JSON, filtered, admin-only, audited. */
export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("audit_view");
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userId = url.searchParams.get("userId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  if (!["csv", "json"].includes(format)) {
    throw new ApiError(400, "format must be csv|json");
  }
  const where = {
    userId,
    action: action ? { contains: action } : undefined,
    createdAt: {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    },
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  // The export itself is a disclosure event — audit it with the filters.
  await audit(
    {
      userId: auth.user.id,
      action: "audit.export",
      entityType: "audit",
      entityId: "audit_log",
      next: { format, from, to, userId, action, rows: rows.length },
      sessionId: auth.sid,
    },
    req,
  );

  if (format === "json") {
    return Response.json(
      { exportedAt: new Date().toISOString(), rows },
      { headers: { "content-disposition": 'attachment; filename="audit.json"' } },
    );
  }
  const head = "createdAt,userId,action,entityType,entityId,ip,sessionId\n";
  const body = rows
    .map((r) =>
      [
        r.createdAt.toISOString(),
        r.userId,
        r.action,
        r.entityType,
        r.entityId,
        r.ip ?? "",
        r.sessionId ?? "",
      ]
        .map(esc)
        .join(","),
    )
    .join("\n");
  return new Response(head + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="audit.csv"',
      "x-content-type-options": "nosniff",
    },
  });
});

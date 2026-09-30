import { requirePerm } from "@/lib/server/session";
import { dbUser } from "@/lib/server/data";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

const ROLES = new Set([
  "admin", "physician", "nurse", "charge_nurse", "insurance", "hospital_admin",
]);
const STATUSES = new Set(["active", "suspended"]);

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requirePerm("users_manage");
    const { id } = await ctx.params;
    const user = await dbUser(id);
    if (!user) return Response.json({ error: "not found" }, { status: 404 });
    return ok({ user });
  },
);

/** User-admin: edit role / dept / status / names — fully audited prev→next. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requirePerm("users_manage");
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => ({}))) as {
      nameEn?: string;
      nameAr?: string;
      roleKey?: string;
      dept?: string;
      status?: string;
    };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return Response.json({ error: "not found" }, { status: 404 });
    if (b.roleKey !== undefined && !ROLES.has(b.roleKey)) {
      return Response.json({ error: "invalid role" }, { status: 400 });
    }
    if (b.status !== undefined && !STATUSES.has(b.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    // An admin cannot suspend the account they are logged in with.
    if (b.status === "suspended" && id === auth.user.id) {
      return Response.json({ error: "cannot suspend self" }, { status: 400 });
    }

    // Never allow demoting or suspending the LAST active admin — that
    // would brick all user administration. Attempts are audited.
    const wouldDemote =
      b.roleKey !== undefined && b.roleKey !== "admin" && user.roleKey === "admin";
    const wouldSuspend =
      b.status === "suspended" && user.status !== "suspended";
    if ((wouldDemote || wouldSuspend) && user.roleKey === "admin") {
      const activeAdmins = await prisma.user.count({
        where: { roleKey: "admin", status: "active" },
      });
      if (activeAdmins <= 1) {
        await audit(
          {
            userId: auth.user.id,
            action: "user.last_admin_blocked",
            entityType: "user",
            entityId: id,
            next: { attemptedRole: b.roleKey, attemptedStatus: b.status },
            sessionId: auth.sid,
          },
          req,
        );
        return Response.json(
          { error: "cannot modify the last active admin" },
          { status: 400 },
        );
      }
    }

    const suspending = b.status === "suspended" && user.status !== "suspended";
    const roleChanged = b.roleKey !== undefined && b.roleKey !== user.roleKey;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        nameEn: b.nameEn ?? undefined,
        nameAr: b.nameAr ?? undefined,
        roleKey: b.roleKey ?? undefined,
        dept: b.dept ?? undefined,
        status: b.status ?? undefined,
      },
    });

    // Suspension or role change kills all of the user's live sessions so
    // the new permissions/status apply immediately (getAuth would 401 a
    // suspended user anyway — this also covers JWT role staleness).
    if (suspending || roleChanged) {
      const del = await prisma.session.deleteMany({ where: { userId: id } });
      await audit(
        {
          userId: auth.user.id,
          action: "user.sessions_revoked",
          entityType: "user",
          entityId: id,
          next: {
            revoked: del.count,
            reason: suspending ? "suspended" : "role_changed",
          },
          sessionId: auth.sid,
        },
        req,
      );
    }

    await audit(
      {
        userId: auth.user.id,
        action: "user.update",
        entityType: "user",
        entityId: id,
        prev: {
          role: user.roleKey, dept: user.dept, status: user.status,
          nameEn: user.nameEn, nameAr: user.nameAr,
        },
        next: {
          role: updated.roleKey, dept: updated.dept, status: updated.status,
          nameEn: updated.nameEn, nameAr: updated.nameAr,
        },
        sessionId: auth.sid,
      },
      req,
    );
    return ok({ user: await dbUser(id) });
  },
);

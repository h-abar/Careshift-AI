import { prisma } from "@/lib/server/prisma";
import { can, type PermKey } from "@/lib/permissions";
import type { RoleKey } from "@/lib/types";

export type NotifyLevel = "critical" | "warning" | "info";

export interface NotifyOpts {
  patientId?: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
  min?: number;
}

/**
 * Active users holding a permission. When `patientLinked` is set the
 * audience is additionally restricted to `patients_view` holders — a
 * patient-linked notification must never reach a role that cannot view
 * patients (e.g. the insurance reviewer).
 */
export async function usersWithPerm(
  perm: PermKey,
  opts?: { patientLinked?: boolean },
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true, roleKey: true },
  });
  return users
    .filter(
      (u) =>
        can(u.roleKey as RoleKey, perm) &&
        (!opts?.patientLinked || can(u.roleKey as RoleKey, "patients_view")),
    )
    .map((u) => u.id);
}

async function roleOf(userId: string): Promise<RoleKey | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { roleKey: true, status: true },
  });
  return u && u.status === "active" ? (u.roleKey as RoleKey) : null;
}

async function createFor(
  userIds: string[],
  key: string,
  level: NotifyLevel,
  opts?: NotifyOpts,
) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return null;
  try {
    const n = await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        key,
        level,
        patientId: opts?.patientId ?? null,
        entityType: opts?.entityType ?? null,
        entityId: opts?.entityId ?? null,
        detail: opts?.detail ?? "",
        min: opts?.min ?? 0,
        receipts: {
          create: unique.map((userId) => ({ id: crypto.randomUUID(), userId })),
        },
      },
    });
    return n;
  } catch (err) {
    // Notifications must never break the triggering workflow.
    console.error("notify failed:", err);
    return null;
  }
}

/**
 * Notify ONE user. `key` is an i18n template that may embed `{id}`
 * (entityId / patientId) and `{detail}` placeholders — resolved in the
 * client so one key serves every language. Patient-linked notifications
 * are dropped for users without `patients_view`.
 */
export async function notify(
  userId: string,
  key: string,
  level: NotifyLevel,
  opts?: NotifyOpts,
) {
  const role = await roleOf(userId);
  if (!role) return null;
  if (opts?.patientId && !can(role, "patients_view")) return null;
  return createFor([userId], key, level, opts);
}

/** Notify every active user holding `perm` (audience resolved now). */
export async function notifyPerm(
  perm: PermKey,
  key: string,
  level: NotifyLevel,
  opts?: NotifyOpts & { excludeUserId?: string },
) {
  let ids = await usersWithPerm(perm, { patientLinked: !!opts?.patientId });
  if (opts?.excludeUserId) ids = ids.filter((id) => id !== opts.excludeUserId);
  return createFor(ids, key, level, opts);
}

/** Notify an explicit user list (e.g. handoff parties, assignees). */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  key: string,
  level: NotifyLevel,
  opts?: NotifyOpts,
) {
  const ids = (await Promise.all(userIds.map(async (id) => {
    if (!id) return null;
    const role = await roleOf(id);
    if (!role) return null;
    if (opts?.patientId && !can(role, "patients_view")) return null;
    return id;
  }))).filter((x): x is string => Boolean(x));
  return createFor(ids, key, level, opts);
}

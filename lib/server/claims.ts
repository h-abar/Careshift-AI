import { prisma } from "@/lib/server/prisma";
import { notify } from "@/lib/server/notify";
import { can } from "@/lib/permissions";
import type { RoleKey } from "@/lib/types";

/**
 * Append a row to the per-claim history timeline.
 */
export async function claimEvent(
  claimId: string,
  actorId: string,
  action: string,
  detail = "",
) {
  await prisma.claimEvent.create({
    data: { claimId, actorId, action, detail },
  });
}

/**
 * Notify every active user who can view insurance claims (minus the actor)
 * that a claim changed — real trigger for the notifications center.
 */
export async function notifyClaimWatchers(
  claimId: string,
  actorId: string,
  level: "critical" | "warning" | "info",
  detail = "",
) {
  const viewers = await prisma.user.findMany({
    where: { status: "active", id: { not: actorId } },
    select: { id: true, roleKey: true },
  });
  for (const u of viewers) {
    if (!can(u.roleKey as RoleKey, "insurance_view")) continue;
    await notify(u.id, "notif.claimStatus", level, {
      entityType: "claim",
      entityId: claimId,
      detail,
    });
  }
}

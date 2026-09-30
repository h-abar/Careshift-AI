import { prisma } from "@/lib/server/prisma";
import { notifyPerm } from "@/lib/server/notify";

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
  await notifyPerm("insurance_view", "notif.claimStatus", level, {
    entityType: "claim",
    entityId: claimId,
    detail,
    excludeUserId: actorId,
  });
}

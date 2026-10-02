import { prisma } from "@/lib/server/prisma";
import { notifyPerm } from "@/lib/server/notify";
import { ApiError, type AuthContext } from "@/lib/server/session";

/**
 * E1/E7 — payer users are external and see ONLY claims submitted to their
 * organization. payerWhere() narrows list queries; assertPayerClaim()
 * 403s any attempt to touch a claim owned by a different payer.
 */
export function payerWhere(auth: AuthContext): { payerOrg?: string } {
  return auth.user.role === "payer"
    ? { payerOrg: auth.user.payerOrg ?? "__none__" }
    : {};
}

export function assertPayerClaim(
  auth: AuthContext,
  claim: { payerOrg: string | null } | null,
): void {
  if (
    auth.user.role === "payer" &&
    (!claim || claim.payerOrg !== auth.user.payerOrg)
  ) {
    throw new ApiError(403, "forbidden");
  }
}

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
  await notifyPerm("claims_view", "notif.claimStatus", level, {
    entityType: "claim",
    entityId: claimId,
    detail,
    excludeUserId: actorId,
  });
}

import { requireAnyPerm } from "@/lib/server/session";
import { can } from "@/lib/permissions";
import { dbOrgStats } from "@/lib/server/data";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/**
 * Org aggregates. Patient-level rows are ONLY included for roles holding
 * patients_view — oversight roles receive aggregates + the claim-linked
 * minimum-necessary list instead (see lib/server/data.ts).
 */
export const GET = handle(async (req: Request) => {
  const auth = await requireAnyPerm([
    "patients_view", "insurance_view", "reports_view", "command_view",
  ]);
  const org = await dbOrgStats({
    includeSnaps: can(auth.user.role, "patients_view"),
  });
  await auditOnce(
    auth.user.id, "org.view", "org", "snapshots",
    auditDedupeMin(), auth.sid, req,
  );
  return ok(org);
});

import { requireAnyPerm } from "@/lib/server/session";
import { dbOrgStats } from "@/lib/server/data";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  // Org-level aggregates are consumed by command, insurance and reports —
  // any clinical/oversight role may read them.
  const auth = await requireAnyPerm([
    "patients_view", "insurance_view", "reports_view", "command_view",
  ]);
  const org = await dbOrgStats();
  await audit(
    {
      userId: auth.user.id,
      action: "org.view",
      entityType: "org",
      entityId: "snapshots",
      sessionId: auth.sid,
    },
    req,
  );
  return ok(org); // { snaps, clinical, operational, financial, value }
});

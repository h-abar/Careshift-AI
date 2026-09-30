import { requirePerm } from "@/lib/server/session";
import { dbOrgStats } from "@/lib/server/data";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("patients_view");
  const org = await dbOrgStats();
  return ok(org); // { snaps, clinical, operational, financial, value }
});

/**
 * C7 — claim/event KPIs computed live from the registry.
 * claims_view minimum — aggregates only, no patient-level data.
 */
import { requirePerm } from "@/lib/server/session";
import { claimKpis } from "@/lib/server/kpis";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("claims_view");
  return ok(await claimKpis());
});

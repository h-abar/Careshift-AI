import { requirePerm } from "@/lib/server/session";
import { dbClaims } from "@/lib/server/data";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { savingsTrend } from "@/lib/data/claims";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async () => {
  await requirePerm("insurance_view");
  const claims = dbClaims();
  return ok({
    claims: (await claims).map((c) => ({ ...c, readiness: claimReadiness(c) })),
    savingsTrend,
  });
});

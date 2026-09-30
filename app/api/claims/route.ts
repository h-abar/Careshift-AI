import { requirePerm } from "@/lib/server/session";
import { dbClaims } from "@/lib/server/data";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { auditOnce, auditDedupeMin } from "@/lib/server/audit";
import { savingsTrend } from "@/lib/data/claims";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("insurance_view");
  const claims = await dbClaims();
  await auditOnce(
    auth.user.id, "claims.list", "claim", "list",
    auditDedupeMin(), auth.sid, req,
  );
  return ok({
    claims: claims.map((c) => ({ ...c, readiness: claimReadiness(c) })),
    savingsTrend,
  });
});

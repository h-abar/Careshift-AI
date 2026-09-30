import { requirePerm } from "@/lib/server/session";
import { dbClaims } from "@/lib/server/data";
import { claimReadiness } from "@/lib/engines/claim-readiness";
import { audit } from "@/lib/server/audit";
import { savingsTrend } from "@/lib/data/claims";
import { handle, ok } from "@/lib/server/json";

export const GET = handle(async (req: Request) => {
  const auth = await requirePerm("insurance_view");
  const claims = await dbClaims();
  await audit(
    {
      userId: auth.user.id,
      action: "claims.list",
      entityType: "claim",
      entityId: "list",
      sessionId: auth.sid,
    },
    req,
  );
  return ok({
    claims: claims.map((c) => ({ ...c, readiness: claimReadiness(c) })),
    savingsTrend,
  });
});

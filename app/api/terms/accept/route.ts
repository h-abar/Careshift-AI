import { ok, handle } from "@/lib/server/json";
import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { toUser } from "@/lib/server/data";
import { TERMS_VERSION } from "@/lib/terms";

/** Records acceptance of the current terms version (audited). */
export const POST = handle(async () => {
  const auth = await requireAuth();

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
  });
  await audit({
    userId: auth.user.id,
    action: "terms.accept",
    entityType: "User",
    entityId: auth.user.id,
    next: { version: TERMS_VERSION },
    sessionId: auth.sid,
  });
  return ok({ user: toUser(user), version: TERMS_VERSION });
});

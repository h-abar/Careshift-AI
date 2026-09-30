import { requireAuth } from "@/lib/server/session";
import { prisma } from "@/lib/server/prisma";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

/** PDPL/7: records the user's demo-data disclaimer acknowledgement. */
export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  if (!auth.user.consentAt) {
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { consentAt: new Date() },
    });
    await audit(
      {
        userId: auth.user.id,
        action: "user.consent",
        entityType: "user",
        entityId: auth.user.id,
        sessionId: auth.sid,
      },
      req,
    );
  }
  return ok({ consentAt: new Date().toISOString() });
});

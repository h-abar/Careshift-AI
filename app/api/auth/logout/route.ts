import { cookies } from "next/headers";
import { prisma } from "@/lib/server/prisma";
import { SESSION_COOKIE, requireAuth } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { handle, ok } from "@/lib/server/json";

export const POST = handle(async (req: Request) => {
  const auth = await requireAuth();
  await prisma.session.delete({ where: { id: auth.sid } });
  (await cookies()).delete(SESSION_COOKIE);
  await audit(
    {
      userId: auth.user.id,
      action: "auth.logout",
      entityType: "session",
      entityId: auth.sid,
      sessionId: auth.sid,
    },
    req,
  );
  return ok({ ok: true });
});
